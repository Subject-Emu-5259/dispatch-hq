// ============================================
// Dispatch HQ — Shop Core (v0.31.0)
// ============================================
// Pure catalog + premium helpers and the idempotent order-fulfillment core.
// The HTTP layer (routes/shop.ts) stays thin; the money-moving logic lives here
// so the double-grant guard is unit-testable in isolation.

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { players, orders, membershipTiers, coinPacks, coinTransactions } from '../db/schema';
import { skipTrainingCost, creditsForCoins } from '@dispatch-hq/shared';

export { skipTrainingCost, creditsForCoins };

// ── Catalog seeds (idempotently upserted in db/seed.ts) ─────────────────────

export const MEMBERSHIP_TIER_SEED = [
  {
    key: 'commander',
    name: 'Commander',
    priceCents: 999, // $9.99/mo
    creditMultiplier: 2,
    trainingSpeedMultiplier: 2,
    perks: ['badge', 'inbox', 'alliance_auto_respond'],
    active: true,
  },
];

export const COIN_PACK_SEED = [
  { key: 'starter', name: 'Starter Pack', priceCents: 99, coinCount: 100, sortOrder: 1, active: true },
  { key: 'bucket', name: 'Bucket Pack', priceCents: 499, coinCount: 600, sortOrder: 2, active: true },
  { key: 'chest', name: 'Chest Pack', priceCents: 999, coinCount: 1500, sortOrder: 3, active: true },
  { key: 'vault', name: 'Vault Pack', priceCents: 1999, coinCount: 3500, sortOrder: 4, active: true },
  { key: 'bank', name: 'Bank Pack', priceCents: 4999, coinCount: 10000, sortOrder: 5, active: true },
];

/**
 * Ensure the shop catalog exists — idempotent by key, mirroring
 * ensureAchievements. Called on first catalog fetch so a fresh DB (where
 * /api/seed has never run) never presents an empty store. Only rows whose key
 * is absent are inserted, so existing tiers/packs — and the row ids that
 * orders reference — are never touched.
 */
export async function ensureShopCatalog(): Promise<void> {
  const [existingTiers, existingPacks] = await Promise.all([
    db.select({ key: membershipTiers.key }).from(membershipTiers),
    db.select({ key: coinPacks.key }).from(coinPacks),
  ]);
  const tierKeys = new Set(existingTiers.map((t) => t.key));
  const packKeys = new Set(existingPacks.map((p) => p.key));
  const missingTiers = MEMBERSHIP_TIER_SEED.filter((t) => !tierKeys.has(t.key));
  const missingPacks = COIN_PACK_SEED.filter((p) => !packKeys.has(p.key));
  if (missingTiers.length > 0) await db.insert(membershipTiers).values(missingTiers);
  if (missingPacks.length > 0) await db.insert(coinPacks).values(missingPacks);
}

/** One membership billing period (30 days). */
export const MEMBERSHIP_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// ── Premium helpers ──────────────────────────────────────────────────────────

/**
 * Membership is active iff the premium window is set and in the future.
 * premiumExpiresAt is authoritative — isPremium is the fast client-facing flag
 * kept in sync by the daily sweep, so read-time correctness never depends on
 * that sweep having run.
 */
export function premiumActive(p: { premiumExpiresAt?: Date | string | null }, now: number = Date.now()): boolean {
  const t = p.premiumExpiresAt;
  if (!t) return false;
  const ms = t instanceof Date ? t.getTime() : Date.parse(t);
  return Number.isFinite(ms) && ms > now;
}

// ── Revenue summary helpers ──────────────────────────────────────────────────

/**
 * One status bucket from the orders revenue aggregation. COUNT/SUM columns can
 * arrive as strings from the Postgres driver (drizzle's `sql<number>` types the
 * value without converting it), so the helper normalizes with Number().
 */
export interface OrderStatusGroup {
  status: string;
  count?: number | string | null;
  totalCents?: number | string | null;
}

export interface OrderSummary {
  /** Realized revenue (fulfilled + paid), in cents. */
  revenueCents: number;
  /** Expected revenue from still-pending manual orders, in cents. */
  pendingCents: number;
  /** All-time order count. */
  totalOrders: number;
  pendingCount: number;
  fulfilledCount: number;
}

/**
 * Fold per-status order groups into the admin Orders & Revenue summary. Pure
 * and unit-tested so the money math (realized = fulfilled + paid; pending is
 * counted separately and never leaks into revenue) can never regress silently.
 */
export function summarizeOrderGroups(groups: OrderStatusGroup[]): OrderSummary {
  const byStatus: Record<string, { count: number; totalCents: number }> = {};
  let totalOrders = 0;
  for (const g of groups) {
    const count = Number(g.count ?? 0) || 0;
    const totalCents = Number(g.totalCents ?? 0) || 0;
    byStatus[g.status] = { count, totalCents };
    totalOrders += count;
  }
  // A `paid` order not yet swept by the webhook is still money in; `refunded`
  // and `failed` deliberately contribute nothing.
  const revenueCents = (byStatus.fulfilled?.totalCents ?? 0) + (byStatus.paid?.totalCents ?? 0);
  const pendingCents = byStatus.pending?.totalCents ?? 0;
  return {
    revenueCents,
    pendingCents,
    totalOrders,
    pendingCount: byStatus.pending?.count ?? 0,
    fulfilledCount: byStatus.fulfilled?.count ?? 0,
  };
}

// ── Order fulfillment (idempotent — the double-grant guard) ─────────────────

export type FulfillStatus = 'fulfilled' | 'already_fulfilled' | 'not_found' | 'invalid' | 'error';

export interface FulfillResult {
  ok: boolean;
  status: FulfillStatus;
  message?: string;
  coinsGranted?: number;
  membershipDays?: number;
}

/**
 * Grant an order's entitlement exactly once. Only `pending`/`paid` orders are
 * fulfilled; a repeat call on a `fulfilled` order is a no-op, so a duplicate
 * webhook (or a founder double-click) can never double-grant. Coin packs credit
 * players.coins and write a coin_transactions row; memberships extend the
 * premium window from max(now, current expiry) so renewing early never shortens
 * an active membership.
 */
export async function fulfillOrder(orderId: string): Promise<FulfillResult> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (rows.length === 0) return { ok: false, status: 'not_found' };
  const order = rows[0];
  if (order.status === 'fulfilled') return { ok: true, status: 'already_fulfilled' };
  if (order.status !== 'pending' && order.status !== 'paid') {
    return { ok: false, status: 'invalid', message: `Order is ${order.status}` };
  }

  let coinsGranted: number | undefined;
  try {
    await db.transaction(async (tx) => {
      if (order.kind === 'coin_pack') {
        const pack = await tx.select().from(coinPacks).where(eq(coinPacks.id, order.itemId)).limit(1);
        if (pack.length === 0) throw new Error('coin pack not found');
        const count = pack[0].coinCount;
        const playerRows = await tx
          .select({ coins: players.coins })
          .from(players)
          .where(eq(players.id, order.playerId))
          .limit(1);
        const balanceAfter = (playerRows[0]?.coins ?? 0) + count;
        await tx.update(players).set({ coins: balanceAfter }).where(eq(players.id, order.playerId));
        await tx.insert(coinTransactions).values({
          playerId: order.playerId,
          delta: count,
          reason: 'purchase',
          refId: order.id,
          balanceAfter,
        });
        coinsGranted = count;
      } else if (order.kind === 'membership') {
        const tier = await tx.select().from(membershipTiers).where(eq(membershipTiers.id, order.itemId)).limit(1);
        if (tier.length === 0) throw new Error('membership tier not found');
        const playerRows = await tx
          .select({ premiumExpiresAt: players.premiumExpiresAt })
          .from(players)
          .where(eq(players.id, order.playerId))
          .limit(1);
        const cur = playerRows[0]?.premiumExpiresAt;
        const base = cur && cur.getTime() > Date.now() ? cur.getTime() : Date.now();
        await tx
          .update(players)
          .set({ isPremium: true, premiumExpiresAt: new Date(base + MEMBERSHIP_PERIOD_MS) })
          .where(eq(players.id, order.playerId));
      } else {
        throw new Error(`unknown order kind: ${order.kind}`);
      }
      await tx
        .update(orders)
        .set({ status: 'fulfilled', paidAt: order.paidAt ?? new Date(), fulfilledAt: new Date() })
        .where(eq(orders.id, order.id));
    });
    return { ok: true, status: 'fulfilled', coinsGranted };
  } catch (err) {
    return { ok: false, status: 'error', message: err instanceof Error ? err.message : 'unknown error' };
  }
}
