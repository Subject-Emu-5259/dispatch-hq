// ============================================
// Dispatch HQ — WebSocket Connection Manager
// ============================================

import type { WSContext } from 'hono/ws';
import type { ServerMessage, StateChange, UnitPositionMessage, UnitPositionBroadcast, OnlinePlayerPresence, PresenceActivity } from '@dispatch-hq/shared';
import { isUnitPositionBroadcast } from '@dispatch-hq/shared';
import {
  isPubSubReady,
  publishBroadcast,
  publishAllianceMessage,
  subscribeAllianceChannel,
  unsubscribeAllianceChannel,
  allianceIdFromChannel,
  publishViewport,
  deleteViewport,
  fetchViewport,
} from '../lib/pubsub';
import { withinThrottle, unitSpeedOk, viewportContains } from './unitPosition';

interface PositionState {
  lat: number;
  lng: number;
  at: number;
  seq: number;
}

class ConnectionManager {
  private connections = new Map<string, WSContext>();
  private playerMeta = new Map<string, { username: string; allianceId: string | null; level: number; city: string | null; activity: PresenceActivity }>();
  /** last validated position per unitId (throttle + speed check + seq source). */
  private unitPositions = new Map<string, PositionState>();
  /** viewport anchor per connected player (updated on viewport_update). */
  private viewports = new Map<string, { lat: number; lng: number; radiusKm: number }>();
  /** local member count per alliance (drives Redis channel subscribe/unsubscribe). */
  private allianceMemberCounts = new Map<string, number>();

  /**
   * Track a local alliance member delta and keep the Redis channel
   * subscription in sync: subscribe on 0→1, unsubscribe on 1→0. No-op when
   * Redis is unavailable (single-instance fallback stays in-memory).
   */
  private adjustAllianceMembership(allianceId: string | null, delta: number): void {
    if (!allianceId) return;
    const next = (this.allianceMemberCounts.get(allianceId) ?? 0) + delta;
    if (next <= 0) {
      this.allianceMemberCounts.delete(allianceId);
      unsubscribeAllianceChannel(allianceId);
    } else {
      const wasZero = !this.allianceMemberCounts.has(allianceId);
      this.allianceMemberCounts.set(allianceId, next);
      if (wasZero) subscribeAllianceChannel(allianceId);
    }
  }

  addConnection(playerId: string, ws: WSContext, meta?: { username: string; allianceId: string | null; level?: number }): void {
    this.connections.set(playerId, ws);
    if (meta) {
      this.playerMeta.set(playerId, {
        username: meta.username,
        allianceId: meta.allianceId,
        level: meta.level ?? 1,
        city: null,
        activity: 'idle',
      });
      this.adjustAllianceMembership(meta.allianceId, +1);
    }
  }

  setAlliance(playerId: string, allianceId: string | null): void {
    const prev = this.playerMeta.get(playerId);
    // Idempotent: repeated calls with the same alliance (e.g. reconnects or
    // route retries) must not churn the Redis subscribe/unsubscribe lifecycle.
    if (prev?.allianceId === allianceId) return;
    if (prev) {
      // Locally connected: swap membership counts old → new. Counts only
      // track LOCAL connections; REST routes may set meta for players whose
      // WS lives on another instance (no count here — addConnection counts
      // them once they actually connect to this instance).
      this.adjustAllianceMembership(prev.allianceId, -1);
      this.adjustAllianceMembership(allianceId, +1);
    }
    this.playerMeta.set(playerId, {
      username: prev?.username ?? 'Commander',
      allianceId,
      level: prev?.level ?? 1,
      city: prev?.city ?? null,
      activity: prev?.activity ?? 'idle',
    });
  }

  getAlliance(playerId: string): string | null {
    return this.playerMeta.get(playerId)?.allianceId ?? null;
  }

  removeConnection(playerId: string): void {
    const meta = this.playerMeta.get(playerId);
    this.connections.delete(playerId);
    this.playerMeta.delete(playerId);
    this.viewports.delete(playerId);
    if (meta?.allianceId) this.adjustAllianceMembership(meta.allianceId, -1);
    void deleteViewport(playerId);
  }

  /** Null out the alliance of every connected member (alliance dissolved). */
  clearAlliance(allianceId: string): void {
    for (const [playerId, meta] of this.playerMeta) {
      if (meta.allianceId === allianceId) {
        this.playerMeta.set(playerId, { ...meta, allianceId: null });
        this.adjustAllianceMembership(allianceId, -1);
      }
    }
  }

  /** Snapshot of who's online — with level, city, live activity, and each
   * commander's map viewport — for the players panel. The viewport lets the
   * client sort "near you" (same city or overlapping view) with no extra
   * round-trips (v0.22.18). */
  getPresence(): OnlinePlayerPresence[] {
    const out: OnlinePlayerPresence[] = [];
    for (const [playerId, meta] of this.playerMeta) {
      if (this.connections.has(playerId)) {
        const vp = this.viewports.get(playerId);
        out.push({
          playerId,
          username: meta?.username ?? 'Commander',
          allianceId: meta?.allianceId ?? null,
          level: meta?.level ?? 1,
          city: meta?.city ?? null,
          activity: meta?.activity ?? 'idle',
          view: vp ?? undefined,
        });
      }
    }
    return out;
  }

  /**
   * Update a connected commander's presence (city + activity, reported by
   * their client via presence_update). Returns true when something changed so
   * the caller can fan out an updated roster immediately.
   */
  updatePresence(playerId: string, p: { city: string | null; activity: PresenceActivity }): boolean {
    const meta = this.playerMeta.get(playerId);
    if (!meta) return false;
    if (meta.city === p.city && meta.activity === p.activity) return false;
    this.playerMeta.set(playerId, { ...meta, city: p.city, activity: p.activity });
    return true;
  }

  updateViewport(playerId: string, center: { lat: number; lng: number }, radiusKm: number): void {
    const vp = { ...center, radiusKm };
    this.viewports.set(playerId, vp);
    // Share the viewport cluster-wide so reconnect/failover can restore it.
    void publishViewport(playerId, vp);
  }

  /**
   * Restore a player's viewport from the shared Redis registry (if any) so
   * relay coverage survives a reconnect to a different instance or an
   * instance restart before the client re-sends viewport_update.
   */
  async restoreViewport(playerId: string): Promise<void> {
    const vp = await fetchViewport(playerId);
    // Re-check after the await so a fresh viewport_update that landed during
    // the read is never overwritten by the (possibly stale) Redis copy.
    if (vp && !this.viewports.has(playerId)) this.viewports.set(playerId, vp);
  }

  /**
   * Throttle → speed-validate → assign a monotonic seq. Returns the validated
   * broadcast for the caller to publish cluster-wide (or deliver locally when
   * Redis is unavailable). Delivery is deliberately a separate step: every
   * instance only ever delivers to ITS OWN sockets, so recipient selection
   * uses the local viewport map — no cross-instance viewport reads on the
   * hot path.
   *
   * Note: seq is per-instance. If a unit's owner reconnects to a different
   * instance, its seq restarts at 1 there — clients treat equal-or-newer as
   * fresh and ghost markers expire after 10s offline, so the relay
   * self-heals without dropping live movement.
   */
  validateUnitPosition(
    sender: string,
    msg: UnitPositionMessage,
    now: number,
  ): UnitPositionBroadcast | null {
    const prev = this.unitPositions.get(msg.unitId);
    if (withinThrottle(prev?.at, now)) return null;
    if (prev && !unitSpeedOk(prev, { lat: msg.lat, lng: msg.lng, at: now })) return null;
    const seq = (prev?.seq ?? 0) + 1;
    this.unitPositions.set(msg.unitId, { lat: msg.lat, lng: msg.lng, at: now, seq });
    return {
      type: 'unit_position',
      unitId: msg.unitId,
      playerId: sender,
      lat: msg.lat,
      lng: msg.lng,
      heading: msg.heading,
      seq,
    };
  }

  /**
   * Fan out a validated position to every locally-connected player whose
   * viewport contains it (the sender never receives their own position).
   * Called for local delivery AND by every instance's Redis subscriber, so a
   * single publish reaches every relevant socket in the cluster.
   */
  deliverUnitPosition(b: UnitPositionBroadcast): void {
    const payload = JSON.stringify(b);
    for (const [playerId, viewport] of this.viewports) {
      if (playerId === b.playerId) continue;
      if (!viewportContains(viewport, { lat: b.lat, lng: b.lng })) continue;
      const ws = this.connections.get(playerId);
      if (!ws) continue;
      try {
        ws.send(payload);
      } catch {
        this.connections.delete(playerId);
      }
    }
  }

  sendTo(playerId: string, message: ServerMessage): void {
    const ws = this.connections.get(playerId);
    if (!ws) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      this.connections.delete(playerId);
    }
  }

  /**
   * Deliver a message to every locally-connected member of an alliance
   * (sender included — the echo renders the sender's own message). Called
   * for local delivery AND by every instance's Redis subscriber, so a single
   * publish reaches every member's socket across the cluster.
   */
  deliverAllianceMessage(allianceId: string, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const [playerId, ws] of this.connections) {
      if (this.playerMeta.get(playerId)?.allianceId !== allianceId) continue;
      try {
        ws.send(payload);
      } catch {
        this.connections.delete(playerId);
      }
    }
  }

  /**
   * Fan an alliance message out cluster-wide via its per-alliance Redis
   * channel (dhq:alliance:<id>). Every instance that has members of that
   * alliance subscribed delivers to its own sockets via the subscriber echo;
   * falls back to local delivery when Redis is unavailable.
   */
  broadcastToAlliance(allianceId: string, message: ServerMessage): void {
    if (isPubSubReady()) {
      void publishAllianceMessage(allianceId, message);
    } else {
      this.deliverAllianceMessage(allianceId, message);
    }
  }

  /** Deliver directly to every locally-connected socket. */
  localBroadcast(message: ServerMessage, except?: string): void {
    const payload = JSON.stringify(message);
    for (const [playerId, ws] of this.connections) {
      if (playerId === except) continue;
      try {
        ws.send(payload);
      } catch {
        this.connections.delete(playerId);
      }
    }
  }

  /** Deliver to all connected players. Uses Redis pub/sub when available so
   *  the message reaches sockets on other server instances too. */
  broadcast(message: ServerMessage, except?: string): void {
    if (except) {
      // Redis channels cannot exclude a single player, so skip the local
      // except socket before publishing to the rest of the cluster.
      this.localBroadcast(message, except);
      // Strip the except field for cluster-wide publish.
      publishBroadcast(message);
      return;
    }

    if (isPubSubReady()) {
      // Pub/sub will echo back through the subscriber and be delivered locally.
      publishBroadcast(message);
    } else {
      this.localBroadcast(message);
    }
  }

  broadcastDelta(changes: StateChange[]): void {
    if (changes.length === 0) return;
    const message: ServerMessage = {
      type: 'state_delta',
      changes,
      serverTime: Date.now(),
    };
    this.broadcast(message);
  }

  getConnectedCount(): number {
    return this.connections.size;
  }
}

export const connectionManager = new ConnectionManager();

/** Called by Redis subscriber when a message arrives from another instance. */
export function handleClusterMessage(channel: string, raw: string): void {
  try {
    const message = JSON.parse(raw);
    // Per-alliance channels fan out only to that alliance's members.
    const allianceId = allianceIdFromChannel(channel);
    if (allianceId) {
      connectionManager.deliverAllianceMessage(allianceId, message as ServerMessage);
      return;
    }
    if (isUnitPositionBroadcast(message)) {
      // Positions are delivered per-instance to locally viewport-covered
      // players; every instance (the publisher included) handles its own
      // sockets via the echo.
      connectionManager.deliverUnitPosition(message);
    } else {
      connectionManager.localBroadcast(message as ServerMessage);
    }
  } catch {
    // Ignore malformed cross-instance messages.
  }
}
