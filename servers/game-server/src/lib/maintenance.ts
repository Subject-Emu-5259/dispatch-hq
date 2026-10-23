// ============================================
// Dispatch HQ — Server Maintenance Mode
// ============================================
// Founder-controlled kill switch for the ONLINE (multiplayer) layer. When
// maintenance is active the WebSocket rejects new connections, /health
// reports it, and the client shows a Maintenance chip and pauses the
// multiplayer relay. Offline (single-player) gameplay is unaffected — the
// flag only gates the server-connected features, never the local simulation.
//
// The change fans out through the shared Redis broadcast channel as a
// ServerMessage ('maintenance') so every instance flips its flag AND every
// connected client is told instantly. With Redis absent (single-instance
// mode) the direct local broadcast still covers all local sockets.

import { publishBroadcast } from './pubsub';
import { connectionManager } from '../websocket/connectionManager';
import type { ServerMessage } from '@dispatch-hq/shared';

export interface MaintenanceState {
  maintenance: boolean;
  reason: string | null;
  since: string | null;
  /** ISO timestamp of a founder-scheduled window, or null when none is armed. */
  scheduledAt: string | null;
}

let state: MaintenanceState = {
  maintenance: false,
  reason: null,
  since: null,
  scheduledAt: null,
};

// The reason attached to a scheduled window (kept alongside scheduledAt so
// the flip at the scheduled moment carries the founder's note).
let scheduledReason: string | null = null;

export function getMaintenanceState(): MaintenanceState {
  return { ...state };
}

export function isMaintenanceMode(): boolean {
  return state.maintenance;
}

/**
 * The durable inbox note dropped when the founder toggles maintenance — a
 * pure message builder so OFFLINE players see the window at next login, not
 * just whoever was connected (v0.22.17). `enabled` is the NEW state the
 * toggle moved to.
 */
export function maintenanceInboxNote(enabled: boolean, reason: string | null): { title: string; body: string } {
  if (enabled) {
    return {
      title: '🛠️ Maintenance Started',
      body: `${reason ? `Online services are paused: ${reason}. ` : 'Online services are paused for maintenance. '}`
        + 'Single-player keeps running and saving — check the online chip for status.',
    };
  }
  return {
    title: '✅ Online Restored',
    body: 'Maintenance is over — online services are back. Log in and get back on the streets.',
  };
}

/** The live ServerMessage every client should see when the flag flips. */
export function maintenanceMessage(): ServerMessage {
  return {
    type: 'maintenance',
    maintenance: state.maintenance,
    reason: state.reason,
    since: state.since,
  };
}

/**
 * Set the maintenance flag locally, publish the change cluster-wide (so other
 * instances update their flag AND their clients get the live message), and
 * broadcast directly to local sockets — the direct broadcast covers the
 * no-Redis single-instance case where nothing else would deliver it.
 */
export async function setMaintenance(enabled: boolean, reason?: string | null): Promise<MaintenanceState> {
  const since = enabled ? new Date().toISOString() : null;
  state = {
    maintenance: enabled,
    reason: enabled ? (reason?.trim().slice(0, 200) ?? null) : null,
    since,
    scheduledAt: state.scheduledAt,
  };
  await publishBroadcast(maintenanceMessage());
  connectionManager.broadcast(maintenanceMessage());
  return getMaintenanceState();
}

/**
 * Arm (or cancel) a scheduled maintenance window. `at` is an ISO timestamp;
 * null clears the schedule. A timestamp already in the past is honored as
 * "start now" — the founder asked for this window, so the flip happens
 * immediately instead of being silently dropped.
 */
export async function scheduleMaintenance(at: string | null, reason?: string | null): Promise<MaintenanceState> {
  if (at == null) {
    state = { ...state, scheduledAt: null };
    scheduledReason = null;
    await publishBroadcast({
      type: 'maintenance_scheduled',
      scheduledAt: null,
      reason: null,
    } satisfies ServerMessage);
    return getMaintenanceState();
  }
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) {
    throw new Error('Invalid scheduled time');
  }
  const trimmedReason = reason?.trim().slice(0, 200) ?? null;
  if (t <= Date.now()) {
    // Already due — flip immediately (the tick would do exactly this).
    await setMaintenance(true, trimmedReason);
    state = { ...state, scheduledAt: null };
    scheduledReason = null;
    return getMaintenanceState();
  }
  state = { ...state, scheduledAt: at };
  scheduledReason = trimmedReason;
  await publishBroadcast({
    type: 'maintenance_scheduled',
    scheduledAt: at,
    reason: trimmedReason,
  } satisfies ServerMessage);
  return getMaintenanceState();
}

/**
 * The scheduler tick: flip maintenance automatically the moment a scheduled
 * window arrives. Returns true when this tick actually started maintenance
 * (so the caller drops the durable inbox note exactly then). Never fires
 * twice for the same window, and a manual toggle meanwhile supersedes it.
 */
export async function checkScheduledMaintenance(): Promise<boolean> {
  if (!state.scheduledAt) return false;
  if (Date.now() < new Date(state.scheduledAt).getTime()) return false;
  const reason = scheduledReason;
  const wasEnabled = state.maintenance;
  state = { ...state, scheduledAt: null };
  scheduledReason = null;
  if (wasEnabled) return false; // already in maintenance — window is moot
  await setMaintenance(true, reason);
  return true;
}

/**
 * Apply a maintenance flag received from another instance (the Redis echo on
 * the toggling instance is idempotent). Called alongside handleClusterMessage
 * for every cross-instance message — only 'maintenance' payloads act.
 */
export function applyMaintenanceClusterMessage(raw: string): void {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'maintenance') {
      if (typeof m.maintenance !== 'boolean') return;
      state = m.maintenance
        ? {
            maintenance: true,
            reason: typeof m.reason === 'string' ? m.reason : null,
            since: typeof m.since === 'string' ? m.since : new Date().toISOString(),
            scheduledAt: state.scheduledAt,
          }
        : { maintenance: false, reason: null, since: null, scheduledAt: state.scheduledAt };
      return;
    }
    if (m.type === 'maintenance_scheduled') {
      // Another instance armed/cancelled a window — mirror it so the countdown
      // (and the automatic flip) is cluster-wide, not founder-instance-only.
      const at = typeof m.scheduledAt === 'string' ? m.scheduledAt : null;
      const reason = typeof m.reason === 'string' ? m.reason : null;
      state = { ...state, scheduledAt: at };
      scheduledReason = at ? reason : null;
      return;
    }
  } catch {
    // Malformed cross-instance message — ignore.
  }
}
