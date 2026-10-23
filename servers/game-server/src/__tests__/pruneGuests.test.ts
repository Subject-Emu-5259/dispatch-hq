import { describe, it, expect } from 'vitest';
import {
  GUEST_MAX_AGE_MS,
  GUEST_EMAIL_RE,
  isGuestEmail,
  isPruneCandidate,
} from '../jobs/pruneGuests';

describe('isGuestEmail', () => {
  it('matches the guest_<hex>@dispatchhq.game shape the server creates', () => {
    expect(isGuestEmail('guest_ab12cd34@dispatchhq.game')).toBe(true);
    expect(isGuestEmail('guest_4b207b7295a2f878@dispatchhq.game')).toBe(true);
  });

  it('rejects real accounts, the founder, and near-miss shapes', () => {
    expect(isGuestEmail('deandrewh26@gmail.com')).toBe(false);
    expect(isGuestEmail('smoketest@dispatchhq.game')).toBe(false);
    expect(isGuestEmail('commander@dispatchhq.game')).toBe(false);
    expect(isGuestEmail('guest@dispatchhq.game')).toBe(false); // no hex suffix
    expect(isGuestEmail('guest_ab12@evil.com')).toBe(false);
    expect(isGuestEmail('')).toBe(false);
  });
});

describe('isPruneCandidate', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('prunes a save-less guest last active more than 30 days ago', () => {
    expect(isPruneCandidate({
      lastActive: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
      hasSaves: false,
      now,
    })).toBe(true);
  });

  it('keeps a save-less guest active within the last 30 days', () => {
    expect(isPruneCandidate({
      lastActive: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
      hasSaves: false,
      now,
    })).toBe(false);
  });

  it('keeps any guest with saves, no matter how old', () => {
    expect(isPruneCandidate({
      lastActive: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      hasSaves: true,
      now,
    })).toBe(false);
  });

  it('prunes exactly at the 30-day boundary (>=)', () => {
    expect(isPruneCandidate({
      lastActive: new Date(now.getTime() - GUEST_MAX_AGE_MS),
      hasSaves: false,
      now,
    })).toBe(true);
  });

  it('respects a custom max age', () => {
    expect(isPruneCandidate({
      lastActive: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      hasSaves: false,
      now,
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    })).toBe(true);
  });
});
