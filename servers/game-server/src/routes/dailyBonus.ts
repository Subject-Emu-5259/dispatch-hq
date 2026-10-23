// ============================================
// Dispatch HQ — Daily Login Bonus (v0.44.0)
// ============================================
// Commander members get 5 coins per day; free players get 2. One claim per
// day, enforced by a unique index on (playerId, claimDate). The endpoint is
// idempotent — calling it twice in the same day returns the same result.

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, dailyLoginBonuses, coinTransactions } from '../db/schema';
import { premiumActive } from '../lib/shop';
import type { AuthVars } from '../auth/middleware';

/** UTC date string 'YYYY-MM-DD' for daily reset boundary. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const COINS_PREMIUM = 5;
const COINS_FREE = 2;

export const dailyBonusRoutes = new Hono<{ Variables: AuthVars }>();

/**
 * GET /api/daily-bonus — check whether today's bonus is available.
 * Returns { claimed, coinsGranted, claimDate } so the UI can show the
 * right state without needing to POST first.
 */
dailyBonusRoutes.get('/', async (c) => {
  const playerId = c.get('playerId');
  const today = todayUtc();

  const existing = await db
    .select({ coinsGranted: dailyLoginBonuses.coinsGranted })
    .from(dailyLoginBonuses)
    .where(and(
      eq(dailyLoginBonuses.playerId, playerId),
      eq(dailyLoginBonuses.claimDate, today),
    ))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ claimed: true, coinsGranted: existing[0].coinsGranted, claimDate: today });
  }

  // Check premium status to show the correct bonus amount in the UI.
  const [me] = await db
    .select({ premiumExpiresAt: players.premiumExpiresAt })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const isPremium = premiumActive({ premiumExpiresAt: me?.premiumExpiresAt });
  return c.json({ claimed: false, coinsGranted: isPremium ? COINS_PREMIUM : COINS_FREE, claimDate: today });
});

/**
 * POST /api/daily-bonus — claim today's bonus. Idempotent: if already
 * claimed, returns the existing claim. Writes to daily_login_bonuses +
 * coin_transactions + players.coins in a single transaction.
 */
dailyBonusRoutes.post('/', async (c) => {
  const playerId = c.get('playerId');
  const today = todayUtc();

  // Check if already claimed today (idempotent).
  const existing = await db
    .select({ coinsGranted: dailyLoginBonuses.coinsGranted })
    .from(dailyLoginBonuses)
    .where(and(
      eq(dailyLoginBonuses.playerId, playerId),
      eq(dailyLoginBonuses.claimDate, today),
    ))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ success: true, coinsGranted: existing[0].coinsGranted, alreadyClaimed: true });
  }

  // Determine bonus amount from current premium status.
  const [me] = await db
    .select({ coins: players.coins, premiumExpiresAt: players.premiumExpiresAt })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!me) return c.json({ error: 'Player not found' }, 404);

  const isPremium = premiumActive({ premiumExpiresAt: me.premiumExpiresAt });
  const coinsGranted = isPremium ? COINS_PREMIUM : COINS_FREE;
  const balanceAfter = me.coins + coinsGranted;

  // Atomic: record the claim + credit the coins.
  await db.transaction(async (tx) => {
    await tx.insert(dailyLoginBonuses).values({
      playerId,
      coinsGranted,
      isPremium,
      claimDate: today,
    });
    await tx.update(players).set({ coins: balanceAfter }).where(eq(players.id, playerId));
    await tx.insert(coinTransactions).values({
      playerId,
      delta: coinsGranted,
      reason: 'daily_bonus',
      balanceAfter,
    });
  });

  return c.json({ success: true, coinsGranted, alreadyClaimed: false });
});
