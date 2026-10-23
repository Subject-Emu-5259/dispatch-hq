import { describe, it, expect } from 'vitest';
import { settingsAllowAnalytics, normalizeSessionPayload, normalizeMissionPayload, analyticsWindowStart } from '../routes/analytics';

// Opt-in analytics guard: the client no-ops when analyticsEnabled is false,
// and the server double-checks the same setting so a stray call can't write a
// row. Counts only — no PII is ever stored.

describe('settingsAllowAnalytics (opt-in guard)', () => {
  it('allows exactly analyticsEnabled === true', () => {
    expect(settingsAllowAnalytics({ analyticsEnabled: true })).toBe(true);
    expect(settingsAllowAnalytics({ analyticsEnabled: false })).toBe(false);
    expect(settingsAllowAnalytics({})).toBe(false);
    expect(settingsAllowAnalytics(null)).toBe(false);
    expect(settingsAllowAnalytics(undefined)).toBe(false);
  });

  it('rejects truthy-but-not-true values (no loose coercion)', () => {
    expect(settingsAllowAnalytics({ analyticsEnabled: 1 })).toBe(false);
    expect(settingsAllowAnalytics({ analyticsEnabled: 'true' })).toBe(false);
  });
});

describe('normalizeSessionPayload (counts only, clamped)', () => {
  it('normalizes a well-formed payload', () => {
    const started = new Date(Date.UTC(2026, 7, 14, 12, 0, 0));
    const ended = new Date(Date.UTC(2026, 7, 14, 12, 30, 0));
    const s = normalizeSessionPayload({
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationSeconds: 1800,
      missionsCompleted: 7,
      city: 'Little Rock, AR',
      service: 'police',
    });
    expect(s).toEqual({
      startedAt: started,
      endedAt: ended,
      durationSeconds: 1800,
      missionsCompleted: 7,
      city: 'Little Rock, AR',
      service: 'police',
    });
  });

  it('clamps duration and mission counts into safe ranges', () => {
    expect(normalizeSessionPayload({ durationSeconds: -5 }).durationSeconds).toBe(0);
    expect(normalizeSessionPayload({ durationSeconds: 999999 }).durationSeconds).toBe(86400);
    expect(normalizeSessionPayload({ missionsCompleted: -3 }).missionsCompleted).toBe(0);
    expect(normalizeSessionPayload({ missionsCompleted: 999999 }).missionsCompleted).toBe(100000);
    // Non-numeric garbage falls back to 0, never NaN.
    expect(normalizeSessionPayload({ durationSeconds: 'abc' }).durationSeconds).toBe(0);
  });

  it('falls back to now for missing/invalid dates', () => {
    const before = Date.now();
    const s = normalizeSessionPayload({});
    const after = Date.now();
    expect(s.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(s.startedAt.getTime()).toBeLessThanOrEqual(after);
    expect(s.endedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('truncates city/service and blanks empty strings (no PII creep)', () => {
    expect(normalizeSessionPayload({ city: 'x'.repeat(300) }).city).toHaveLength(100);
    expect(normalizeSessionPayload({ service: 'x'.repeat(50) }).service).toHaveLength(20);
    expect(normalizeSessionPayload({ city: '   ' }).city).toBeNull();
    expect(normalizeSessionPayload({ service: '' }).service).toBeNull();
    expect(normalizeSessionPayload({}).city).toBeNull();
  });
});

describe('normalizeMissionPayload (per-mission sample)', () => {
  it('normalizes a well-formed record', () => {
    expect(normalizeMissionPayload({
      missionType: 'structure_fire',
      category: 'fire',
      responseTimeSeconds: 42,
    })).toEqual({ missionType: 'structure_fire', category: 'fire', responseTimeSeconds: 42 });
  });

  it('drops records with neither a type nor a category', () => {
    expect(normalizeMissionPayload({})).toBeNull();
    expect(normalizeMissionPayload({ responseTimeSeconds: 10 })).toBeNull();
    expect(normalizeMissionPayload({ missionType: '  ', category: '' })).toBeNull();
  });

  it('clamps response time and truncates strings (no PII creep)', () => {
    expect(normalizeMissionPayload({ missionType: 'x'.repeat(300), responseTimeSeconds: 5 })?.missionType).toHaveLength(60);
    expect(normalizeMissionPayload({ category: 'x'.repeat(50), responseTimeSeconds: 5 })?.category).toHaveLength(20);
    expect(normalizeMissionPayload({ missionType: 'fire', responseTimeSeconds: -5 })?.responseTimeSeconds).toBe(0);
    expect(normalizeMissionPayload({ missionType: 'fire', responseTimeSeconds: 999999 })?.responseTimeSeconds).toBe(86400);
    expect(normalizeMissionPayload({ missionType: 'fire', responseTimeSeconds: 'abc' })?.responseTimeSeconds).toBe(0);
  });

  it('coerces numeric strings and rounds toward zero', () => {
    expect(normalizeMissionPayload({ missionType: 'fire', responseTimeSeconds: '42.7' })?.responseTimeSeconds).toBe(42);
    expect(normalizeMissionPayload({ missionType: 'fire', responseTimeSeconds: 42 })?.responseTimeSeconds).toBe(42);
  });
});

describe('analyticsWindowStart (trailing-7-day aggregation)', () => {
  it('returns an ISO timestamp 7 days before `now`', () => {
    const now = Date.UTC(2026, 7, 14, 12, 0, 0);
    const expected = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(analyticsWindowStart(now)).toBe(expected);
  });

  it('supports a custom window length', () => {
    const now = Date.UTC(2026, 7, 14, 12, 0, 0);
    expect(analyticsWindowStart(now, 1)).toBe(new Date(now - 24 * 60 * 60 * 1000).toISOString());
  });
});
