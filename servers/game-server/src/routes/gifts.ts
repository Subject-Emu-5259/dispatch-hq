// ============================================
// Dispatch HQ — Alliance Credit Gifting Routes
// ============================================
// Phase 2 of the v1.0 co-op endgame: one-time credit transfers between
// alliance members. Rate-limited, daily-cap enforced, all gifts logged.

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { allianceGifts, allianceMembers, players } from '../db/schema';
import { logAllianceActivity } from './activity';
import type { AuthVars } from '../auth/middleware';

const giftsRouter = new Hono<{ Variables: AuthVars }>();

// ── Rules ───────────────────────────────────────────────────────────────────
const MIN_GIFT = 100;
const MAX_GIFT = 50_000;
const DAILY_GIFT_CAP = 25_000; // combined sending + receiving per player per day

async function getMembership(playerId: string) {
  const rows = await db
    .select({ allianceId: allianceMembers.allianceId, role: allianceMembers.role, allianceLevel: sql<number>`COALESCE((SELECT level FROM alliances WHERE id = ${allianceMembers.allianceId}), 1)` })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  return rows[0] ?? null;
}

/** Sum a player's total gift volume (sent + received) for today UTC. */
async function todayGiftVolume(playerId: string, allianceId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const sent = await db
    .select({ total: sql<number>`coalesce(sum(${allianceGifts.amount}), 0)` })
    .from(allianceGifts)
    .where(
      and(
        eq(allianceGifts.senderId, playerId),
        eq(allianceGifts.allianceId, allianceId),
        sql`${allianceGifts.createdAt} >= ${startOfDay}`,
      ),
    );

  const received = await db
    .select({ total: sql<number>`coalesce(sum(${allianceGifts.amount}), 0)` })
    .from(allianceGifts)
    .where(
      and(
        eq(allianceGifts.receiverId, playerId),
        eq(allianceGifts.allianceId, allianceId),
        sql`${allianceGifts.createdAt} >= ${startOfDay}`,
      ),
    );

  return Number(sent[0]?.total ?? 0) + Number(received[0]?.total ?? 0);
}

// ── POST /api/alliances/gifts/send — send credits to an alliance member ────
giftsRouter.post('/send', async (c) => {
  const senderId = c.get('playerId');
  const body = await c.req.json<{ receiverId?: string; amount?: number; message?: string }>();
  const amount = Math.floor(body.amount ?? 0);
  const receiverId = body.receiverId;
  const message = body.message?.slice(0, 200) || null;

  if (!receiverId) return c.json({ error: 'receiverId is required' }, 400);
  if (senderId === receiverId) return c.json({ error: 'Cannot gift credits to yourself' }, 400);
  if (amount < MIN_GIFT) return c.json({ error: `Minimum gift is ${MIN_GIFT} credits` }, 400);
  if (amount > MAX_GIFT) return c.json({ error: `Maximum gift is ${MAX_GIFT} credits` }, 400);

  const senderMembership = await getMembership(senderId);
  if (!senderMembership) return c.json({ error: 'Not in an alliance' }, 403);

  // Gifting requires alliance level 2+
  if (senderMembership.allianceLevel < 2) {
    return c.json({ error: 'Credit gifting requires alliance level 2+' }, 403);
  }

  // Receiver must be in the same alliance
  const receiverMembership = await getMembership(receiverId);
  if (!receiverMembership || receiverMembership.allianceId !== senderMembership.allianceId) {
    return c.json({ error: 'Receiver must be in the same alliance' }, 400);
  }

  // Check daily gift cap (combined sending + receiving)
  const todayVolume = await todayGiftVolume(senderId, senderMembership.allianceId);
  if (todayVolume + amount > DAILY_GIFT_CAP) {
    return c.json({ error: `Daily gift cap is ${DAILY_GIFT_CAP} credits (sent + received combined). You have ${DAILY_GIFT_CAP - todayVolume} remaining today.` }, 400);
  }

  // Check sender has enough credits
  const senderRow = await db.select({ credits: players.credits }).from(players).where(eq(players.id, senderId)).limit(1);
  const senderCredits = senderRow[0]?.credits ?? 0;
  if (senderCredits < amount) return c.json({ error: 'Insufficient credits' }, 400);

  // Get receiver's current credits
  const receiverRow = await db.select({ credits: players.credits }).from(players).where(eq(players.id, receiverId)).limit(1);
  const receiverCredits = receiverRow[0]?.credits ?? 0;

  // Atomic: deduct from sender, credit to receiver, log gift
  await db.transaction(async (tx) => {
    await tx.update(players).set({ credits: senderCredits - amount }).where(eq(players.id, senderId));
    await tx.update(players).set({ credits: receiverCredits + amount }).where(eq(players.id, receiverId));
    await tx.insert(allianceGifts).values({
      allianceId: senderMembership.allianceId,
      senderId,
      receiverId,
      amount,
      message,
    });
  });

  // Resolve receiver name for the response
  const receiverNameRow = await db.select({ name: players.username }).from(players).where(eq(players.id, receiverId)).limit(1);

  // Log activity feed event
  void logAllianceActivity(
    senderMembership.allianceId, senderId, 'gift_sent',
    `Sent ${amount.toLocaleString()} credits to ${receiverNameRow[0]?.name ?? 'Unknown'}`,
  );

  return c.json({
    success: true,
    sent: amount,
    receiverName: receiverNameRow[0]?.name ?? 'Unknown',
    senderBalance: senderCredits - amount,
  });
});

// ── GET /api/alliances/gifts — recent gifts for the alliance ───────────────
giftsRouter.get('/', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20)));

  const rows = await db
    .select()
    .from(allianceGifts)
    .where(eq(allianceGifts.allianceId, membership.allianceId))
    .orderBy(desc(allianceGifts.createdAt))
    .limit(limit);

  // Resolve player names
  const playerIds = [...new Set([...rows.map((g) => g.senderId), ...rows.map((g) => g.receiverId)])];
  const playerRows = playerIds.length > 0
    ? await db.select({ id: players.id, name: players.username }).from(players).where(sql`${players.id} in ${playerIds}`)
    : [];
  const nameMap = new Map(playerRows.map((p) => [p.id, p.name]));

  return c.json({
    gifts: rows.map((g) => ({
      id: g.id,
      senderId: g.senderId,
      senderName: nameMap.get(g.senderId) ?? 'Unknown',
      receiverId: g.receiverId,
      receiverName: nameMap.get(g.receiverId) ?? 'Unknown',
      amount: g.amount,
      message: g.message,
      createdAt: g.createdAt,
    })),
  });
});

// ── GET /api/alliances/gifts/cap — check remaining daily gift cap ───────────
giftsRouter.get('/cap', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const todayVolume = await todayGiftVolume(playerId, membership.allianceId);

  return c.json({
    dailyCap: DAILY_GIFT_CAP,
    used: todayVolume,
    remaining: Math.max(0, DAILY_GIFT_CAP - todayVolume),
  });
});

export { giftsRouter };
