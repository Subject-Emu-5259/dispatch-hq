// ============================================
// Dispatch HQ — WebSocket Server
// ============================================

import { eq, and, gt, lt, ne } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createNodeWebSocket } from '@hono/node-ws';
import type { NodeWebSocket } from '@hono/node-ws';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';

import { db } from '../db';
import { players, stations, units, missions, chatMessages, chatMessageReceipts } from '../db/schema';
import { verifyToken } from '../auth/jwt';
import { connectionManager } from './connectionManager';
import { handleAction } from './actionHandler';
import { haversineKm } from './unitPosition';
import { getMyAlliance } from '../routes/alliances';
import { isPubSubReady, publishBroadcast } from '../lib/pubsub';
import { isMaintenanceMode, getMaintenanceState } from '../lib/maintenance';
import type {
  ClientMessage,
  ServerMessage,
  GameStateSnapshot,
} from '@dispatch-hq/shared';
type AnyHono = Hono<any, any, any>;

// Last typing event per player, to keep keystroke bursts from flooding the
// per-alliance Redis channel (clients also throttle — this is the backstop).
const lastAllianceTypingAt = new Map<string, number>();
// Last receipt BROADCAST per player. Receipts are always persisted (a dropped
// ack would lose the sender's ✓✓ forever — acks are one-shot), but the live
// cluster fan-out is the amplification surface a scripted client could spam,
// so only the broadcast is throttled; the chat poll reconciles ✓✓ within 8s.
const lastAllianceReceiptAt = new Map<string, number>();

async function buildStateSnapshot(playerId: string): Promise<GameStateSnapshot | null> {
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (playerRows.length === 0) return null;
  const player = playerRows[0];
  const stationRows = await db.select().from(stations).where(eq(stations.ownerId, playerId));
  const unitRows = await db.select().from(units).where(eq(units.ownerId, playerId));
  const missionRows = await db.select().from(missions).where(eq(missions.status, 'active'));
  return {
    player,
    stations: stationRows,
    units: unitRows,
    missions: missionRows,
  };
}

interface AuthenticatedSocket {
  playerId: string;
  username: string;
}

export function createWsServer(app: AnyHono): NodeWebSocket {
  const nodeWs = createNodeWebSocket({ app });

  app.get(
    '/ws',
    nodeWs.upgradeWebSocket((c) => {
      const token = getCookie(c, 'token');
      const socket: Partial<AuthenticatedSocket> = {};

      return {
        async onOpen(_evt, ws: WSContext) {
          if (!token) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              seq: 0,
              reason: 'Auth cookie required',
            } satisfies ServerMessage));
            ws.close(4001, 'Missing auth cookie');
            return;
          }
          const verified = await verifyToken(token);
          if (!verified) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              seq: 0,
              reason: 'Invalid or expired auth cookie',
            } satisfies ServerMessage));
            ws.close(4001, 'Invalid auth cookie');
            return;
          }
          // Maintenance mode: the online (multiplayer) layer is paused — reject
          // new connections with a clear message so the client flips to the
          // Maintenance chip instead of looping reconnect attempts.
          if (isMaintenanceMode()) {
            ws.send(JSON.stringify({
              type: 'maintenance',
              maintenance: true,
              reason: getMaintenanceState().reason,
              since: getMaintenanceState().since,
            } satisfies ServerMessage));
            ws.close(4003, 'Maintenance mode');
            return;
          }
          const playerRows = await db.select({ username: players.username, level: players.level }).from(players).where(eq(players.id, verified.playerId)).limit(1);
          socket.playerId = verified.playerId;
          socket.username = playerRows[0]?.username ?? 'Commander';
          // Load the player's alliance id for presence + allied-unit visibility.
          const alliance = await getMyAlliance(verified.playerId).catch(() => null);
          const allianceId = alliance?.alliance.id ?? null;
          if (allianceId) {
            connectionManager.setAlliance(verified.playerId, allianceId);
          }
          connectionManager.addConnection(verified.playerId, ws, {
            username: socket.username!,
            allianceId,
            level: playerRows[0]?.level ?? 1,
          });
          // Restore relay coverage from the shared viewport registry (reconnect
          // to a different instance or instance restart) — fire and forget.
          void connectionManager.restoreViewport(verified.playerId);
          const state = await buildStateSnapshot(verified.playerId);
          ws.send(JSON.stringify({
            type: 'auth_ok',
            playerId: verified.playerId,
            state: state ?? { player: null, stations: [], units: [], missions: [] },
          } satisfies ServerMessage));
        },

        async onMessage(evt, ws: WSContext) {
          if (typeof evt.data !== 'string') return;
          if (!socket.playerId) {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              seq: 0,
              reason: 'Not authenticated',
            } satisfies ServerMessage));
            return;
          }
          let message: ClientMessage;
          try {
            message = JSON.parse(evt.data);
          } catch {
            ws.send(JSON.stringify({
              type: 'action_rejected',
              seq: 0,
              reason: 'Invalid JSON',
            } satisfies ServerMessage));
            return;
          }

          switch (message.type) {
            case 'presence_update': {
              // A connected commander reports where they are and what they're
              // doing — drives the players panel roster (v0.22.17).
              const city = typeof message.city === 'string' && message.city ? message.city : null;
              const activity = message.activity === 'in_mission' || message.activity === 'patrolling' || message.activity === 'idle'
                ? message.activity
                : 'idle';
              if (connectionManager.updatePresence(socket.playerId!, { city, activity })) {
                connectionManager.broadcast({
                  type: 'presence',
                  online: connectionManager.getConnectedCount(),
                  players: connectionManager.getPresence(),
                } satisfies ServerMessage);
              }
              break;
            }
            case 'ping': {
              ws.send(JSON.stringify({
                type: 'pong',
                clientTime: message.clientTime,
                serverTime: Date.now(),
              } satisfies ServerMessage));
              break;
            }
            case 'action': {
              const { result, changes } = await handleAction(socket.playerId!, message.action);
              if (result.success) {
                ws.send(JSON.stringify({
                  type: 'action_confirmed',
                  seq: message.seq,
                  result,
                } satisfies ServerMessage));
                connectionManager.broadcastDelta(changes);
              } else {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: message.seq,
                  reason: result.error ?? 'Action failed',
                } satisfies ServerMessage));
              }
              break;
            }
            case 'viewport_update': {
              const { bounds } = message;
              if (!bounds || typeof bounds.north !== 'number') {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'Invalid viewport bounds',
                } satisfies ServerMessage));
                break;
              }
              // Remember this player's viewport center for unit-position fan-out.
              connectionManager.updateViewport(
                socket.playerId!,
                {
                  lat: (bounds.north + bounds.south) / 2,
                  lng: (bounds.east + bounds.west) / 2,
                },
                // Approx half-diagonal of the viewport in km.
                haversineKm(
                  { lat: bounds.south, lng: bounds.west },
                  { lat: bounds.north, lng: bounds.east },
                ) / 2,
              );
              const stationRows = await db
                .select({
                  id: stations.id,
                  ownerId: stations.ownerId,
                  stationType: stations.stationType,
                  name: stations.name,
                  level: stations.level,
                  lat: stations.lat,
                  lng: stations.lng,
                  capacity: stations.capacity,
                  unitCount: stations.unitCount,
                  coverageRadius: stations.coverageRadius,
                })
                .from(stations)
                .where(
                  and(
                    gt(stations.lat, bounds.south),
                    lt(stations.lat, bounds.north),
                    gt(stations.lng, bounds.west),
                    lt(stations.lng, bounds.east),
                    ne(stations.ownerId, socket.playerId!),
                  ),
                );
              const unitRows = await db
                .select({
                  id: units.id,
                  ownerId: units.ownerId,
                  stationId: units.stationId,
                  unitType: units.unitType,
                  name: units.name,
                  status: units.status,
                  lat: units.lat,
                  lng: units.lng,
                  heading: units.heading,
                  speed: units.speed,
                  eta: units.eta,
                  missionId: units.missionId,
                  trainingLevel: units.trainingLevel,
                })
                .from(units)
                .where(
                  and(
                    gt(units.lat, bounds.south),
                    lt(units.lat, bounds.north),
                    gt(units.lng, bounds.west),
                    lt(units.lng, bounds.east),
                    ne(units.ownerId, socket.playerId!),
                  ),
                );
              const formatNearbyStation = (row: typeof stationRows[number]) => ({
                id: row.id,
                ownerId: row.ownerId,
                type: row.stationType,
                name: row.name,
                level: row.level,
                position: { lat: row.lat, lng: row.lng },
                capacity: row.capacity,
                unitCount: row.unitCount,
                coverageRadius: row.coverageRadius,
              });
              const formatNearbyUnit = (row: typeof unitRows[number]) => ({
                id: row.id,
                ownerId: row.ownerId,
                stationId: row.stationId,
                type: row.unitType,
                name: row.name,
                status: row.status,
                position: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
                heading: row.heading,
                speed: row.speed,
                eta: row.eta,
                missionId: row.missionId,
                trainingLevel: row.trainingLevel,
              });
              ws.send(JSON.stringify({
                type: 'nearby_state',
                bounds,
                stations: stationRows.map(formatNearbyStation),
                units: unitRows.map(formatNearbyUnit),
              } satisfies ServerMessage));
              break;
            }
            case 'unit_position': {
              const { unitId, lat, lng, speedKmh, heading } = message;
              if (typeof unitId !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'Invalid unit position',
                } satisfies ServerMessage));
                break;
              }
              const broadcast = connectionManager.validateUnitPosition(
                socket.playerId!,
                { type: 'unit_position', unitId, lat, lng, speedKmh: speedKmh ?? 0, heading: heading ?? 0 },
                Date.now(),
              );
              if (!broadcast) break;
              if (isPubSubReady()) {
                // Publish once; every instance (this one included) delivers to
                // its own viewport-covered players via the subscriber echo.
                publishBroadcast(broadcast);
              } else {
                // Single-instance fallback without Redis.
                connectionManager.deliverUnitPosition(broadcast);
              }
              break;
            }
            case 'chat': {
              const room = message.room || 'global';
              const text = message.message.slice(0, 500);
              const [record] = await db.insert(chatMessages).values({
                senderId: socket.playerId!,
                senderName: socket.username!,
                room,
                type: 'user',
                text,
              }).returning();
              connectionManager.broadcast({
                type: 'chat',
                id: record?.id ?? crypto.randomUUID(),
                sender: socket.username!,
                text,
                room,
                timestamp: new Date(record?.createdAt ?? Date.now()).toISOString(),
              } satisfies ServerMessage);
              break;
            }
            case 'alliance_chat': {
              // Fast path from the session meta; fall back to the DB for
              // sessions connected before the meta was populated (e.g. right
              // after a deploy) and backfill the meta for next time.
              let allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId) {
                const mine = await getMyAlliance(socket.playerId!).catch(() => null);
                allianceId = mine?.alliance.id ?? null;
                if (allianceId) connectionManager.setAlliance(socket.playerId!, allianceId);
              }
              if (!allianceId) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'You are not in an alliance',
                } satisfies ServerMessage));
                break;
              }
              const text = message.message.trim().slice(0, 500);
              if (!text) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'Message is required',
                } satisfies ServerMessage));
                break;
              }
              const [record] = await db.insert(chatMessages).values({
                senderId: socket.playerId!,
                senderName: socket.username!,
                room: `alliance:${allianceId}`,
                type: 'user',
                text,
              }).returning();
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_chat',
                id: record?.id ?? crypto.randomUUID(),
                sender: socket.username!,
                text,
                allianceId,
                timestamp: new Date(record?.createdAt ?? Date.now()).toISOString(),
              } satisfies ServerMessage);
              break;
            }
            case 'alliance_chat_receipt': {
              // Delivery confirmation: a member's client got a message and is
              // acking it so the sender can show ✓✓. Server-side membership is
              // authoritative — the client's claimed alliance is ignored so a
              // receipt can never leak outside the alliance.
              const { messageId } = message;
              const allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId || typeof messageId !== 'string' || !messageId.trim()) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'Invalid receipt',
                } satisfies ServerMessage));
                break;
              }
              // Persist so ✓✓ survives reloads and poll-based reconciliation.
              // onConflictDoNothing keeps repeat acks idempotent; a spoofed
              // message id fails the FK and is ignored — the live fan-out
              // below is unaffected either way.
              try {
                await db.insert(chatMessageReceipts)
                  .values({ messageId, readerId: socket.playerId! })
                  .onConflictDoNothing();
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn('[chat] receipt persist skipped:', msg);
              }
              // Throttle only the live fan-out (see lastAllianceReceiptAt).
              const receiptNow = Date.now();
              if (receiptNow - (lastAllianceReceiptAt.get(socket.playerId!) ?? 0) < 800) break;
              lastAllianceReceiptAt.set(socket.playerId!, receiptNow);
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_chat_receipt',
                messageId,
                allianceId,
                readerId: socket.playerId!,
                readerName: socket.username ?? 'Commander',
                timestamp: new Date().toISOString(),
              } satisfies ServerMessage);
              break;
            }
            case 'alliance_typing': {
              // Typing presence: fan out to the alliance so members can see
              // 'X is typing…'. Server-side membership is authoritative (the
              // client sends no alliance claim) and the event is throttled per
              // player — keystrokes can burst locally, but the wire never does.
              const allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'You are not in an alliance',
                } satisfies ServerMessage));
                break;
              }
              const now = Date.now();
              if (now - (lastAllianceTypingAt.get(socket.playerId!) ?? 0) < 800) break;
              lastAllianceTypingAt.set(socket.playerId!, now);
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_typing',
                allianceId,
                playerId: socket.playerId!,
                username: socket.username ?? 'Commander',
                at: now,
              } satisfies ServerMessage);
              break;
            }
            // ── Co-op dispatch: relay alliance mission events ──
            case 'alliance_mission_spawn': {
              const allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId) {
                ws.send(JSON.stringify({
                  type: 'action_rejected',
                  seq: 0,
                  reason: 'You are not in an alliance',
                } satisfies ServerMessage));
                break;
              }
              // Rate-limit: 1 spawn per 3s per player
              const now = Date.now();
              if (now - (lastAllianceReceiptAt.get(socket.playerId!) ?? 0) < 3000) break;
              lastAllianceReceiptAt.set(socket.playerId!, now);
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_mission_spawn',
                mission: message.mission,
                playerName: socket.username ?? 'Commander',
                city: message.city,
                allianceId,
              } satisfies ServerMessage);
              break;
            }
            case 'alliance_mission_dispatch': {
              const allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId) break;
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_mission_dispatch',
                missionId: message.missionId,
                playerName: socket.username ?? 'Commander',
                unitCount: message.unitCount,
                eta: message.eta,
                service: message.service,
              } satisfies ServerMessage);
              break;
            }
            case 'alliance_mission_cancel': {
              const allianceId = connectionManager.getAlliance(socket.playerId!);
              if (!allianceId) break;
              connectionManager.broadcastToAlliance(allianceId, {
                type: 'alliance_mission_cancel',
                missionId: message.missionId,
                playerName: socket.username ?? 'Commander',
              } satisfies ServerMessage);
              break;
            }
            default: {
              ws.send(JSON.stringify({
                type: 'action_rejected',
                seq: 0,
                reason: `Unknown message type`,
              } satisfies ServerMessage));
            }
          }
        },

        onClose(_evt, ws: WSContext) {
          if (socket.playerId) {
            connectionManager.removeConnection(socket.playerId);
            // Drop the per-player throttles so the maps can't accumulate
            // entries for departed sockets.
            lastAllianceTypingAt.delete(socket.playerId);
            lastAllianceReceiptAt.delete(socket.playerId);
          }
        },
      };
    }),
  );

  // Multiplayer presence: every 10s, tell all connected players how many
  // commanders are online right now (rendered in the online indicator).
  const presenceInterval = setInterval(() => {
    connectionManager.broadcast({
      type: 'presence',
      online: connectionManager.getConnectedCount(),
      players: connectionManager.getPresence(),
    } satisfies ServerMessage);
  }, 10000);
  presenceInterval.unref?.();

  return nodeWs;
}
