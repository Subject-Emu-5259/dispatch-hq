import { describe, it, expect } from 'vitest';
import { isoWeekKey, emptyWeekly } from '../index';

describe('isoWeekKey', () => {
  it('keys a mid-week date to the correct ISO week', () => {
    // Tuesday 2026-08-04 is ISO week 32 of 2026.
    expect(isoWeekKey(new Date(2026, 7, 4))).toBe('2026-W32');
  });

  it('treats Sunday and the following Monday as different weeks', () => {
    // Sunday 2026-08-02 is week 31; Monday 2026-08-03 is week 32.
    expect(isoWeekKey(new Date(2026, 7, 2))).toBe('2026-W31');
    expect(isoWeekKey(new Date(2026, 7, 3))).toBe('2026-W32');
  });

  it('handles the year boundary (Jan 1 belongs to the prior ISO year)', () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01');
    // 2025-12-29 (Monday) is ISO week 1 of 2026.
    expect(isoWeekKey(new Date(2025, 11, 29))).toBe('2026-W01');
  });

  it('returns the same key for every day of a week', () => {
    const key = isoWeekKey(new Date(2026, 7, 4));
    for (let day = 3; day <= 9; day++) {
      expect(isoWeekKey(new Date(2026, 7, day))).toBe(key);
    }
  });
});

describe('emptyWeekly', () => {
  it('starts a fresh weekly snapshot at zero', () => {
    const w = emptyWeekly(new Date(2026, 7, 4));
    expect(w).toEqual({ weekKey: '2026-W32', callsRun: 0, cleared: 0, creditsEarned: 0, xpEarned: 0 });
  });
});
