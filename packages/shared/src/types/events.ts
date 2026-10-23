// ============================================
// Dispatch HQ — WebSocket Event Types
// ============================================

import type { GeoPoint } from './station';

// Client → Server
export type ClientMessage =
  | { type: 'auth'; token: string; seq: number }
  | { type: 'viewport_update'; bounds: GeoBounds; zoom: number }
  | { type: 'action'; action: GameAction; seq: number; timestamp: number }
  | { type: 'ping'; clientTime: number }
  | { type: 'chat'; room: string; message: string }
  | { type: 'alliance_chat'; message: string }
  | { type: 'alliance_chat_receipt'; messageId: string; allianceId: string }
  | { type: 'alliance_typing' }
  | { type: 'presence_update'; city: string | null; activity: PresenceActivity }
  | { type: 'alliance_mission_spawn'; mission: any; playerName: string; city: string; allianceId: string }
  | { type: 'alliance_mission_dispatch'; missionId: string; playerName: string; unitCount: number; eta: number; service: string }
  | { type: 'alliance_mission_cancel'; missionId: string; playerName: string }
  | UnitPositionMessage;

// Server → Client
export type ServerMessage =
  | { type: 'auth_ok'; playerId: string; state: GameStateSnapshot }
  | { type: 'state_delta'; changes: StateChange[]; serverTime: number }
  | { type: 'nearby_state'; bounds: GeoBounds; stations: any[]; units: any[] }
  | { type: 'action_confirmed'; seq: number; result: ActionResult }
  | { type: 'action_rejected'; seq: number; reason: string }
  | { type: 'pong'; clientTime: number; serverTime: number }
  | { type: 'notification'; notification: GameNotification }
  | { type: 'chat'; id: string; sender: string; text: string; room: string; timestamp: string; kind?: 'psa' | 'notice' | 'message' }
  | { type: 'alliance_chat'; id: string; sender: string; text: string; allianceId: string; timestamp: string }
  | { type: 'alliance_chat_receipt'; messageId: string; allianceId: string; readerId: string; readerName: string; timestamp: string }
  | { type: 'alliance_typing'; allianceId: string; playerId: string; username: string; at: number }
  | { type: 'presence'; online: number; players?: OnlinePlayerPresence[] }
  | { type: 'maintenance'; maintenance: boolean; reason: string | null; since: string | null }
  // Founder scheduled a maintenance window — every instance syncs the countdown
  // so the automatic flip happens wherever the tick lands (v0.22.18).
  | { type: 'maintenance_scheduled'; scheduledAt: string | null; reason: string | null }
  | { type: 'alliance_mission_spawn'; mission: any; playerName: string; city: string; allianceId: string }
  | { type: 'alliance_mission_dispatch'; missionId: string; playerName: string; unitCount: number; eta: number; service: string }
  | { type: 'alliance_mission_cancel'; missionId: string; playerName: string }
  | { type: 'alliance_mission_complete'; missionId: string; playerName: string; service: string }
  | UnitPositionBroadcast;

/** What a commander is doing right now — shown in the players panel (v0.22.17). */
export type PresenceActivity = 'in_mission' | 'patrolling' | 'idle';

/** One connected commander in the live presence roster. */
export interface OnlinePlayerPresence {
  playerId: string;
  username: string;
  allianceId: string | null;
  level: number;
  city: string | null;
  activity: PresenceActivity;
  /**
   * The commander's current map viewport (center + radius) — populated from
   * the viewport fan-out registry so the players panel can sort "near you"
   * (same city or overlapping viewport) without extra round-trips.
   */
  view?: { lat: number; lng: number; radiusKm: number };
}

// Live unit movement relay — client reports throttled positions, the server
// validates speed caps and fans out to players whose viewport contains the
// unit. `seq` is monotonic per unit so stale messages are dropped.
export interface UnitPositionMessage {
  type: 'unit_position';
  unitId: string;
  lat: number;
  lng: number;
  speedKmh: number;      // client-reported speed for validation
  heading: number;       // 0-360
}

export interface UnitPositionBroadcast {
  type: 'unit_position';
  unitId: string;
  playerId: string;      // owner, to ignore your own
  lat: number;
  lng: number;
  heading: number;
  seq: number;           // monotonically increasing per unit (drop stale)
}

export function isUnitPositionBroadcast(m: unknown): m is UnitPositionBroadcast {
  if (!m || typeof m !== 'object') return false;
  const x = m as Record<string, unknown>;
  return (
    x.type === 'unit_position' &&
    typeof x.unitId === 'string' &&
    typeof x.playerId === 'string' &&
    typeof x.lat === 'number' &&
    typeof x.lng === 'number' &&
    typeof x.heading === 'number' &&
    typeof x.seq === 'number'
  );
}

/** True when `next` is newer than `prev` (equal counts as fresh; only strictly older is stale). */
export function isNewerSeq(next: number, prev: number | undefined): boolean {
  return prev === undefined || next >= prev;
}

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type GameAction =
  | { type: 'build_station'; stationType: string; position: GeoPoint }
  | { type: 'upgrade_station'; stationId: string }
  | { type: 'buy_unit'; stationId: string; unitType: string }
  | { type: 'dispatch_unit'; unitId: string; missionId: string }
  | { type: 'recall_unit'; unitId: string };


export interface GameStateSnapshot {
  player: any;
  stations: any[];
  units: any[];
  missions: any[];
}

export interface StateChange {
  entity: string;
  id: string;
  changes: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface GameNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
}
