// ============================================
// Dispatch HQ — Alliance Unit Lending Routes
// ============================================
// Phase 4 of the v1.0 co-op endgame: temporary unit loans between alliance
// members. The lender's unit is locked during the loan; the borrower gets
// a stats copy. Loans auto-expire after 2 hours. Rate-limited.

import { Hono } from 'hono';
import { eq, and, desc, sql, or } from 'drizzle-orm';
import { db } from '../db';
import { allianceUnitLoans, allianceMembers, players } from '../db/schema';
import { logAllianceActivity } from './activity';
import type { AuthVars } from '../auth/middleware';

const loansRouter = new Hono<{ Variables: AuthVars }>();

// ── Rules ───────────────────────────────────────────────────────────────────
const MAX_ACTIVE_LOANS_PER_PLAYER = 2;
const DEFAULT_LOAN_DURATION_MINUTES = 120; // 2 hours
const MIN_LOAN_LEVEL = 4; // alliance level required

async function getMembership(playerId: string) {
  const rows = await db
    .select({
      allianceId: allianceMembers.allianceId,
      role: allianceMembers.role,
      allianceLevel: sql<number>`COALESCE((SELECT level FROM alliances WHERE id = ${allianceMembers.allianceId}), 1)`,
    })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  return rows[0] ?? null;
}

/** Count active loans for a player (as lender OR borrower). */
async function activeLoanCount(playerId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(allianceUnitLoans)
    .where(
      and(
        eq(allianceUnitLoans.status, 'active'),
        or(
          eq(allianceUnitLoans.lenderId, playerId),
          eq(allianceUnitLoans.borrowerId, playerId),
        ),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

// ── POST /api/alliances/loans/create — lend a unit to an alliance member ────
loansRouter.post('/create', async (c) => {
  const lenderId = c.get('playerId');
  const body = await c.req.json<{
    borrowerId?: string;
    unitType?: string;
    unitName?: string;
    durationMinutes?: number;
  }>();

  const borrowerId = body.borrowerId;
  const unitType = body.unitType?.trim();
  const unitName = body.unitName?.trim() || null;
  const durationMinutes = Math.min(
    240, // max 4 hours
    Math.max(30, body.durationMinutes ?? DEFAULT_LOAN_DURATION_MINUTES),
  );

  if (!borrowerId) return c.json({ error: 'borrowerId is required' }, 400);
  if (!unitType) return c.json({ error: 'unitType is required' }, 400);
  if (lenderId === borrowerId) return c.json({ error: 'Cannot loan a unit to yourself' }, 400);

  const lenderMembership = await getMembership(lenderId);
  if (!lenderMembership) return c.json({ error: 'Not in an alliance' }, 403);

  if (lenderMembership.allianceLevel < MIN_LOAN_LEVEL) {
    return c.json({ error: `Unit lending requires alliance level ${MIN_LOAN_LEVEL}+` }, 403);
  }

  // Borrower must be in the same alliance
  const borrowerMembership = await getMembership(borrowerId);
  if (!borrowerMembership || borrowerMembership.allianceId !== lenderMembership.allianceId) {
    return c.json({ error: 'Borrower must be in the same alliance' }, 400);
  }

  // Check lender's active loan limit
  const lenderLoans = await activeLoanCount(lenderId);
  if (lenderLoans >= MAX_ACTIVE_LOANS_PER_PLAYER) {
    return c.json({ error: `Maximum ${MAX_ACTIVE_LOANS_PER_PLAYER} active loans per player` }, 400);
  }

  // Check borrower's active loan limit
  const borrowerLoans = await activeLoanCount(borrowerId);
  if (borrowerLoans >= MAX_ACTIVE_LOANS_PER_PLAYER) {
    return c.json({ error: 'Borrower has reached their loan limit' }, 400);
  }

  // Check for duplicate active loan (same lender → borrower, same unit type)
  const existingLoan = await db
    .select({ id: allianceUnitLoans.id })
    .from(allianceUnitLoans)
    .where(
      and(
        eq(allianceUnitLoans.status, 'active'),
        eq(allianceUnitLoans.lenderId, lenderId),
        eq(allianceUnitLoans.borrowerId, borrowerId),
        eq(allianceUnitLoans.unitType, unitType),
      ),
    )
    .limit(1);

  if (existingLoan.length > 0) {
    return c.json({ error: 'You already have an active loan of this unit type to this player' }, 400);
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

  const [loan] = await db
    .insert(allianceUnitLoans)
    .values({
      allianceId: lenderMembership.allianceId,
      lenderId,
      borrowerId,
      unitType,
      unitName,
      durationMinutes,
      expiresAt,
    })
    .returning();

  // Resolve names
  const lenderName = await db.select({ name: players.username }).from(players).where(eq(players.id, lenderId)).limit(1);
  const borrowerName = await db.select({ name: players.username }).from(players).where(eq(players.id, borrowerId)).limit(1);

  // Log activity feed event
  void logAllianceActivity(lenderMembership.allianceId, lenderId, 'loan_created',
    `Loaned ${unitType}${unitName ? ` "${unitName}"` : ''} to ${borrowerName[0]?.name ?? 'Unknown'} for ${durationMinutes}min`);

  return c.json({
    success: true,
    loan: {
      id: loan.id,
      unitType: loan.unitType,
      unitName: loan.unitName,
      lenderName: lenderName[0]?.name ?? 'Unknown',
      borrowerName: borrowerName[0]?.name ?? 'Unknown',
      durationMinutes: loan.durationMinutes,
      expiresAt: loan.expiresAt,
      status: loan.status,
      createdAt: loan.createdAt,
    },
  });
});

// ── POST /api/alliances/loans/:id/return — borrower returns a loan early ────
loansRouter.post('/:id/return', async (c) => {
  const playerId = c.get('playerId');
  const loanId = c.req.param('id');

  const loan = await db
    .select()
    .from(allianceUnitLoans)
    .where(and(eq(allianceUnitLoans.id, loanId), eq(allianceUnitLoans.status, 'active')))
    .limit(1);

  if (loan.length === 0) return c.json({ error: 'Loan not found or already ended' }, 404);

  const record = loan[0];
  if (record.borrowerId !== playerId) {
    return c.json({ error: 'Only the borrower can return a loan' }, 403);
  }

  await db
    .update(allianceUnitLoans)
    .set({ status: 'returned' })
    .where(eq(allianceUnitLoans.id, loanId));

  // Log activity feed event
  void logAllianceActivity(record.allianceId, playerId, 'loan_returned',
    `${record.unitType} returned by borrower`);

  return c.json({ success: true, status: 'returned' });
});

// ── POST /api/alliances/loans/:id/recall — officer recalls a loan early ─────
loansRouter.post('/:id/recall', async (c) => {
  const playerId = c.get('playerId');
  const loanId = c.req.param('id');

  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Only officers+ can recall
  if (membership.role !== 'founder' && membership.role !== 'officer') {
    return c.json({ error: 'Only officers can recall loans' }, 403);
  }

  const loan = await db
    .select()
    .from(allianceUnitLoans)
    .where(and(eq(allianceUnitLoans.id, loanId), eq(allianceUnitLoans.status, 'active')))
    .limit(1);

  if (loan.length === 0) return c.json({ error: 'Loan not found or already ended' }, 404);

  const record = loan[0];
  // Lender or officer+ can recall
  if (record.lenderId !== playerId && membership.role !== 'founder') {
    return c.json({ error: 'Only the lender or founder can recall this loan' }, 403);
  }

  await db
    .update(allianceUnitLoans)
    .set({ status: 'recalled' })
    .where(eq(allianceUnitLoans.id, loanId));

  // Log activity feed event
  void logAllianceActivity(record.allianceId, playerId, 'loan_recalled',
    `${record.unitType} recalled from borrower`);

  return c.json({ success: true, status: 'recalled' });
});

// ── POST /api/alliances/loans/expire — expire overdue loans (called by cron) ─
loansRouter.post('/expire', async (c) => {
  const now = new Date();

  const expired = await db
    .update(allianceUnitLoans)
    .set({ status: 'expired' })
    .where(
      and(
        eq(allianceUnitLoans.status, 'active'),
        sql`${allianceUnitLoans.expiresAt} <= ${now}`,
      ),
    )
    .returning({ id: allianceUnitLoans.id });

  return c.json({ expired: expired.length });
});

// ── GET /api/alliances/loans — active loans for the current player ──────────
loansRouter.get('/', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  // Get active loans where player is lender or borrower
  const rows = await db
    .select()
    .from(allianceUnitLoans)
    .where(
      and(
        eq(allianceUnitLoans.allianceId, membership.allianceId),
        eq(allianceUnitLoans.status, 'active'),
        or(
          eq(allianceUnitLoans.lenderId, playerId),
          eq(allianceUnitLoans.borrowerId, playerId),
        ),
      ),
    )
    .orderBy(desc(allianceUnitLoans.createdAt));

  // Resolve player names
  const playerIds = [...new Set([...rows.map((l) => l.lenderId), ...rows.map((l) => l.borrowerId)])];
  const playerRows =
    playerIds.length > 0
      ? await db.select({ id: players.id, name: players.username }).from(players).where(sql`${players.id} in ${playerIds}`)
      : [];
  const nameMap = new Map(playerRows.map((p) => [p.id, p.name]));

  return c.json({
    loans: rows.map((l) => ({
      id: l.id,
      unitType: l.unitType,
      unitName: l.unitName,
      lenderId: l.lenderId,
      lenderName: nameMap.get(l.lenderId) ?? 'Unknown',
      borrowerId: l.borrowerId,
      borrowerName: nameMap.get(l.borrowerId) ?? 'Unknown',
      durationMinutes: l.durationMinutes,
      expiresAt: l.expiresAt,
      isLender: l.lenderId === playerId,
      isBorrower: l.borrowerId === playerId,
    })),
  });
});

// ── GET /api/alliances/loans/all — all alliance loans (for roster display) ──
loansRouter.get('/all', async (c) => {
  const playerId = c.get('playerId');
  const membership = await getMembership(playerId);
  if (!membership) return c.json({ error: 'Not in an alliance' }, 403);

  const rows = await db
    .select()
    .from(allianceUnitLoans)
    .where(eq(allianceUnitLoans.allianceId, membership.allianceId))
    .orderBy(desc(allianceUnitLoans.createdAt))
    .limit(50);

  const playerIds = [...new Set([...rows.map((l) => l.lenderId), ...rows.map((l) => l.borrowerId)])];
  const playerRows =
    playerIds.length > 0
      ? await db.select({ id: players.id, name: players.username }).from(players).where(sql`${players.id} in ${playerIds}`)
      : [];
  const nameMap = new Map(playerRows.map((p) => [p.id, p.name]));

  return c.json({
    loans: rows.map((l) => ({
      id: l.id,
      unitType: l.unitType,
      unitName: l.unitName,
      lenderName: nameMap.get(l.lenderId) ?? 'Unknown',
      borrowerName: nameMap.get(l.borrowerId) ?? 'Unknown',
      durationMinutes: l.durationMinutes,
      expiresAt: l.expiresAt,
      status: l.status,
      createdAt: l.createdAt,
    })),
  });
});

// ── Periodic expiry (called by server interval) ─────────────────────────
export async function expireOverdueLoans(): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(allianceUnitLoans)
    .set({ status: 'expired' })
    .where(
      and(
        eq(allianceUnitLoans.status, 'active'),
        sql`${allianceUnitLoans.expiresAt} <= ${now}`,
      ),
    )
    .returning({ id: allianceUnitLoans.id });
  return expired.length;
}

export { loansRouter };
