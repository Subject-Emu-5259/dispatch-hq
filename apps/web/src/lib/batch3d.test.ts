// Batch 3d harness — real behavior, not parser existence. Every feature
// below is exercised through its pure module (or the reward stack) on
// fixtures, including streak rules, reward math, and save-failure copy.
import { describe, it, expect } from 'vitest';
import appRaw from '../App.tsx?raw';
import mapViewRaw from '../components/map/MapView.tsx?raw';
import offlineBannerRaw from '../components/OfflineBanner.tsx?raw';
import challengeTrackerRaw from '../components/ChallengeTracker.tsx?raw';
import fogOfWarRaw from '../components/FogOfWar.tsx?raw';
import radioCommsRaw from '../components/RadioComms.tsx?raw';
import stationDetailRaw from '../components/StationDetailModal.tsx?raw';
const componentSources = import.meta.glob('../components/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
import { SEASONAL_EVENTS, activeSeasonalEvent, seasonalBoostedPick } from './seasonal';
import {
  emptyChallengeState, recordDispatch, recordMissionOutcome, recordAidAnswers,
  claimChallenge, rolloverChallengeState, DAILY_CHALLENGES, WEEKLY_CHALLENGES,
} from './challenges';
import {
  fogZonesForCenter, newlyRevealedZones, exploredBonusPct, fogBonusMultiplier, parseFogRevealed,
} from './fogExploration';
import { missionStateLine } from './radioMissionLines';
import { classifySaveError, SAVE_FAILURE_COPY } from './saveFailure';
import { STATION_PATCHES, patchFor, serviceForStationType } from './stationCustom';
import { computeMissionRewards } from './rewards';

const winter = new Date(Date.UTC(2026, 0, 15, 12));
const summer = new Date(Date.UTC(2026, 7, 12, 12));
const april = new Date(Date.UTC(2026, 3, 15, 12));

describe('batch3d seasons', () => {
  it('adds one window entry + seeded badge per new season, Halloween untouched', () => {
    const w = SEASONAL_EVENTS.find((e) => e.id === 'winter-storm')!;
    const s = SEASONAL_EVENTS.find((e) => e.id === 'summer-wildfire')!;
    const h = SEASONAL_EVENTS.find((e) => e.id === 'halloween')!;
    expect(w.badge.key).toBe('seasonal_winter_storm');
    expect(s.badge.key).toBe('seasonal_summer_wildfire');
    expect(h.window).toEqual({ start: { month: 10, day: 26 }, end: { month: 11, day: 1 } });
    expect(activeSeasonalEvent(winter)?.id).toBe('winter-storm');
    expect(activeSeasonalEvent(summer)?.id).toBe('summer-wildfire');
    expect(activeSeasonalEvent(april)).toBeNull();
    // Boosted templates are real mission templates.
    expect(w.boostedTemplates).toContain('chimney_fire');
    expect(s.boostedTemplates).toContain('wildfire');
  });
  it('seasonal boosted pick can return a winter/summer template in-window', () => {
    const picks = new Set<string>();
    const cands = [{ id: 'chimney_fire' }, { id: 'room_fire' }];
    for (let i = 0; i < 200; i++) {
      const p = seasonalBoostedPick(cands, winter);
      if (p) picks.add(p.id);
    }
    expect(picks.has('chimney_fire')).toBe(true);
  });
});

describe('batch3d challenges', () => {
  it('dispatch progress -> completion -> reward math (XP always, coins main-only)', () => {
    let st = emptyChallengeState(new Date(Date.UTC(2026, 10, 3, 12)));
    for (let i = 0; i < 5; i++) st = recordDispatch(st, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(st.daily['dispatch-5'].completed).toBe(true);
    const claimed = claimChallenge(st, 'daily', 'dispatch-5', true);
    expect('error' in claimed).toBe(false);
    if (!('error' in claimed)) {
      expect(claimed.xp).toBe(100);
      expect(claimed.coins).toBe(50);
      expect(claimed.state.daily['dispatch-5'].claimed).toBe(true);
    }
    const reddit = claimChallenge(st, 'daily', 'dispatch-5', false);
    if (!('error' in reddit)) expect(reddit.coins).toBe(0);
    // Double-claim from the already-claimed state is an error.
    if (!('error' in claimed)) {
      expect(claimChallenge(claimed.state, 'daily', 'dispatch-5', true)).toMatchObject({ error: 'Already claimed' });
    }
    // Claiming an incomplete challenge is an error.
    expect(claimChallenge(emptyChallengeState(new Date(Date.UTC(2026, 10, 3, 12))), 'daily', 'dispatch-5', true)).toMatchObject({ error: expect.any(String) });
  });
  it('zero-fail streak: 3 clears complete flawless, a fail resets it', () => {
    let st = emptyChallengeState(new Date(Date.UTC(2026, 10, 3, 12)));
    st = recordMissionOutcome(st, true, new Date(Date.UTC(2026, 10, 3, 12)));
    st = recordMissionOutcome(st, true, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(st.daily['flawless-3'].completed).toBe(false);
    st = recordMissionOutcome(st, true, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(st.daily['flawless-3'].completed).toBe(true);
    expect(st.streak).toBe(3);
    expect(st.weekly['clears-15'].progress).toBe(3);
    st = recordMissionOutcome(st, false, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(st.streak).toBe(0);
    expect(st.daily['flawless-3'].progress).toBe(0);
  });
  it('aid answers count only the delta since first sync; weekly aid target works', () => {
    let st = emptyChallengeState(new Date(Date.UTC(2026, 10, 3, 12)));
    st = recordAidAnswers(st, 7, new Date(Date.UTC(2026, 10, 3, 12))); // baseline only
    expect(st.daily['aid-1']?.progress ?? 0).toBe(0);
    st = recordAidAnswers(st, 8, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(st.daily['aid-1'].completed).toBe(true);
    expect(st.weekly['aid-3'].progress).toBe(1);
  });
  it('day rollover resets daily but keeps weekly; week rollover resets both', () => {
    let st = emptyChallengeState(new Date(Date.UTC(2026, 10, 3, 12)));
    st = recordDispatch(st, new Date(Date.UTC(2026, 10, 3, 12)));
    const nextDay = rolloverChallengeState(st, new Date(Date.UTC(2026, 10, 4, 12)));
    expect(nextDay.daily['dispatch-5']).toBeUndefined();
    expect(nextDay.weekly['dispatch-25'].progress).toBe(1);
    const nextWeek = rolloverChallengeState(st, new Date(Date.UTC(2026, 10, 10, 12)));
    expect(nextWeek.weekly['dispatch-25']).toBeUndefined();
  });
  it('defs are sane: 3 daily + 3 weekly, all targets positive', () => {
    expect(DAILY_CHALLENGES.length).toBe(3);
    expect(WEEKLY_CHALLENGES.length).toBe(3);
    for (const d of [...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES]) {
      expect(d.target).toBeGreaterThan(0);
      expect(d.xp).toBeGreaterThan(0);
    }
  });
});

describe('batch3d livery + station customization', () => {
  it('patches resolve, default is shield; station type maps to service', () => {
    expect(STATION_PATCHES.length).toBeGreaterThanOrEqual(3);
    expect(patchFor(undefined).id).toBe('shield');
    expect(patchFor('flame').name).toBe('Flame');
    expect(serviceForStationType('police_station')).toBe('police');
    expect(serviceForStationType('ems_station')).toBe('ems');
    expect(serviceForStationType('fire_station')).toBe('fire');
  });
});

describe('batch3d fog of war', () => {
  const center: [number, number] = [35.15, -90.05];
  it('zones are deterministic across calls', () => {
    expect(fogZonesForCenter(center)).toEqual(fogZonesForCenter(center));
    expect(fogZonesForCenter(center).length).toBe(20);
  });
  it('unit travel reveals zones; stations alone do not reveal everything', () => {
    const zones = fogZonesForCenter(center);
    const far = newlyRevealedZones(zones, [], [{ lat: 36.5, lng: -91.5 }]);
    expect(far).toEqual([]);
    const trail = zones.slice(0, 5).map((z) => ({ lat: z.lat, lng: z.lng }));
    const revealed = newlyRevealedZones(zones, [], trail);
    expect(revealed.length).toBeGreaterThanOrEqual(5);
    // Re-reveal is a no-op (idempotent).
    expect(newlyRevealedZones(zones, revealed, trail)).toEqual([]);
  });
  it('explored-zone bonus math: per-zone, capped, full-clear extra', () => {
    expect(exploredBonusPct(0)).toBe(0);
    expect(exploredBonusPct(4)).toBe(2);
    expect(exploredBonusPct(20)).toBe(15); // 10 cap + 5 full-clear
    expect(exploredBonusPct(40)).toBe(15);
    expect(fogBonusMultiplier(20)).toBeCloseTo(1.15);
    expect(parseFogRevealed(['fog_1', 42, 'x'])).toEqual(['fog_1']);
  });
  it('fog multiplier flows through the real reward stack', () => {
    const base = computeMissionRewards({
      mission: { category: 'fire', creditsReward: 100, xpReward: 50, timeRemaining: 0, totalTime: 600, disasterId: undefined, recovery: undefined, chainStage: undefined },
      playerLevel: 1, service: 'fire', allianceXp: null,
    });
    const boosted = computeMissionRewards({
      mission: { category: 'fire', creditsReward: 100, xpReward: 50, timeRemaining: 0, totalTime: 600, disasterId: undefined, recovery: undefined, chainStage: undefined },
      playerLevel: 1, service: 'fire', allianceXp: null, fogRewardMult: 1.15,
    });
    expect(boosted.earnedCredits).toBe(Math.round(base.earnedCredits * 1.15));
    expect(boosted.earnedXp).toBe(Math.round(base.earnedXp * 1.15));
  });
});

describe('batch3d radio comms', () => {
  it('mission-state lines fire on transitions, not on repeats or bookkeeping', () => {
    expect(missionStateLine(null, 'en_route', 'Structure Fire')).toMatch(/rolling/);
    expect(missionStateLine('en_route', 'on_scene', 'Structure Fire')).toMatch(/on scene/);
    expect(missionStateLine('on_scene', 'completed', 'Structure Fire')).toMatch(/All clear/);
    expect(missionStateLine('completed', 'failed', 'Structure Fire')).toMatch(/closed without/);
    expect(missionStateLine('completed', 'completed', 'Structure Fire')).toBeNull();
    expect(missionStateLine(null, 'generated', 'Structure Fire')).toBeNull();
    expect(missionStateLine(null, 'active', 'Structure Fire')).toBeNull();
  });
});

describe('batch3d save-failure specificity + polish', () => {
  it('classifies offline / too-large / stale / auth / server distinctly', () => {
    expect(classifySaveError(new Error('fetch failed'), false)).toBe('offline');
    expect(classifySaveError(new Error('Save too large'), true)).toBe('too-large');
    expect(classifySaveError(new Error('Request too large'), true)).toBe('too-large');
    expect(classifySaveError(new Error('stale: a newer save exists'), true)).toBe('stale');
    expect(classifySaveError(new Error('401 unauthorized'), true)).toBe('auth');
    expect(classifySaveError(new Error('boom'), true)).toBe('server');
    expect(SAVE_FAILURE_COPY['too-large'].message).not.toMatch(/Could not reach/);
    expect(SAVE_FAILURE_COPY.stale.message).toMatch(/newer save/);
    expect(SAVE_FAILURE_COPY.offline.message).toMatch(/offline/i);
  });
  it('polish assertions on the real tree: text floor, control position, offline banner', () => {
    const small = Object.entries(componentSources)
      .filter(([path]) => !path.endsWith('.test.tsx'))
      .filter(([, src]) => /text-\[(8|9|10)px\]/.test(src as string))
      .map(([path]) => path);
    expect(small).toEqual([]);
    expect(appRaw as string).toMatch(/OfflineBanner/);
    expect(appRaw as string).toMatch(/useBatch3dSync/);
    expect(mapViewRaw as string).toMatch(/NavigationControl\(\{ showCompass: false \}\), 'bottom-right'/);
    expect(offlineBannerRaw as string).toMatch(/navigator\.onLine/);
    expect(challengeTrackerRaw as string).toMatch(/claimChallenge/);
    expect(fogOfWarRaw as string).toMatch(/fogZonesForCenter/);
    expect(radioCommsRaw as string).toMatch(/missionStateLine/);
    expect(stationDetailRaw as string).toMatch(/LiveryPicker/);
    expect(stationDetailRaw as string).toMatch(/STATION_PATCHES/);
  });
});
