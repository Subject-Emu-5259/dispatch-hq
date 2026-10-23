// ============================================
// Dispatch HQ — Promo Code Redemption (player-facing)
// ============================================
// Players redeem founder-created promo codes for XP, credits, coins, and/or
// level bumps. Each player can redeem a given code exactly once; codes are
// capped at their maxUses and can be deactivated or expired by the founder.

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, promoCodes, promoRedemptions } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import { applyRewards, type PromoRewards } from './admin';

const promo = new Hono<{ Variables: AuthVars }>();

/** Normalize a submitted code: uppercase, strip spaces/hyphen-padding. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s]+/g, '');
}

promo.post('/redeem', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const code = normalizeCode(String(body?.code ?? ''));
  if (code.length === 0) return c.json({ error: 'Enter a promo code' }, 400);

  // Load the code (exact match on the normalized form).
  const codeRows = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.code, code))
    .limit(1);
  const promo = codeRows[0];
  if (!promo) return c.json({ error: 'Invalid promo code' }, 404);

  // Active + not expired + under the usage cap.
  if (!promo.active) return c.json({ error: 'This code is no longer active' }, 400);
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'This code has expired' }, 400);
  }
  // Check-then-act on the usage cap: the unique per-player index prevents
  // duplicate claims, but two *different* players redeeming concurrently could
  // both pass this check and nudge past maxUses. Acceptable for a game promo.
  if ((promo.usedCount ?? 0) >= (promo.maxUses ?? 1)) {
    return c.json({ error: 'This code has reached its redemption limit' }, 400);
  }

  // One claim per player per code (guarded by a partial-unique-safe upsert).
  const prior = await db
    .select({ id: promoRedemptions.id })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoId, promo.id), eq(promoRedemptions.playerId, playerId)))
    .limit(1);
  if (prior.length > 0) return c.json({ error: 'You have already redeemed this code' }, 409);

  // Apply the rewards atomically: bump the player and count the redemption
  // together so a crash can't grant rewards without recording the claim.
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  const player = playerRows[0];
  if (!player) return c.json({ error: 'Player not found' }, 404);

  const rewards = (promo.rewards ?? {}) as PromoRewards;
  const target = { credits: player.credits ?? 0, coins: player.coins ?? 0, xp: Number(player.xp) || 0, level: player.level ?? 1 };
  const granted = applyRewards(target, rewards);

  if (Object.keys(granted).length === 0) {
    return c.json({ error: 'This code grants nothing' }, 400);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(players)
        .set({ credits: target.credits, coins: target.coins, xp: target.xp, level: target.level, lastActive: new Date() })
        .where(eq(players.id, playerId));
      await tx.update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(eq(promoCodes.id, promo.id));
      // Record the claim with the player's level at redemption time so the
      // founder can audit who claimed what, when, and at what level.
      await tx.insert(promoRedemptions).values({
        promoId: promo.id,
        playerId,
        levelAtRedemption: player.level ?? 1,
      });
    });
  } catch (err) {
    // The unique index on (promoId, playerId) is the backstop for the check
    // above — a duplicate claim surfaces as a constraint violation.
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('promo_redemptions')) return c.json({ error: 'You have already redeemed this code' }, 409);
    console.error('Promo redemption failed:', err);
    return c.json({ error: 'Redemption failed — please try again' }, 500);
  }

  return c.json({
    success: true,
    code: promo.code,
    label: promo.label,
    granted,
    player: { credits: target.credits, coins: target.coins, xp: target.xp, level: target.level },
  });
});

export { promo as promoRoutes };
