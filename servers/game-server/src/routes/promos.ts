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
import { recordGrant } from '../lib/grants';

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

  // Active + not expired + under the usage cap (fast-path check; the
  // serialized guard inside the transaction below is the real gate).
  if (!promo.active) return c.json({ error: 'This code is no longer active' }, 400);
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'This code has expired' }, 400);
  }
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

  // Batch 1 (P1-M2 + P1-M3): everything inside ONE transaction, all guarded.
  // The cap bump is a single UPDATE ... WHERE usedCount < maxUses — the
  // affected-row count is the verdict, so two concurrent redeems past the
  // last slot can never both pass (the old check-then-act admitted that).
  // Player deltas are RELATIVE increments, not absolute writes from a stale
  // read, so concurrent grants compose instead of clobbering. And the grant
  // ledger row is recorded in the same transaction, so delivery (P1-M3) can
  // never lose a grant the wallet already received.
  const playerRows = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  const player = playerRows[0];
  if (!player) return c.json({ error: 'Player not found' }, 404);

  const rewards = (promo.rewards ?? {}) as PromoRewards;
  const target = { credits: player.credits ?? 0, coins: player.coins ?? 0, xp: Number(player.xp) || 0, level: player.level ?? 1 };
  const granted = applyRewards(target, rewards);

  if (Object.keys(granted).length === 0) {
    return c.json({ error: 'This code grants nothing' }, 400);
  }

  let result: { credits: number; coins: number; xp: number; level: number } | null = null;
  try {
    result = await db.transaction(async (tx) => {
      const bumped = await tx.update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(and(eq(promoCodes.id, promo.id), sql`${promoCodes.usedCount} < ${promo.maxUses}`))
        .returning({ usedCount: promoCodes.usedCount });
      if (bumped.length === 0) return null;
      const inserted = await tx.insert(promoRedemptions).values({
        promoId: promo.id,
        playerId,
        levelAtRedemption: player.level ?? 1,
      }).returning({ id: promoRedemptions.id });
      const updated = await tx.update(players)
        .set({
          credits: sql`${players.credits} + ${granted.credits ?? 0}`,
          coins: sql`${players.coins} + ${granted.coins ?? 0}`,
          xp: sql`${players.xp} + ${granted.xp ?? 0}`,
          level: sql`${players.level} + ${granted.level ?? 0}`,
          lastActive: new Date(),
        })
        .where(eq(players.id, playerId))
        .returning({ credits: players.credits, coins: players.coins, xp: players.xp, level: players.level });
      if (updated.length === 0) return null;
      await recordGrant(tx as never, playerId, 'promo', inserted[0].id, {
        credits: granted.credits ?? 0,
        coins: granted.coins ?? 0,
        xp: granted.xp ?? 0,
        level: granted.level ?? 0,
      });
      return { credits: updated[0].credits, coins: updated[0].coins, xp: Number(updated[0].xp) || 0, level: updated[0].level };
    });
  } catch (err) {
    // The unique index on (promoId, playerId) is the backstop for the check
    // above — a duplicate claim surfaces as a constraint violation.
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('promo_redemptions')) return c.json({ error: 'You have already redeemed this code' }, 409);
    console.error('Promo redemption failed:', err);
    return c.json({ error: 'Redemption failed — please try again' }, 500);
  }
  if (!result) return c.json({ error: 'This code has reached its redemption limit' }, 400);

  return c.json({
    success: true,
    code: promo.code,
    label: promo.label,
    granted,
    player: result,
  });
});

export { promo as promoRoutes };
