// ============================================
// Dispatch HQ — Alliance Treasury Routes
// ============================================
// Shared credit pool: deposit, withdraw, balance, transaction log.
// Phase 1 of the v1.0 co-op endgame shared-resources system.

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { allianceTreasury, allianceTreasuryTransactions, allianceMembers, players } from '../db/schema';
import { logAllianceActivity } from './activity';
import type { AuthVars } from '../auth/middleware';

const treasuryRouter = new Hono<{ Variables: AuthVars }>();

// ── Daily caps ──────────────────────────────────────────────────────────────
const DAILY_DEPOSIT_CAP = 50_000;
const DAILY_WITHDRAWAL_CAP = 100_000;
const MIN_DEPOSIT = 100;
const MIN_WITHDRAWAL = 100;

/**
 * Get the player's alliance membership (allianceId + role).
 * Returns null if the player is not in an alliance.
 */
async function getMembership(playerId: string) {
  const rows = await db
    .select({ allianceId: allianceMembers.allianceId, role: allianceMembers.role })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get or create the treasury row for an alliance.
 * Uses upsert semantics: INSERT ... ON CONFLICT DO NOTHING, then SELECT.
 */
async function getOrCreateTreasury(allianceId: string) {
  await db
    .insert(allianceTreasury)
    .values({ allianceId, balance: 0 })
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(allianceTreasury)
    .where(eq(allianceTreasury.allianceId, allianceId))
    .limit(1);
  return rows[0];
}

/**
 * Sum a player's net delta for a given reason(s) since start of today UTC.
 * Used for daily deposit/withdrawal cap enforcement.
 */
async function todayNetDelta(playerId: string, allianceId: string, reasons: string[]): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${allianceTreasuryTransactions.delta}), 0)` })
    .from(allianceTreasuryTransactions)
    .where(
      and(
        eq(allianceTreasuryTransactions.playerId, playerId),
        eq(allianceTreasuryTransactions.allianceId, allianceId),
        sql`${allianceTreasuryTransactions.reason} in ${reasons}`,
        sql`${allianceTreasuryTransactions.createdAt} >= ${startOfDay}`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

// ── GET /api/alliances/treasury — balance + recent transactions ──────────────
treasuryRouter.get('/', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const treasury = await getOrCreateTreasury(membership.allianceId);
  const recent = await db
    .select()
    .from(allianceTreasuryTransactions)
    .where(eq(allianceTreasuryTransactions.allianceId, membership.allianceId))
    .orderBy(desc(allianceTreasuryTransactions.createdAt))
    .limit(20);

  // Resolve player names for the transactions
  const playerIds = [...new Set(recent.map((t) => t.playerId))];
  const playerRows = playerIds.length > 0
    ? await db.select({ id: players.id, name: players.username }).from(players).where(sql`${players.id} in ${playerIds}`)
    : [];
  const nameMap = new Map(playerRows.map((p) => [p.id, p.name]));

  return c.json({
    balance: treasury.balance,
    transactions: recent.map((t) => ({
      id: t.id,
      playerId: t.playerId,
      playerName: nameMap.get(t.playerId) ?? 'Unknown',
      delta: t.delta,
      reason: t.reason,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
    })),
  });
});

// ── GET /api/alliances/treasury/log — paginated transaction log ──────────────
treasuryRouter.get('/log', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 20)));
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(allianceTreasuryTransactions)
    .where(eq(allianceTreasuryTransactions.allianceId, membership.allianceId))
    .orderBy(desc(allianceTreasuryTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(allianceTreasuryTransactions)
    .where(eq(allianceTreasuryTransactions.allianceId, membership.allianceId));

  const playerIds = [...new Set(rows.map((t) => t.playerId))];
  const playerRows = playerIds.length > 0
    ? await db.select({ id: players.id, name: players.username }).from(players).where(sql`${players.id} in ${playerIds}`)
    : [];
  const nameMap = new Map(playerRows.map((p) => [p.id, p.name]));

  return c.json({
    transactions: rows.map((t) => ({
      id: t.id,
      playerId: t.playerId,
      playerName: nameMap.get(t.playerId) ?? 'Unknown',
      delta: t.delta,
      reason: t.reason,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
    })),
    total: Number(countRows[0]?.count ?? 0),
    page,
    limit,
  });
});

// ── POST /api/alliances/treasury/deposit — add credits to the treasury ──────
treasuryRouter.post('/deposit', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json<{ amount?: number }>();
  const amount = Math.floor(body.amount ?? 0);

  if (amount < MIN_DEPOSIT) return c.json({ error: `Minimum deposit is ${MIN_DEPOSIT} credits` }, 400);

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Check daily deposit cap
  const todayDeposits = await todayNetDelta(playerId, membership.allianceId, ['deposit']);
  if (todayDeposits + amount > DAILY_DEPOSIT_CAP) {
    return c.json({ error: `Daily deposit cap is ${DAILY_DEPOSIT_CAP} credits. You have ${DAILY_DEPOSIT_CAP - todayDeposits} remaining today.` }, 400);
  }

  // Batch 1 (P1-M2): guarded debit — `credits >= amount` in the WHERE clause,
  // affected rows as the verdict — plus a relative treasury increment, all in
  // one transaction. The old code read both balances, checked in JS, then
  // wrote absolute values: concurrent deposits could double-spend the player.
  await getOrCreateTreasury(membership.allianceId);
  const deposited = await db.transaction(async (tx) => {
    const debited = await tx.update(players)
      .set({ credits: sql`${players.credits} - ${amount}` })
      .where(and(eq(players.id, playerId), sql`${players.credits} >= ${amount}`))
      .returning({ credits: players.credits });
    if (debited.length === 0) return null;
    const credited = await tx.update(allianceTreasury)
      .set({ balance: sql`${allianceTreasury.balance} + ${amount}`, updatedAt: new Date() })
      .where(eq(allianceTreasury.allianceId, membership.allianceId))
      .returning({ balance: allianceTreasury.balance });
    if (credited.length === 0) return null;
    await tx.insert(allianceTreasuryTransactions).values({
      allianceId: membership.allianceId,
      playerId,
      delta: amount,
      reason: 'deposit',
      balanceAfter: credited[0].balance,
    });
    return { playerCredits: debited[0].credits, balance: credited[0].balance };
  });
  if (!deposited) return c.json({ error: 'Insufficient credits' }, 400);

  // Log activity feed event
  void logAllianceActivity(membership.allianceId, playerId, 'treasury_deposit', `Deposited ${amount.toLocaleString()} credits to the treasury`);

  return c.json({ balance: deposited.balance, deposited: amount });
});

// ── POST /api/alliances/treasury/withdraw — take credits from the treasury ───
treasuryRouter.post('/withdraw', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json<{ amount?: number }>();
  const amount = Math.floor(body.amount ?? 0);

  if (amount < MIN_WITHDRAWAL) return c.json({ error: `Minimum withdrawal is ${MIN_WITHDRAWAL} credits` }, 400);

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Only leader or officer can withdraw
  if (membership.role !== 'leader' && membership.role !== 'officer') {
    return c.json({ error: 'Only alliance leaders and officers can withdraw from the treasury' }, 403);
  }

  // Check daily withdrawal cap
  const todayWithdrawals = await todayNetDelta(playerId, membership.allianceId, ['withdraw']);
  if (todayWithdrawals + amount > DAILY_WITHDRAWAL_CAP) {
    return c.json({ error: `Daily withdrawal cap is ${DAILY_WITHDRAWAL_CAP} credits. You have ${DAILY_WITHDRAWAL_CAP - todayWithdrawals} remaining today.` }, 400);
  }

  // Batch 1 (P1-M2): guarded treasury debit — `balance >= amount` in the
  // WHERE clause — plus a relative player credit, all in one transaction.
  // The old code read both balances, checked in JS, then wrote absolute
  // values: concurrent withdrawals could overdraw the treasury.
  await getOrCreateTreasury(membership.allianceId);
  const withdrawn = await db.transaction(async (tx) => {
    const debited = await tx.update(allianceTreasury)
      .set({ balance: sql`${allianceTreasury.balance} - ${amount}`, updatedAt: new Date() })
      .where(and(eq(allianceTreasury.allianceId, membership.allianceId), sql`${allianceTreasury.balance} >= ${amount}`))
      .returning({ balance: allianceTreasury.balance });
    if (debited.length === 0) return null;
    const credited = await tx.update(players)
      .set({ credits: sql`${players.credits} + ${amount}` })
      .where(eq(players.id, playerId))
      .returning({ credits: players.credits });
    if (credited.length === 0) return null;
    await tx.insert(allianceTreasuryTransactions).values({
      allianceId: membership.allianceId,
      playerId,
      delta: -amount,
      reason: 'withdraw',
      balanceAfter: debited[0].balance,
    });
    return { balance: debited[0].balance, playerCredits: credited[0].credits };
  });
  if (!withdrawn) return c.json({ error: 'Insufficient treasury balance' }, 400);

  // Log activity feed event
  void logAllianceActivity(membership.allianceId, playerId, 'treasury_withdraw', `Withdrew ${amount.toLocaleString()} credits from the treasury`);

  return c.json({ balance: withdrawn.balance, withdrawn: amount });
});

export { treasuryRouter };
