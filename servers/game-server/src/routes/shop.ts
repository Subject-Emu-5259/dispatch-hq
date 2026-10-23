// ============================================
// Dispatch HQ — Shop Routes (v0.31.0)
// ============================================
// Catalog, checkout, coin-spend, and (under /api/admin/shop) order management.
// The webhook is exported separately so it mounts OUTSIDE the auth blanket.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../db';
import { players, orders, membershipTiers, coinPacks, coinTransactions } from '../db/schema';
import { config } from '../config';
import type { AuthVars } from '../auth/middleware';
import {
  fulfillOrder,
  premiumActive,
  skipTrainingCost,
  creditsForCoins,
  ensureShopCatalog,
  summarizeOrderGroups,
} from '../lib/shop';

// ── Stripe signature verification (pure) ────────────────────────────────────

/**
 * Verify a Stripe webhook signature header ("t=…,v1=…") against the raw body.
 * Returns false (never throws) when the secret is unset or the header malformed,
 * so an unconfigured instance can never accept a forged webhook.
 */
export function verifyStripeSignature(payload: string, sigHeader: string, secret: string): boolean {
  if (!secret || !sigHeader) return false;
  const parts = sigHeader.split(',').map((p) => p.trim());
  const ts = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1 = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!ts || !v1) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${payload}`).digest();
  const provided = Buffer.from(v1, 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ── Stripe checkout (best-effort; manual is the default provider) ───────────

async function createStripeCheckoutSession(orderId: string, kind: string, priceCents: number, playerId: string): Promise<string | null> {
  try {
    const isSub = kind === 'membership';
    const params = new URLSearchParams({
      mode: isSub ? 'subscription' : 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(priceCents),
      'line_items[0][price_data][product_data][name]': isSub ? 'Dispatch HQ — Commander Membership' : 'Dispatch HQ — Coins',
      'success_url': `${config.payments.baseUrl}/?shop=success`,
      'cancel_url': `${config.payments.baseUrl}/?shop=cancel`,
      client_reference_id: playerId,
      'metadata[order_id]': orderId,
    });
    if (isSub) params.set('line_items[0][price_data][recurring][interval]', 'month');
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.payments.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) return null;
    const session = (await res.json()) as { url?: string };
    return session.url ?? null;
  } catch {
    return null;
  }
}

// ── Auth-protected player routes ────────────────────────────────────────────

export const shopRoutes = new Hono<{ Variables: AuthVars }>();

/** Storefront: packs, membership tier, and the caller's own balance/status. */
shopRoutes.get('/catalog', async (c) => {
  await ensureShopCatalog();
  const playerId = c.get('playerId');
  const [packs, tiers, me] = await Promise.all([
    db.select().from(coinPacks).where(eq(coinPacks.active, true)),
    db.select().from(membershipTiers).where(eq(membershipTiers.active, true)),
    db.select({ coins: players.coins, isPremium: players.isPremium, premiumExpiresAt: players.premiumExpiresAt }).from(players).where(eq(players.id, playerId)).limit(1),
  ]);
  const tier = tiers[0] ?? null;
  return c.json({
    packs: packs.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      priceCents: p.priceCents,
      coinCount: p.coinCount,
    })),
    tier: tier ? {
      id: tier.id,
      key: tier.key,
      name: tier.name,
      priceCents: tier.priceCents,
      creditMultiplier: tier.creditMultiplier,
      trainingSpeedMultiplier: tier.trainingSpeedMultiplier,
      perks: tier.perks,
    } : null,
    me: {
      coins: me[0]?.coins ?? 0,
      isPremium: premiumActive({ premiumExpiresAt: me[0]?.premiumExpiresAt }),
      premiumExpiresAt: me[0]?.premiumExpiresAt ? me[0].premiumExpiresAt!.toISOString() : null,
    },
    provider: config.payments.provider,
  });
});

/** Create a pending order and (when Stripe is configured) return a checkout URL. */
shopRoutes.post('/checkout', async (c) => {
  await ensureShopCatalog();
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null) as { kind?: unknown; itemId?: unknown } | null;
  const kind = body?.kind;
  const itemId = body?.itemId;
  if (kind !== 'membership' && kind !== 'coin_pack') return c.json({ error: 'Invalid kind' }, 400);
  if (typeof itemId !== 'string' || !itemId) return c.json({ error: 'Missing itemId' }, 400);

  let priceCents = 0;
  if (kind === 'membership') {
    const tier = await db.select().from(membershipTiers).where(eq(membershipTiers.id, itemId)).limit(1);
    if (tier.length === 0 || !tier[0].active) return c.json({ error: 'Membership tier not found' }, 404);
    priceCents = tier[0].priceCents;
  } else {
    const pack = await db.select().from(coinPacks).where(eq(coinPacks.id, itemId)).limit(1);
    if (pack.length === 0 || !pack[0].active) return c.json({ error: 'Coin pack not found' }, 404);
    priceCents = pack[0].priceCents;
  }

  const [order] = await db.insert(orders).values({
    playerId,
    kind,
    itemId,
    priceCents,
    status: 'pending',
    provider: config.payments.provider,
  }).returning();

  if (config.payments.provider === 'stripe' && config.payments.stripeSecretKey) {
    const url = await createStripeCheckoutSession(order.id, kind, priceCents, playerId);
    if (url) {
      await db.update(orders).set({ providerRef: url }).where(eq(orders.id, order.id));
      return c.json({ orderId: order.id, url });
    }
    // Stripe failure → fall through to manual so checkout is never a dead end.
  }
  return c.json({
    orderId: order.id,
    manual: true,
    message: 'Payments are manual right now — reach out to the founder with this order id to complete your purchase.',
  });
});

/** Spend coins: skip a training session or buy credits. Server-authoritative debit. */
shopRoutes.post('/spend', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null) as { kind?: unknown; coins?: unknown; remainingSec?: unknown } | null;
  const kind = body?.kind;

  const me = await db.select({ coins: players.coins }).from(players).where(eq(players.id, playerId)).limit(1);
  const coins = me[0]?.coins ?? 0;

  if (kind === 'buy_credits') {
    const spendCoins = Math.floor(Number(body?.coins) || 0);
    if (spendCoins <= 0) return c.json({ error: 'Invalid coin amount' }, 400);
    if (coins < spendCoins) return c.json({ error: 'Not enough coins' }, 402);
    const credits = creditsForCoins(spendCoins);
    const balanceAfter = coins - spendCoins;
    await db.transaction(async (tx) => {
      await tx.update(players)
        .set({ coins: balanceAfter, credits: sql`${players.credits} + ${credits}` })
        .where(eq(players.id, playerId));
      await tx.insert(coinTransactions).values({ playerId, delta: -spendCoins, reason: 'spend', balanceAfter });
    });
    return c.json({ success: true, coins: balanceAfter, creditsGranted: credits });
  }

  if (kind === 'skip_training') {
    const remainingSec = Math.max(0, Math.floor(Number(body?.remainingSec) || 0));
    const cost = skipTrainingCost(remainingSec);
    if (coins < cost) return c.json({ error: 'Not enough coins' }, 402);
    const balanceAfter = coins - cost;
    await db.transaction(async (tx) => {
      await tx.update(players).set({ coins: balanceAfter }).where(eq(players.id, playerId));
      await tx.insert(coinTransactions).values({ playerId, delta: -cost, reason: 'spend', balanceAfter });
    });
    return c.json({ success: true, coins: balanceAfter, cost });
  }

  return c.json({ error: 'Invalid spend kind' }, 400);
});

// ── Public Stripe webhook (mounted OUTSIDE the auth blanket) ────────────────

export async function shopWebhookHandler(c: Context): Promise<Response> {
  const payload = await c.req.text();
  const signature = c.req.header('Stripe-Signature') ?? '';
  if (!verifyStripeSignature(payload, signature, config.payments.stripeWebhookSecret)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  let event: { type?: string; data?: { object?: { id?: string; metadata?: { order_id?: string } } } };
  try {
    event = JSON.parse(payload);
  } catch {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  // Fulfillment keys off the order id we stamped into checkout metadata, and
  // fulfillOrder is idempotent, so a duplicate webhook is a safe no-op.
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const orderId = event.data?.object?.metadata?.order_id;
    if (!orderId) return c.json({ received: true });
    const result = await fulfillOrder(orderId);
    if (!result.ok && result.status !== 'already_fulfilled') {
      console.error('[shop] webhook fulfillment failed:', result.status, result.message);
    }
    return c.json({ received: true, status: result.status });
  }

  if (event.type === 'customer.subscription.deleted') {
    // Subscription ended → find the player by providerRef and expire premium.
    // (providerRef holds the session URL at creation; the subscription id is
    // reconciled on invoice events in a real deployment — see plan Risks.)
    return c.json({ received: true });
  }

  return c.json({ received: true });
}

// ── Admin routes (mounted under /api/admin/shop, inherits the admin gate) ───

export const shopAdminRoutes = new Hono<{ Variables: AuthVars }>();

/**
 * Founder: list recent orders (newest first) with the buyer's username and the
 * item's display name (tier or pack), plus an all-time revenue summary so the
 * console's Orders + Revenue tab shows realized/pending dollars at a glance.
 */
shopAdminRoutes.get('/orders', async (c) => {
  const rows = await db
    .select({
      id: orders.id,
      playerId: orders.playerId,
      username: players.username,
      kind: orders.kind,
      itemId: orders.itemId,
      priceCents: orders.priceCents,
      status: orders.status,
      provider: orders.provider,
      providerRef: orders.providerRef,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      fulfilledAt: orders.fulfilledAt,
      tierName: membershipTiers.name,
      packName: coinPacks.name,
    })
    .from(orders)
    .leftJoin(players, eq(players.id, orders.playerId))
    .leftJoin(membershipTiers, eq(membershipTiers.id, orders.itemId))
    .leftJoin(coinPacks, eq(coinPacks.id, orders.itemId))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  // Revenue summary across ALL orders (not just the recent 100 shown above).
  const grouped = await db
    .select({
      status: orders.status,
      count: sql<number>`COUNT(*)`,
      totalCents: sql<number>`COALESCE(SUM(${orders.priceCents}), 0)`,
    })
    .from(orders)
    .groupBy(orders.status);

  // Pure, unit-tested aggregation (lib/shop.ts) — realized vs pending revenue.
  const summary = summarizeOrderGroups(grouped);

  return c.json({
    orders: rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      username: r.username ?? null,
      kind: r.kind,
      itemId: r.itemId,
      itemName: r.tierName ?? r.packName ?? null,
      priceCents: r.priceCents,
      status: r.status,
      provider: r.provider,
      providerRef: r.providerRef,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      fulfilledAt: r.fulfilledAt,
    })),
    summary,
  });
});

/** Founder: fulfill a manual (or stuck) order by id. */
shopAdminRoutes.post('/fulfill', async (c) => {
  const body = await c.req.json().catch(() => null) as { orderId?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  if (!orderId) return c.json({ error: 'Missing orderId' }, 400);
  const result = await fulfillOrder(orderId);
  return c.json(result, result.ok ? 200 : 400);
});

/**
 * Founder: coin-transaction ledger (newest first) with the player's username,
 * plus an all-time summary (credited vs debited and a per-reason breakdown) so
 * every coin movement — pack purchases, training skips, credits buys, promo and
 * admin grants — is auditable end-to-end.
 */
shopAdminRoutes.get('/transactions', async (c) => {
  const rows = await db
    .select({
      id: coinTransactions.id,
      playerId: coinTransactions.playerId,
      username: players.username,
      delta: coinTransactions.delta,
      reason: coinTransactions.reason,
      refId: coinTransactions.refId,
      balanceAfter: coinTransactions.balanceAfter,
      createdAt: coinTransactions.createdAt,
    })
    .from(coinTransactions)
    .leftJoin(players, eq(players.id, coinTransactions.playerId))
    .orderBy(desc(coinTransactions.createdAt))
    .limit(200);

  // Summary across ALL transactions (not just the recent 200 shown above).
  const grouped = await db
    .select({
      reason: coinTransactions.reason,
      count: sql<number>`COUNT(*)`,
      netDelta: sql<number>`COALESCE(SUM(${coinTransactions.delta}), 0)`,
    })
    .from(coinTransactions)
    .groupBy(coinTransactions.reason);

  const byReason: Record<string, { count: number; netDelta: number }> = {};
  let credited = 0;
  let debited = 0;
  for (const g of grouped) {
    const net = Number(g.netDelta ?? 0);
    byReason[g.reason] = { count: Number(g.count ?? 0), netDelta: net };
    if (net > 0) credited += net;
    else debited += -net;
  }

  return c.json({
    transactions: rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      username: r.username ?? null,
      delta: r.delta,
      reason: r.reason,
      refId: r.refId,
      balanceAfter: r.balanceAfter,
      createdAt: r.createdAt,
    })),
    summary: {
      totalTransactions: grouped.reduce((s, g) => s + Number(g.count ?? 0), 0),
      credited,
      debited,
      netDelta: credited - debited,
      byReason,
    },
  });
});
