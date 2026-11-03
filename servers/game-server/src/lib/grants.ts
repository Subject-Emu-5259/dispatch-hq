// ============================================
// Dispatch HQ — Server-side grant ledger (Batch 1, P1-M3)
// ============================================
// Delivery record for DB-side grants (promo redemptions, admin grants).
// Recorded in the SAME transaction that moves the player row, so a grant
// can never land on the wallet without a delivery row (or vice versa).
// The client delivers by ledger id and acks; see routes/player.ts
// (GET /player/grants/pending, POST /player/grants/ack) and the /me poll
// in apps/web/src/App.tsx.

import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '../db';
import { playerGrants } from '../db/schema';

export interface GrantAmounts {
  credits?: number;
  coins?: number;
  xp?: number;
  level?: number;
}

/** Minimal tx surface: the real Drizzle tx object satisfies this. */
export type GrantTx = {
  insert: (table: unknown) => { values: (row: Record<string, unknown>) => Promise<unknown> };
};

export async function recordGrant(
  tx: GrantTx,
  playerId: string,
  source: 'promo' | 'admin',
  ref: string,
  amounts: GrantAmounts,
): Promise<void> {
  await tx.insert(playerGrants).values({
    playerId,
    source,
    ref,
    credits: Math.max(0, Math.floor(amounts.credits ?? 0)),
    coins: Math.max(0, Math.floor(amounts.coins ?? 0)),
    xp: Math.max(0, Math.floor(amounts.xp ?? 0)),
    level: Math.max(0, Math.floor(amounts.level ?? 0)),
  });
}

/** Undelivered ledger rows for one player, oldest first. */
export async function pendingGrants(playerId: string) {
  const rows = await db
    .select()
    .from(playerGrants)
    .where(and(eq(playerGrants.playerId, playerId), isNull(playerGrants.deliveredAt)))
    .orderBy(playerGrants.createdAt);
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    ref: r.ref,
    credits: r.credits,
    coins: r.coins,
    xp: Number(r.xp) || 0,
    level: r.level,
    createdAt: r.createdAt,
  }));
}

/** Mark ledger rows delivered (idempotent — already-delivered rows stay so). */
export async function ackGrants(playerId: string, ids: string[]): Promise<number> {
  const clean = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 100);
  if (clean.length === 0) return 0;
  const rows = await db
    .update(playerGrants)
    .set({ deliveredAt: new Date() })
    .where(
      and(
        eq(playerGrants.playerId, playerId),
        isNull(playerGrants.deliveredAt),
        inArray(playerGrants.id, clean),
      ),
    )
    .returning({ id: playerGrants.id });
  return rows.length;
}
