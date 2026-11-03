// ============================================
// Dispatch HQ — Seasonal Contest Routes (v0.21.1)
// ============================================
// Per-holiday-window leaderboard contest. Every mission a player clears during
// an active seasonal window counts toward the event; the top clearer when the
// window closes wins the winner badge (awarded lazily on first read, idempotent).
//
// Window dates mirror the client's SEASONAL_EVENTS (apps/web/src/lib/seasonal.ts)
// in UTC — keep both in sync when a new holiday is added.

import { Hono } from 'hono';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, seasonalContestEntries, seasonalContests } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import { awardAchievementByKey } from './achievements';
import { awardAllianceXp, ALLIANCE_XP_PER_SEASONAL_CLEAR } from './alliances';

interface SeasonalWindow {
  id: string;
  /** UTC start, inclusive: [startMonth, startDay). */
  start: { month: number; day: number };
  /** UTC end, inclusive: [start, end]. */
  end: { month: number; day: number };
}

/** Keep in sync with apps/web/src/lib/seasonal.ts — same windows, same ids. */
export const SEASONAL_WINDOWS: SeasonalWindow[] = [
  { id: 'independence-day', start: { month: 7, day: 1 }, end: { month: 7, day: 6 } },
  { id: 'christmas', start: { month: 12, day: 24 }, end: { month: 12, day: 26 } },
  // Batch 3d: generic-season windows (mirror apps/web/src/lib/seasonal.ts).
  { id: 'winter-storm', start: { month: 1, day: 12 }, end: { month: 1, day: 18 } },
  { id: 'summer-wildfire', start: { month: 8, day: 10 }, end: { month: 8, day: 16 } },
  // Halloween 2026: Oct 26 – Nov 1 (UTC, inclusive) — live for the Oct 27
  // launch week run-up and Oct 31 itself. Mirrors the client entry exactly.
  { id: 'halloween', start: { month: 10, day: 26 }, end: { month: 11, day: 1 } },
];

/** Human labels mirroring apps/web/src/lib/seasonal.ts SEASONAL_EVENTS names. */
export const SEASONAL_WINDOW_LABELS: Record<string, string> = {
  'independence-day': 'Fourth of July',
  christmas: 'Christmas Holiday',
  halloween: 'Halloween',
  'winter-storm': 'Winter Storm Season',
  'summer-wildfire': 'Summer Wildfire Season',
};

function dayKey(month: number, day: number): number {
  return month * 100 + day;
}

function windowFor(id: string): SeasonalWindow | undefined {
  return SEASONAL_WINDOWS.find((w) => w.id === id);
}

/** True when `now` is inside the window (UTC). */
export function windowActive(w: SeasonalWindow, now: Date = new Date()): boolean {
  const today = dayKey(now.getUTCMonth() + 1, now.getUTCDate());
  return today >= dayKey(w.start.month, w.start.day) && today <= dayKey(w.end.month, w.end.day);
}

/** True when the window has fully ended (UTC). */
export function windowEnded(w: SeasonalWindow, now: Date = new Date()): boolean {
  return dayKey(now.getUTCMonth() + 1, now.getUTCDate()) > dayKey(w.end.month, w.end.day);
}

/**
 * Award the winner badge for an event once, when the window has ended. Returns
 * the winner info or null when already awarded / no entries / window live.
 * Idempotent: the seasonal_contests row is the lock.
 */
/**
 * Read a contest's winner: the persisted row if one exists, otherwise lazily
 * resolve it (top clearer, award badge) when the window has ended. Shared by
 * the player leaderboard route and the admin console view.
 */
export async function getContestWinner(eventId: string): Promise<{ playerId: string; username: string; calls: number } | null> {
  const saved = await db.select().from(seasonalContests).where(eq(seasonalContests.eventId, eventId)).limit(1);
  if (saved.length > 0 && saved[0].winnerId) {
    const nameRow = await db.select({ username: players.username }).from(players).where(eq(players.id, saved[0].winnerId)).limit(1);
    const callsRow = await db
      .select({ callsCleared: seasonalContestEntries.callsCleared, cityClears: seasonalContestEntries.cityClears })
      .from(seasonalContestEntries)
      .where(and(eq(seasonalContestEntries.eventId, eventId), eq(seasonalContestEntries.playerId, saved[0].winnerId)))
      .limit(1);
    return {
      playerId: saved[0].winnerId,
      username: nameRow[0]?.username ?? 'Commander',
      calls: (callsRow[0]?.callsCleared ?? 0) + (callsRow[0]?.cityClears ?? 0),
    };
  }
  return resolveWinner(eventId);
}

export async function resolveWinner(eventId: string): Promise<{ playerId: string; username: string; calls: number } | null> {
  const existing = await db.select().from(seasonalContests).where(eq(seasonalContests.eventId, eventId)).limit(1);
  if (existing.length > 0 && existing[0].winnerId) return null;

  const top = await db
    .select({ playerId: seasonalContestEntries.playerId, totalClears: TOTAL_CLEARS })
    .from(seasonalContestEntries)
    .where(eq(seasonalContestEntries.eventId, eventId))
    .orderBy(desc(TOTAL_CLEARS))
    .limit(1);
  if (top.length === 0 || (top[0].totalClears ?? 0) <= 0) return null;
  const winner = top[0];

  // Mark awarded FIRST (best-effort) so two concurrent reads can't double-award;
  // the badge insert is idempotent anyway.
  await db
    .insert(seasonalContests)
    .values({ eventId, winnerId: winner.playerId, awardedAt: new Date() })
    .onConflictDoUpdate({
      target: seasonalContests.eventId,
      set: { winnerId: winner.playerId, awardedAt: new Date(), updatedAt: new Date() },
    });

  await awardAchievementByKey(winner.playerId, `seasonal_winner_${eventId}`);

  const nameRow = await db.select({ username: players.username }).from(players).where(eq(players.id, winner.playerId)).limit(1);
  return {
    playerId: winner.playerId,
    username: nameRow[0]?.username ?? 'Commander',
    calls: winner.totalClears ?? 0,
  };
}

const seasonal = new Hono<{ Variables: AuthVars }>();

/** Total contest clears = manual + city (ranking uses the sum). */
export const TOTAL_CLEARS = sql<number>`${seasonalContestEntries.callsCleared} + ${seasonalContestEntries.cityClears}`;

/** Pure: what kind of clear a /complete request recorded. */
export function parseClearKind(raw: unknown): 'player' | 'city' {
  return raw === 'city' ? 'city' : 'player';
}

/** Record one cleared call toward the event (fire-and-forget from the client). */
seasonal.post('/contest/:eventId/complete', async (c) => {
  const playerId = c.get('playerId');
  const eventId = c.req.param('eventId');
  const body = await c.req.json().catch(() => null);
  const kind = parseClearKind(body?.kind);
  const w = windowFor(eventId);
  if (!w) return c.json({ error: 'Unknown seasonal event' }, 404);
  // No-ops outside the window (clock skew between client/server tolerated).
  if (!windowActive(w)) return c.json({ success: false, active: false });

  // kind === 'city' records a CPU-handled clear into its own column; anything
  // else is a manual player clear. Each stays visible separately.
  const isCity = kind === 'city';
  await db
    .insert(seasonalContestEntries)
    .values({
      eventId,
      playerId,
      callsCleared: isCity ? 0 : 1,
      cityClears: isCity ? 1 : 0,
      lastClearedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [seasonalContestEntries.eventId, seasonalContestEntries.playerId],
      set: isCity
        ? {
            cityClears: sql`${seasonalContestEntries.cityClears} + 1`,
            lastClearedAt: new Date(),
          }
        : {
            callsCleared: sql`${seasonalContestEntries.callsCleared} + 1`,
            lastClearedAt: new Date(),
          },
    });

  // Lazy winner fallback: if the window closed mid-session, resolve now.
  if (windowEnded(w)) await resolveWinner(eventId).catch(() => null);

  // Batch 1 (P1-M6): the server-verified completion event. The window was
  // validated above and the entry row persisted, so this clear is real as far
  // as the server can tell — award the fixed server-determined alliance XP
  // (never a client number). Best-effort: a missing alliance is a no-op.
  if (!isCity) {
    await awardAllianceXp(playerId, ALLIANCE_XP_PER_SEASONAL_CLEAR).catch(() => null);
  }

  return c.json({ success: true, kind });
});

/** Contest standings: top 20, the requester's rank, and winner resolution. */
seasonal.get('/contest/:eventId/leaderboard', async (c) => {
  const playerId = c.get('playerId');
  const eventId = c.req.param('eventId');
  const w = windowFor(eventId);
  if (!w) return c.json({ error: 'Unknown seasonal event' }, 404);

  const ended = windowEnded(w);
  let winner: { playerId: string; username: string; calls: number } | null = null;
  if (ended) winner = await getContestWinner(eventId);

  const entries = await db
    .select({
      playerId: seasonalContestEntries.playerId,
      callsCleared: seasonalContestEntries.callsCleared,
      cityClears: seasonalContestEntries.cityClears,
      totalClears: TOTAL_CLEARS,
      lastClearedAt: seasonalContestEntries.lastClearedAt,
      username: players.username,
      level: players.level,
    })
    .from(seasonalContestEntries)
    .leftJoin(players, eq(seasonalContestEntries.playerId, players.id))
    .where(eq(seasonalContestEntries.eventId, eventId))
    .orderBy(desc(TOTAL_CLEARS), desc(seasonalContestEntries.lastClearedAt))
    .limit(20);

  // Requester's own rank + counts (they may sit outside the top 20). Rank is
  // by TOTAL clears (manual + city) so city-handled work still moves you up.
  const myRow = await db
    .select({ callsCleared: seasonalContestEntries.callsCleared, cityClears: seasonalContestEntries.cityClears })
    .from(seasonalContestEntries)
    .where(and(eq(seasonalContestEntries.eventId, eventId), eq(seasonalContestEntries.playerId, playerId)))
    .limit(1);
  let myRank: number | null = null;
  let myCalls = 0;
  let myCity = 0;
  if (myRow.length > 0) {
    myCalls = myRow[0].callsCleared;
    myCity = myRow[0].cityClears;
    const myTotal = myCalls + myCity;
    if (myTotal > 0) {
      const ahead = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(seasonalContestEntries)
        .where(
          and(
            eq(seasonalContestEntries.eventId, eventId),
            sql`${seasonalContestEntries.callsCleared} + ${seasonalContestEntries.cityClears} > ${myTotal}`,
          ),
        );
      myRank = (ahead[0]?.count ?? 0) + 1;
    }
  }

  return c.json({
    eventId,
    active: windowActive(w),
    ended,
    winner,
    entries: entries.map((e, i) => ({ ...e, rank: i + 1 })),
    me: { playerId, rank: myRank, callsCleared: myCalls, cityClears: myCity, totalClears: myCalls + myCity },
  });
});

export { seasonal as seasonalRoutes };
