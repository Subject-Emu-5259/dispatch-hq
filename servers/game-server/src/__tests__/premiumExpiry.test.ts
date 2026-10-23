import { describe, it, expect } from 'vitest';
import {
  PREMIUM_SWEEP_INTERVAL_MS,
  premiumFlagStale,
} from '../jobs/premiumExpiry';

describe('premiumFlagStale', () => {
  const now = new Date('2026-08-16T00:00:00Z').getTime();

  it('is clean when an active member has a future expiry and the flag on', () => {
    expect(premiumFlagStale({
      isPremium: true,
      premiumExpiresAt: new Date(now + 1000 * 60),
    }, now)).toBe(false);
  });

  it('is clean when a never-member has a null expiry and the flag off', () => {
    expect(premiumFlagStale({ isPremium: false, premiumExpiresAt: null }, now)).toBe(false);
  });

  it('is stale when the flag is on but the window has lapsed (the expiry bug)', () => {
    expect(premiumFlagStale({
      isPremium: true,
      premiumExpiresAt: new Date(now - 1),
    }, now)).toBe(true);
  });

  it('is stale when the flag is on but the window was never set', () => {
    expect(premiumFlagStale({ isPremium: true, premiumExpiresAt: null }, now)).toBe(true);
  });

  it('is stale when the flag is off but the window is still open (renewal hygiene)', () => {
    expect(premiumFlagStale({
      isPremium: false,
      premiumExpiresAt: new Date(now + 1000 * 60),
    }, now)).toBe(true);
  });

  it('parses ISO-string expiries the same as Date objects', () => {
    expect(premiumFlagStale({
      isPremium: true,
      premiumExpiresAt: new Date(now + 60_000).toISOString(),
    }, now)).toBe(false);
    expect(premiumFlagStale({
      isPremium: true,
      premiumExpiresAt: new Date(now - 1).toISOString(),
    }, now)).toBe(true);
  });
});

describe('PREMIUM_SWEEP_INTERVAL_MS', () => {
  it('is one day', () => {
    expect(PREMIUM_SWEEP_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
