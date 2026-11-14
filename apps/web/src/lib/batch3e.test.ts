// Batch 3e harness — real behavior, not parser existence. Tech modifier
// math, replay grades/stats/caps, gallery caps/parsing, campaign chain
// progression, and offline-queue limits are exercised on fixtures; UI
// wiring is asserted against the real sources (the visual verdict —
// tabs, gallery, banner — is Dre's playtest).
import { describe, it, expect } from 'vitest';
import appRaw from '../App.tsx?raw';
import shiftReportRaw from '../components/ShiftReportModal.tsx?raw';
import onboardingRaw from '../components/OnboardingOverlay.tsx?raw';
import pauseRaw from '../components/PauseScreen.tsx?raw';
import wsClientRaw from './wsClient.ts?raw';
import saveRaw from '../hooks/useSaveSystem.ts?raw';
import { TECH_TREE, TECH_BY_ID } from './techData';
import {
  batch3eClearMultiplier, droneClearMultiplier, hazmatClearMultiplier, k9ClearMultiplier,
  gradeForResponse, gradeForEntry, recordMissionHistory, shiftReplayStats, MISSION_HISTORY_CAP,
  addPhotoSnapshot, removePhotoSnapshot, parsePhotoGallery, PHOTO_GALLERY_CAP,
  TUTORIAL_MISSION_CHAIN, startTutorialCampaign, parseTutorialCampaign, advanceTutorialCampaign,
  skipTutorialCampaignStep,
  enqueueOfflineAction, drainOfflineQueue, OFFLINE_QUEUE_CAP, OFFLINE_QUEUE_MAX_ATTEMPTS,
  type MissionHistoryEntry, type PhotoSnapshot, type QueuedAction,
} from './batch3e';
import { wsClient } from './wsClient';

const entry = (over: Partial<MissionHistoryEntry> = {}): MissionHistoryEntry => ({
  id: 'm1', name: 'Test Call', category: 'fire', resolvedAt: 1000,
  responseSec: 90, cleared: true, creditsEarned: 500, xpEarned: 100, ...over,
});

describe('batch3e tech tree expansion', () => {
  it('adds three standalone operations nodes, no prerequisites, distinct effects', () => {
    for (const id of ['op-drone', 'op-hazmat', 'op-k9']) {
      const node = TECH_BY_ID[id];
      expect(node).toBeDefined();
      expect(node.branch).toBe('operations');
      expect(node.requires ?? []).toEqual([]);
    }
    expect(TECH_BY_ID['op-drone'].applies).toBe('scene_sizeup');
    expect(TECH_BY_ID['op-hazmat'].applies).toBe('hazmat_team');
    expect(TECH_BY_ID['op-k9'].applies).toBe('k9_unit');
    expect(TECH_TREE.filter((t) => t.branch === 'operations')).toHaveLength(3);
  });
  it('modifier math: drone all calls, hazmat hazmat-only, k9 police-only, stacking', () => {
    const none = new Set<string>();
    expect(batch3eClearMultiplier('fire', none)).toBe(1);
    const drone = new Set(['op-drone']);
    expect(droneClearMultiplier(drone)).toBe(1.25);
    expect(batch3eClearMultiplier('ems', drone)).toBe(1.25);
    const haz = new Set(['op-hazmat']);
    expect(hazmatClearMultiplier('hazmat', haz)).toBe(1.3);
    expect(hazmatClearMultiplier('fire', haz)).toBe(1);
    const k9 = new Set(['op-k9']);
    expect(k9ClearMultiplier('police', k9)).toBe(1.2);
    expect(k9ClearMultiplier('ems', k9)).toBe(1);
    const all = new Set(['op-drone', 'op-hazmat', 'op-k9']);
    expect(batch3eClearMultiplier('hazmat', all)).toBeCloseTo(1.25 * 1.3, 10);
    expect(batch3eClearMultiplier('police', all)).toBeCloseTo(1.25 * 1.2, 10);
    expect(batch3eClearMultiplier('fire', all)).toBe(1.25);
  });
});

describe('batch3e incident replay', () => {
  it('grades thresholds + failed always F + unmeasured clear is C', () => {
    expect(gradeForResponse(120, true)).toBe('S');
    expect(gradeForResponse(121, true)).toBe('A');
    expect(gradeForResponse(240, true)).toBe('A');
    expect(gradeForResponse(420, true)).toBe('B');
    expect(gradeForResponse(600, true)).toBe('C');
    expect(gradeForResponse(601, true)).toBe('D');
    expect(gradeForResponse(30, false)).toBe('F');
    expect(gradeForResponse(null, true)).toBe('C');
  });
  it('history caps at 50 keeping newest, stats aggregate honestly', () => {
    let history: MissionHistoryEntry[] = [];
    for (let i = 0; i < MISSION_HISTORY_CAP + 5; i++) {
      history = recordMissionHistory(history, entry({ id: `m${i}`, responseSec: 100 + i, cleared: i % 5 !== 0 }));
    }
    expect(history).toHaveLength(MISSION_HISTORY_CAP);
    expect(history[0].id).toBe('m5');
    expect(history[history.length - 1].id).toBe(`m${MISSION_HISTORY_CAP + 4}`);
    const stats = shiftReplayStats(history);
    expect(stats.total).toBe(MISSION_HISTORY_CAP);
    expect(stats.cleared + stats.failed).toBe(MISSION_HISTORY_CAP);
    expect(stats.clearancePct).toBe(Math.round((stats.cleared / MISSION_HISTORY_CAP) * 100));
    expect(stats.bestResponseSec).toBeLessThanOrEqual(stats.avgResponseSec!);
    expect(gradeForEntry(entry({ responseSec: 90 }))).toBe('S');
  });
  it('empty history stats are zero/null, never NaN', () => {
    const stats = shiftReplayStats([]);
    expect(stats).toMatchObject({ total: 0, cleared: 0, failed: 0, clearancePct: 0, avgResponseSec: null, bestResponseSec: null });
  });
});

describe('batch3e photo gallery', () => {
  const card = { username: 'Cmdr', rankIcon: '⭐', rankTitle: 'Chief', level: 5, serviceLabel: 'FIRE', shiftDurationLabel: '1h 2m', summary: {} as never, creditsEarned: 100, xpEarned: 50, zoneRows: [], contest: null };
  it('caps at 12 keeping newest, dedups by id, parses defensively', () => {
    let gallery: PhotoSnapshot[] = [];
    for (let i = 0; i < PHOTO_GALLERY_CAP + 3; i++) {
      gallery = addPhotoSnapshot(gallery, { id: `s${i}`, capturedAt: i, title: `t${i}`, card: card as never });
    }
    expect(gallery).toHaveLength(PHOTO_GALLERY_CAP);
    expect(gallery[0].id).toBe('s3');
    const deduped = addPhotoSnapshot(gallery, { id: 's3', capturedAt: 99, title: 't3b', card: card as never });
    expect(deduped).toHaveLength(PHOTO_GALLERY_CAP);
    expect(removePhotoSnapshot(deduped, 's3')).toHaveLength(PHOTO_GALLERY_CAP - 1);
    expect(parsePhotoGallery(null)).toEqual([]);
    expect(parsePhotoGallery([{ id: 'x' }])).toEqual([]);
    expect(parsePhotoGallery([{ id: 'x', capturedAt: 1, title: 't', card }]).length).toBe(1);
  });
});

describe('batch3e onboarding campaign', () => {
  it('chain is traffic -> fire -> ems with hints', () => {
    expect(TUTORIAL_MISSION_CHAIN.map((s) => s.category)).toEqual(['traffic', 'fire', 'ems']);
    expect(TUTORIAL_MISSION_CHAIN.every((s) => s.hint.length > 20)).toBe(true);
  });
  it('strict current-step match: wrong category stalls, right category advances, last completes', () => {
    let state = startTutorialCampaign(1000);
    expect(state.active).toBe(true);
    let adv = advanceTutorialCampaign(state, 'fire');
    expect(adv.advanced).toBe(false);
    expect(adv.state.stepIndex).toBe(0);
    adv = advanceTutorialCampaign(state, 'traffic');
    expect(adv.advanced).toBe(true);
    expect(adv.state.stepIndex).toBe(1);
    adv = advanceTutorialCampaign(adv.state, 'fire');
    expect(adv.state.stepIndex).toBe(2);
    adv = advanceTutorialCampaign(adv.state, 'ems');
    expect(adv.completed).toBe(true);
    expect(adv.state.active).toBe(false);
    expect(adv.state.completedAt).not.toBeNull();
    expect(advanceTutorialCampaign(adv.state, 'ems').advanced).toBe(false);
    expect(parseTutorialCampaign({ active: true, stepIndex: 99 }).stepIndex).toBe(3);
    expect(parseTutorialCampaign(undefined).active).toBe(false);
  });
  it('skip advances one step and records the skipped step id', () => {
    const state = startTutorialCampaign(1000);
    const res = skipTutorialCampaignStep(state, 2000);
    expect(res.advanced).toBe(true);
    expect(res.completed).toBe(false);
    expect(res.state.stepIndex).toBe(1);
    expect(res.state.active).toBe(true);
    expect(res.state.skippedStepIds).toEqual(['tut-traffic']);
    expect(res.state.completedAt).toBeNull();
    // A clear after a skip still advances from the skipped position.
    const adv = advanceTutorialCampaign(res.state, 'fire');
    expect(adv.advanced).toBe(true);
    expect(adv.state.stepIndex).toBe(2);
    expect(adv.state.skippedStepIds).toEqual(['tut-traffic']);
  });
  it('skipping the final step ends the campaign as skipped, not completed', () => {
    let state = startTutorialCampaign(1000);
    state = advanceTutorialCampaign(state, 'traffic').state;
    state = advanceTutorialCampaign(state, 'fire').state;
    const res = skipTutorialCampaignStep(state, 3000);
    expect(res.advanced).toBe(true);
    expect(res.completed).toBe(true);
    expect(res.state.active).toBe(false);
    expect(res.state.stepIndex).toBe(3);
    expect(res.state.completedAt).toBe(3000);
    expect(res.state.skipped).toBe(true);
    expect(res.state.skippedStepIds).toEqual(['tut-ems']);
  });
  it('skip is a no-op on an inactive or finished campaign', () => {
    expect(skipTutorialCampaignStep({ active: false, stepIndex: 0, startedAt: null, completedAt: null }).advanced).toBe(false);
    const done = { active: false, stepIndex: 3, startedAt: 1000, completedAt: 2000 };
    expect(skipTutorialCampaignStep(done).advanced).toBe(false);
  });
  it('parse round-trips skipped steps and the skipped flag; bad values sanitize', () => {
    const parsed = parseTutorialCampaign({ active: true, stepIndex: 1, skippedStepIds: ['tut-traffic'], skipped: false });
    expect(parsed.skippedStepIds).toEqual(['tut-traffic']);
    expect(parsed.skipped).toBeUndefined();
    expect(parseTutorialCampaign({ active: false, stepIndex: 3, completedAt: 5, skipped: true }).skipped).toBe(true);
    expect(parseTutorialCampaign({ skippedStepIds: ['a', 42, null] }).skippedStepIds).toEqual(['a']);
    expect(parseTutorialCampaign({ skippedStepIds: 'nope' }).skippedStepIds).toBeUndefined();
  });
});

describe('batch3e offline action queue', () => {
  it('enqueue caps at 50 with an honest rejection, dedups by id', () => {
    let queue: QueuedAction[] = [];
    for (let i = 0; i < OFFLINE_QUEUE_CAP; i++) {
      const res = enqueueOfflineAction(queue, { id: `a${i}`, kind: 'message', payload: i });
      expect(res.ok).toBe(true);
      queue = res.queue;
    }
    expect(queue).toHaveLength(OFFLINE_QUEUE_CAP);
    const full = enqueueOfflineAction(queue, { id: 'a51', kind: 'message', payload: 51 });
    expect(full.ok).toBe(false);
    expect('error' in full && full.error).toMatch(/full/);
    const dup = enqueueOfflineAction(queue, { id: 'a0', kind: 'message', payload: 0 });
    expect(dup.ok).toBe(true);
    expect(dup.queue).toHaveLength(OFFLINE_QUEUE_CAP);
  });
  it('drain sends in order, counts attempts, drops at max attempts', () => {
    const queue = [
      { id: 'ok', kind: 'm', payload: 1, queuedAt: 1, attempts: 0 },
      { id: 'flaky', kind: 'm', payload: 2, queuedAt: 1, attempts: OFFLINE_QUEUE_MAX_ATTEMPTS - 1 },
      { id: 'retry', kind: 'm', payload: 3, queuedAt: 1, attempts: 0 },
    ];
    const sent: string[] = [];
    const result = drainOfflineQueue(queue, (a) => {
      if (a.id === 'ok') { sent.push(a.id); return true; }
      return false;
    });
    expect(result.sent.map((a) => a.id)).toEqual(['ok']);
    expect(result.dropped.map((a) => a.id)).toEqual(['flaky']);
    expect(result.remaining.map((a) => a.id)).toEqual(['retry']);
    expect(result.remaining[0].attempts).toBe(1);
    expect(sent).toEqual(['ok']);
  });
  it('wsClient queues while disconnected instead of failing silently', () => {
    const before = wsClient.getQueuedActionCount();
    expect(wsClient.sendOrQueue({ type: 'unit_position', unitId: 'u1' }, 'unit_position')).toBe('queued');
    expect(wsClient.getQueuedActionCount()).toBe(before + 1);
  });
});

describe('batch3e wiring (source)', () => {
  it('App records history on clear + expire and advances the campaign', () => {
    expect(appRaw).toContain('appendMissionHistory');
    expect(appRaw).toContain('advanceTutorialCampaign');
    expect(appRaw).toContain("title: 'First Shift Complete!'");
  });
  it('ShiftReport has replay tab + snapshot buttons, gallery reuses shareCard', () => {
    expect(shiftReportRaw).toContain('ReplayTab');
    expect(shiftReportRaw).toContain('Save Snapshot to Gallery');
    expect(shiftReportRaw).toContain('PhotoGalleryModal');
    expect(shiftReportRaw).toContain('shiftReplayStats');
  });
  it('Onboarding offers the campaign, Pause opens the gallery, save persists 3e fields', () => {
    expect(onboardingRaw).toContain('Guided First Shift');
    expect(onboardingRaw).toContain('startTutorialCampaign');
    expect(pauseRaw).toContain('Photo Gallery');
    expect(pauseRaw).toContain('PhotoGalleryModal');
    expect(saveRaw).toContain('missionHistory');
    expect(saveRaw).toContain('snapshots');
    expect(saveRaw).toContain('tutorialCampaign');
  });
  it('wsClient sendOrQueue + reconnect flush exist', () => {
    expect(wsClientRaw).toContain('sendOrQueue');
    expect(wsClientRaw).toContain('flushOfflineQueue');
  });
});
