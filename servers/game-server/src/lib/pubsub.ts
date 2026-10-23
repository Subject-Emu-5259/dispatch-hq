// ============================================
// Dispatch HQ — Redis Pub/Sub Broadcast Layer
// ============================================
// Enables WebSocket broadcasts to reach players connected to other
// server instances. Falls back silently to in-memory fanout when Redis
// is unavailable (single-instance mode).

import Redis from 'ioredis';
import { config } from '../config';

// Single source of truth: config.redis.url (env REDIS_URL or the local-dev
// fallback). config.ts's boot guard (v0.22.19) warns loudly when the fallback
// is in use. Previously pubsub had its own copy with a slightly different
// loopback host (127.0.0.1 vs localhost) — that divergence is gone.
const REDIS_URL = config.redis.url;

const CHANNEL = 'dhq:broadcast';
/** Per-alliance chat channel prefix: dhq:alliance:<allianceId>. */
export const ALLIANCE_CHANNEL_PREFIX = 'dhq:alliance:';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let messageHandler: ((channel: string, message: string) => void) | null = null;

/** Random identity for this server instance (viewport registry + diagnostics). */
const instanceId = crypto.randomUUID();
export function getInstanceId(): string {
  return instanceId;
}

export function initPubSub(handler: (channel: string, message: string) => void): void {
  messageHandler = handler;

  try {
    publisher = new Redis(REDIS_URL, { retryStrategy: () => 2000, maxRetriesPerRequest: 3 });
    subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000, maxRetriesPerRequest: 3 });

    subscriber.on('message', (channel: string, message: string) => {
      handler(channel, message);
    });

    subscriber.subscribe(CHANNEL).catch((err) => {
      console.warn('[pubsub] Redis subscribe failed, staying in-memory only:', err.message);
      cleanup();
    });

    publisher.on('error', (err) => {
      console.warn('[pubsub] publisher error:', err.message);
    });
    subscriber.on('error', (err) => {
      console.warn('[pubsub] subscriber error:', err.message);
    });
  } catch (err) {
    console.warn('[pubsub] Redis not available, using in-memory broadcast only:', err);
    publisher = null;
    subscriber = null;
  }
}

function cleanup(): void {
  try { publisher?.disconnect(); } catch { /* ignore */ }
  try { subscriber?.disconnect(); } catch { /* ignore */ }
  publisher = null;
  subscriber = null;
}

export function isPubSubReady(): boolean {
  return publisher?.status === 'ready' || publisher?.status === 'connect' || false;
}

export async function publishBroadcast(message: any): Promise<void> {
  if (!publisher || !isPubSubReady()) return;
  try {
    await publisher.publish(CHANNEL, JSON.stringify(message));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[pubsub] publish failed:', msg);
  }
}

export function getBroadcastChannel(): string {
  return CHANNEL;
}

export function allianceChannel(allianceId: string): string {
  return `${ALLIANCE_CHANNEL_PREFIX}${allianceId}`;
}

export function allianceIdFromChannel(channel: string): string | null {
  if (!channel.startsWith(ALLIANCE_CHANNEL_PREFIX)) return null;
  const id = channel.slice(ALLIANCE_CHANNEL_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** Subscribe to an alliance's chat channel (idempotent; no-op without Redis). */
export function subscribeAllianceChannel(allianceId: string): void {
  if (!subscriber || !isPubSubReady()) return;
  subscriber.subscribe(allianceChannel(allianceId)).catch((err) => {
    console.warn('[pubsub] alliance subscribe failed:', err.message);
  });
}

/** Unsubscribe from an alliance's chat channel (no-op without Redis). */
export function unsubscribeAllianceChannel(allianceId: string): void {
  if (!subscriber || !isPubSubReady()) return;
  subscriber.unsubscribe(allianceChannel(allianceId)).catch((err) => {
    console.warn('[pubsub] alliance unsubscribe failed:', err.message);
  });
}

/**
 * Publish a message to an alliance's chat channel. Every instance that has
 * members of that alliance subscribed receives it and delivers to its own
 * sockets (the publisher included, via the subscriber echo).
 */
export async function publishAllianceMessage(allianceId: string, message: any): Promise<void> {
  if (!publisher || !isPubSubReady()) return;
  try {
    await publisher.publish(allianceChannel(allianceId), JSON.stringify(message));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[pubsub] alliance publish failed:', msg);
  }
}

// ── Shared viewport registry ──────────────────────────────────────────────
// Every instance writes its connected players' viewports here (TTL'd) so a
// player reconnecting to a different instance — or an instance restart — can
// restore relay coverage before the client re-sends viewport_update. The
// unit-position fan-out itself only needs LOCAL viewports (delivery always
// happens on the instance that owns the socket), so the registry is for
// continuity, not hot-path reads.

const VIEWPORT_TTL_SEC = 60;
const viewportKey = (playerId: string) => `dhq:viewport:${playerId}`;

/** Persist a player's viewport to the shared registry (fire-and-forget). */
export async function publishViewport(
  playerId: string,
  viewport: { lat: number; lng: number; radiusKm: number },
): Promise<void> {
  if (!publisher || !isPubSubReady()) return;
  try {
    await publisher.set(
      viewportKey(playerId),
      JSON.stringify({ ...viewport, instanceId, at: Date.now() }),
      'EX',
      VIEWPORT_TTL_SEC,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[pubsub] viewport write failed:', msg);
  }
}

/** Remove a player's viewport (disconnect). */
export async function deleteViewport(playerId: string): Promise<void> {
  if (!publisher || !isPubSubReady()) return;
  try {
    await publisher.del(viewportKey(playerId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[pubsub] viewport delete failed:', msg);
  }
}

/** Read a player's viewport from the shared registry, or null when absent. */
export async function fetchViewport(
  playerId: string,
): Promise<{ lat: number; lng: number; radiusKm: number } | null> {
  if (!publisher || !isPubSubReady()) return null;
  try {
    const raw = await publisher.get(viewportKey(playerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.radiusKm === 'number'
    ) {
      return { lat: parsed.lat, lng: parsed.lng, radiusKm: parsed.radiusKm };
    }
    return null;
  } catch {
    return null;
  }
}
