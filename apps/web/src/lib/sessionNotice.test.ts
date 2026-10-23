import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// jsdom's opaque-origin localStorage is unavailable under vitest 4 — stub a
// minimal in-memory store so the flag helpers are exercised, not skipped.
const storage = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    },
  });
});
import {
  SESSION_RESET_CUTOFF_ISO,
  SESSION_RESET_FLAG_KEY,
  shouldShowSessionResetNotice,
  sessionResetFlagValue,
  markSessionResetNoticeShown,
} from './sessionNotice';

const player = (createdAt: string) => ({ createdAt });

describe('shouldShowSessionResetNotice — one-time, pre-rotation accounts only', () => {
  it('shows for an account created before the rotation day', () => {
    expect(shouldShowSessionResetNotice(player('2026-08-01T10:00:00Z'), null)).toBe(true);
    expect(shouldShowSessionResetNotice(player('2026-08-12T23:59:59Z'), null)).toBe(true);
  });

  it('never shows for an account created after the rotation day', () => {
    expect(shouldShowSessionResetNotice(player('2026-08-13T00:00:00Z'), null)).toBe(false);
    expect(shouldShowSessionResetNotice(player('2026-08-14T00:00:00Z'), null)).toBe(false);
  });

  it('shows at most once per browser (flag set → no second notice)', () => {
    const pre = player('2026-08-01T10:00:00Z');
    expect(shouldShowSessionResetNotice(pre, null)).toBe(true);
    expect(shouldShowSessionResetNotice(pre, '1')).toBe(false);
  });

  it('never shows without a player, or with an unparseable createdAt', () => {
    expect(shouldShowSessionResetNotice(null, null)).toBe(false);
    expect(shouldShowSessionResetNotice(undefined, null)).toBe(false);
    expect(shouldShowSessionResetNotice(player('not-a-date'), null)).toBe(false);
  });

  it('cutoff constant parses to a real timestamp', () => {
    expect(Number.isFinite(Date.parse(SESSION_RESET_CUTOFF_ISO))).toBe(true);
  });
});

describe('session reset flag (localStorage helpers)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SESSION_RESET_FLAG_KEY);
  });

  it('reads null before it is ever marked', () => {
    expect(sessionResetFlagValue()).toBeNull();
  });

  it('marks once and reads it back', () => {
    expect(markSessionResetNoticeShown()).toBe(true);
    expect(sessionResetFlagValue()).toBe('1');
  });
});
