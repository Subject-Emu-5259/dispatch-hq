// ============================================
// Dispatch HQ — Maintenance Mode Tests
// ============================================
// Pure-logic coverage of the founder-controlled online-layer kill switch:
// state transitions, reason/since bookkeeping, and the cross-instance
// application path (Redis echo / other-instance delivery).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMaintenanceState,
  isMaintenanceMode,
  setMaintenance,
  scheduleMaintenance,
  checkScheduledMaintenance,
  applyMaintenanceClusterMessage,
  maintenanceInboxNote,
} from './maintenance';

describe('maintenance mode', () => {
  beforeEach(async () => {
    // Reset to a clean live state before each case (setMaintenance is async —
    // the publish is fire-and-forget, but await keeps ordering deterministic).
    await setMaintenance(false);
  });

  it('starts live (not in maintenance)', () => {
    expect(isMaintenanceMode()).toBe(false);
    expect(getMaintenanceState()).toEqual({ maintenance: false, reason: null, since: null, scheduledAt: null });
  });

  it('enters maintenance with a reason and a since timestamp', async () => {
    const before = Date.now();
    await setMaintenance(true, 'DB migration');
    const state = getMaintenanceState();
    expect(state.maintenance).toBe(true);
    expect(state.reason).toBe('DB migration');
    expect(state.since).toBeTruthy();
    expect(new Date(state.since!).getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(isMaintenanceMode()).toBe(true);
  });

  it('trims and caps the reason at 200 characters', async () => {
    await setMaintenance(true, '  ' + 'x'.repeat(300) + '  ');
    const state = getMaintenanceState();
    expect(state.reason).toBe('x'.repeat(200));
    expect(state.reason!.length).toBe(200);
  });

  it('clears reason and since when service resumes', async () => {
    await setMaintenance(true, 'Network work');
    await setMaintenance(false);
    expect(getMaintenanceState()).toEqual({ maintenance: false, reason: null, since: null, scheduledAt: null });
    expect(isMaintenanceMode()).toBe(false);
  });

  it('builds a durable inbox note for the toggle (v0.22.17)', () => {
    const on = maintenanceInboxNote(true, 'rolling restart');
    expect(on.title).toContain('Maintenance Started');
    expect(on.body).toContain('rolling restart');
    expect(on.body).toContain('Single-player keeps running');
    const onNoReason = maintenanceInboxNote(true, null);
    expect(onNoReason.body).toContain('paused for maintenance');
    const off = maintenanceInboxNote(false, 'rolling restart');
    expect(off.title).toContain('Online Restored');
    expect(off.body).toContain('back');
  });

  it('applies a maintenance message from another instance', async () => {
    const payload = JSON.stringify({ type: 'maintenance', maintenance: true, reason: 'rolling restart', since: '2026-08-12T00:00:00.000Z' });
    applyMaintenanceClusterMessage(payload);
    expect(isMaintenanceMode()).toBe(true);
    expect(getMaintenanceState().reason).toBe('rolling restart');
    expect(getMaintenanceState().since).toBe('2026-08-12T00:00:00.000Z');

    applyMaintenanceClusterMessage(JSON.stringify({ type: 'maintenance', maintenance: false, reason: null, since: null }));
    expect(isMaintenanceMode()).toBe(false);
  });

  it('ignores non-maintenance and malformed cluster messages', async () => {
    await setMaintenance(false);
    applyMaintenanceClusterMessage(JSON.stringify({ type: 'presence', online: 4 }));
    applyMaintenanceClusterMessage('not json');
    applyMaintenanceClusterMessage(JSON.stringify({ type: 'maintenance' })); // missing boolean
    applyMaintenanceClusterMessage(JSON.stringify({ type: 'maintenance', maintenance: 'yes' }));
    expect(isMaintenanceMode()).toBe(false);
  });

  // ── Scheduled maintenance (v0.22.18) ───────────────────────────────────

  it('arms a future window and cancels it with null', async () => {
    await setMaintenance(false);
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const armed = await scheduleMaintenance(at, 'planned nightly window');
    expect(armed.scheduledAt).toBe(at);
    expect(isMaintenanceMode()).toBe(false); // not active yet

    const cancelled = await scheduleMaintenance(null);
    expect(cancelled.scheduledAt).toBeNull();
  });

  it('starts immediately when the scheduled time is already past', async () => {
    await setMaintenance(false);
    await scheduleMaintenance(new Date(Date.now() - 1_000).toISOString(), 'start now');
    expect(isMaintenanceMode()).toBe(true);
    expect(getMaintenanceState().reason).toBe('start now');
    expect(getMaintenanceState().scheduledAt).toBeNull();
  });

  it('does not flip before the scheduled time arrives', async () => {
    await setMaintenance(false);
    const at = new Date(Date.now() + 60_000).toISOString();
    applyMaintenanceClusterMessage(JSON.stringify({ type: 'maintenance_scheduled', scheduledAt: at, reason: 'soon' }));
    expect(getMaintenanceState().scheduledAt).toBe(at);
    expect(await checkScheduledMaintenance()).toBe(false);
    expect(isMaintenanceMode()).toBe(false);
  });

  it('flips automatically when the window arrives — once, with the reason', async () => {
    await setMaintenance(false);
    // Seed a due window via the cluster-sync path (directly sets scheduledAt
    // without flipping, exactly what another instance's broadcast does).
    applyMaintenanceClusterMessage(JSON.stringify({
      type: 'maintenance_scheduled',
      scheduledAt: new Date(Date.now() - 1_000).toISOString(),
      reason: 'nightly DB work',
    }));
    expect(isMaintenanceMode()).toBe(false);

    expect(await checkScheduledMaintenance()).toBe(true);
    expect(isMaintenanceMode()).toBe(true);
    expect(getMaintenanceState().reason).toBe('nightly DB work');
    expect(getMaintenanceState().scheduledAt).toBeNull(); // consumed

    // A second tick must not fire again (and must not double-notify).
    expect(await checkScheduledMaintenance()).toBe(false);
    expect(isMaintenanceMode()).toBe(true);
  });

  it('clears a due window without flipping when already in maintenance', async () => {
    await setMaintenance(true, 'manual');
    applyMaintenanceClusterMessage(JSON.stringify({
      type: 'maintenance_scheduled',
      scheduledAt: new Date(Date.now() - 1_000).toISOString(),
      reason: 'scheduled',
    }));
    expect(await checkScheduledMaintenance()).toBe(false);
    expect(getMaintenanceState().reason).toBe('manual');
    expect(getMaintenanceState().scheduledAt).toBeNull();
  });
});
