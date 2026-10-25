import { describe, it, expect } from 'vitest';
import {
  SEASONAL_EVENTS,
  activeSeasonalEvent,
  seasonalRewardMult,
  seasonalBoostedPick,
  seasonalStatus,
  relevantSeasonalEvent,
  seasonalWindowLabel,
  seasonalTimeLeft,
} from './seasonal';

const july4 = new Date(Date.UTC(2026, 6, 4, 12));
const july8 = new Date(Date.UTC(2026, 6, 8, 12));
const christmas = new Date(Date.UTC(2026, 11, 25, 12));
const april = new Date(Date.UTC(2026, 3, 15, 12));

describe('seasonal', () => {
  it('defines 2+ events with windows, boosts, and badges', () => {
    expect(SEASONAL_EVENTS.length).toBeGreaterThanOrEqual(2);
    for (const ev of SEASONAL_EVENTS) {
      expect(ev.rewardMult).toBeGreaterThan(1);
      expect(ev.boostedTemplates.length).toBeGreaterThan(0);
      expect(ev.badge.key).toMatch(/^seasonal_/);
      expect(ev.window.start.month).toBeGreaterThanOrEqual(1);
      expect(ev.window.end.month).toBeLessThanOrEqual(12);
    }
  });

  it('detects the active event inside its inclusive window', () => {
    expect(activeSeasonalEvent(july4)?.id).toBe('independence-day');
    expect(activeSeasonalEvent(christmas)?.id).toBe('christmas');
    expect(activeSeasonalEvent(april)).toBeNull();
  });

  it('does not leak into the days right after a window closes', () => {
    expect(activeSeasonalEvent(july8)).toBeNull();
  });

  it('applies the reward multiplier only during the event', () => {
    expect(seasonalRewardMult(july4)).toBe(1.5);
    expect(seasonalRewardMult(april)).toBe(1);
  });

  it('classifies windows as live / ended / upcoming (UTC)', () => {
    const july = SEASONAL_EVENTS.find((e) => e.id === 'independence-day')!;
    const dec = SEASONAL_EVENTS.find((e) => e.id === 'christmas')!;
    expect(seasonalStatus(july, new Date(Date.UTC(2026, 6, 4)))).toBe('live');
    expect(seasonalStatus(july, new Date(Date.UTC(2026, 6, 7)))).toBe('ended');
    expect(seasonalStatus(dec, new Date(Date.UTC(2026, 5, 1)))).toBe('upcoming');
    expect(seasonalStatus(dec, new Date(Date.UTC(2026, 11, 26)))).toBe('live');
    expect(seasonalWindowLabel(july)).toBe('Jul 1 – 6');
  });

  it('relevantSeasonalEvent picks live > recent-ended > next upcoming', () => {
    expect(relevantSeasonalEvent(new Date(Date.UTC(2026, 6, 4)))?.id).toBe('independence-day');
    // July 8: ended 2 days ago → final standings still shown.
    expect(relevantSeasonalEvent(new Date(Date.UTC(2026, 6, 8)))?.id).toBe('independence-day');
    // July 20: too stale → next upcoming is Halloween (added 2026-10-25).
    expect(relevantSeasonalEvent(new Date(Date.UTC(2026, 6, 20)))?.id).toBe('halloween');
    // April: next upcoming is July 4th.
    expect(relevantSeasonalEvent(new Date(Date.UTC(2026, 3, 15)))?.id).toBe('independence-day');
  });

  it('seasonalTimeLeft counts down days/hours only while the window is live', () => {
    const july = SEASONAL_EVENTS.find((e) => e.id === 'independence-day')!;
    // Not live: never returns a countdown.
    expect(seasonalTimeLeft(july, april)).toBeNull();
    expect(seasonalTimeLeft(july, july8)).toBeNull(); // ended
    // Live, midday July 4: window ends Jul 6 23:59:59 UTC → ceil(2.5d) = 3 days.
    expect(seasonalTimeLeft(july, july4)).toBe('3 days left');
    // Live on the last day: fewer than 24 hours remain → hours.
    expect(seasonalTimeLeft(july, new Date(Date.UTC(2026, 6, 6, 12)))).toBe('12 hours left');
    // Live on the last day just before midnight: rounds up to 1 hour.
    expect(seasonalTimeLeft(july, new Date(Date.UTC(2026, 6, 6, 23, 30)))).toBe('1 hour left');
  });

  it('halloween window covers launch week and Oct 31 (UTC, inclusive)', () => {
    const hw = SEASONAL_EVENTS.find((e) => e.id === 'halloween')!;
    expect(hw.window).toEqual({ start: { month: 10, day: 26 }, end: { month: 11, day: 1 } });
    expect(hw.badge.key).toBe('seasonal_halloween');
    expect(seasonalWindowLabel(hw)).toBe('Oct 26 – Nov 1');
    expect(activeSeasonalEvent(new Date(Date.UTC(2026, 9, 27, 12)))?.id).toBe('halloween');
    expect(activeSeasonalEvent(new Date(Date.UTC(2026, 9, 31, 12)))?.id).toBe('halloween');
    expect(activeSeasonalEvent(new Date(Date.UTC(2026, 10, 1, 12)))?.id).toBe('halloween');
    expect(activeSeasonalEvent(new Date(Date.UTC(2026, 10, 2, 12)))).toBeNull();
    expect(seasonalRewardMult(new Date(Date.UTC(2026, 9, 31, 12)))).toBe(1.5);
  });

  it('seasonalBoostedPick only returns boosted templates during the event', () => {
    const pool = [
      { id: 'room_fire', spawnWeight: 5 },
      { id: 'medical_call', spawnWeight: 5 },
      { id: 'car_crash', spawnWeight: 5 },
    ];
    // Outside any window: never boosts.
    expect(seasonalBoostedPick(pool, april)).toBeNull();
    // During July 4th: only room_fire is in the boosted list, so the pick is
    // either null or room_fire — never medical_call or car_crash.
    for (let i = 0; i < 50; i++) {
      const pick = seasonalBoostedPick(pool, july4);
      if (pick) expect(pick.id).toBe('room_fire');
    }
  });
});
