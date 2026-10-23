// ============================================
// Dispatch HQ — Shop Core Tests (v0.31.0)
// ============================================
// Pure-function coverage for the monetization core: the premium-active gate,
// the Stripe webhook signature check, and the coin-sink pricing (re-exported
// from the shared economy module so the client and server agree).

import { describe, it, expect } from 'vitest';
import {
  premiumActive,
  skipTrainingCost,
  creditsForCoins,
  MEMBERSHIP_PERIOD_MS,
  MEMBERSHIP_TIER_SEED,
  COIN_PACK_SEED,
  summarizeOrderGroups,
} from '../lib/shop';
import { verifyStripeSignature } from '../routes/shop';
import { createHmac } from 'node:crypto';

describe('premiumActive', () => {
  it('is false with no expiry', () => {
    expect(premiumActive({})).toBe(false);
    expect(premiumActive({ premiumExpiresAt: null })).toBe(false);
  });

  it('is true while the window is in the future', () => {
    expect(premiumActive({ premiumExpiresAt: new Date(Date.now() + 1000 * 60) })).toBe(true);
  });

  it('is false once the window lapses', () => {
    expect(premiumActive({ premiumExpiresAt: new Date(Date.now() - 1) })).toBe(false);
  });

  it('parses ISO string expiries', () => {
    expect(premiumActive({ premiumExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
  });

  it('defines a 30-day membership period', () => {
    expect(MEMBERSHIP_PERIOD_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ type: 'checkout.session.completed' });

  function sign(ts: number, body: string, key: string): string {
    const sig = createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');
    return `t=${ts},v1=${sig}`;
  }

  it('accepts a valid signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = sign(ts, payload, secret);
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });

  it('rejects a signature over a tampered payload', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = sign(ts, payload, secret);
    expect(verifyStripeSignature(payload + 'x', header, secret)).toBe(false);
  });

  it('rejects when the secret is missing', () => {
    const ts = Math.floor(Date.now() / 1000);
    const header = sign(ts, payload, secret);
    expect(verifyStripeSignature(payload, header, '')).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyStripeSignature(payload, 'garbage', secret)).toBe(false);
  });
});

describe('summarizeOrderGroups', () => {
  it('sums fulfilled + paid into revenue and keeps pending separate', () => {
    const summary = summarizeOrderGroups([
      { status: 'fulfilled', count: 2, totalCents: 1500 },
      { status: 'paid', count: 1, totalCents: 999 },
      { status: 'pending', count: 3, totalCents: 2497 },
      { status: 'refunded', count: 1, totalCents: 499 },
    ]);
    expect(summary.revenueCents).toBe(2499); // 1500 + 999
    expect(summary.pendingCents).toBe(2497);
    expect(summary.totalOrders).toBe(7);
    expect(summary.pendingCount).toBe(3);
    expect(summary.fulfilledCount).toBe(2);
  });

  it('returns all zeros for an empty ledger', () => {
    expect(summarizeOrderGroups([])).toEqual({
      revenueCents: 0,
      pendingCents: 0,
      totalOrders: 0,
      pendingCount: 0,
      fulfilledCount: 0,
    });
  });

  it('normalizes string COUNT/SUM values from the Postgres driver', () => {
    const summary = summarizeOrderGroups([
      { status: 'fulfilled', count: '2', totalCents: '1998' },
      { status: 'pending', count: '1', totalCents: '99' },
    ]);
    expect(summary.revenueCents).toBe(1998);
    expect(summary.pendingCents).toBe(99);
    expect(summary.totalOrders).toBe(3);
    expect(summary.fulfilledCount).toBe(2);
  });

  it('excludes refunded and failed orders from revenue but counts them', () => {
    const summary = summarizeOrderGroups([
      { status: 'fulfilled', count: 1, totalCents: 999 },
      { status: 'refunded', count: 1, totalCents: 999 },
      { status: 'failed', count: 1, totalCents: 1999 },
    ]);
    expect(summary.revenueCents).toBe(999);
    expect(summary.pendingCents).toBe(0);
    expect(summary.totalOrders).toBe(3);
  });
});

describe('catalog seeds', () => {
  it('membership tier seed has unique keys and sane values', () => {
    const keys = MEMBERSHIP_TIER_SEED.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of MEMBERSHIP_TIER_SEED) {
      expect(t.active).toBe(true);
      expect(t.priceCents).toBeGreaterThan(0);
      expect(t.creditMultiplier).toBeGreaterThanOrEqual(1);
      expect(t.trainingSpeedMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it('coin pack seed has unique keys, positive counts, ascending sort', () => {
    const keys = COIN_PACK_SEED.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const sorted = [...COIN_PACK_SEED].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sorted.map((p) => p.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    for (const p of COIN_PACK_SEED) {
      expect(p.active).toBe(true);
      expect(p.coinCount).toBeGreaterThan(0);
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });
});

describe('coin-sink pricing', () => {
  it('skip-training cost is 1 coin per 10s, min 1', () => {
    expect(skipTrainingCost(0)).toBe(1);
    expect(skipTrainingCost(20)).toBe(2);
    expect(skipTrainingCost(21)).toBe(3);
  });

  it('credits conversion is 100 coins → 3500 credits', () => {
    expect(creditsForCoins(100)).toBe(3500);
    expect(creditsForCoins(50)).toBe(1750);
  });
});
