import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, playerStats, playerSettings } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import { premiumActive } from '../lib/shop';
import { isAdminPlayer } from '../lib/requireAdmin';
import { pendingGrants, ackGrants } from '../lib/grants';
import { isoWeekKey, type WeeklySnapshot } from '@dispatch-hq/shared';

const player = new Hono<{ Variables: AuthVars }>();

/**
 * Store this week's snapshot in player_settings jsonb (key `weekly`) so the
 * Friends leaderboard can compare "who's ahead this week" without a schema
 * migration — same pattern as the social graph.
 */
async function storeWeekly(playerId: string, weekly: Partial<WeeklySnapshot> | null): Promise<void> {
  if (!weekly || typeof weekly !== 'object') return;
  const weekKey = String(weekly.weekKey ?? isoWeekKey());
  const incoming: WeeklySnapshot = {
    weekKey,
    callsRun: Math.max(0, Number(weekly.callsRun) || 0),
    cleared: Math.max(0, Number(weekly.cleared) || 0),
    creditsEarned: Math.max(0, Number(weekly.creditsEarned) || 0),
    xpEarned: Math.max(0, Number(weekly.xpEarned) || 0),
  };
  const rows = await db
    .select({ settings: playerSettings.settings })
    .from(playerSettings)
    .where(eq(playerSettings.playerId, playerId))
    .limit(1);
  const current = rows[0]?.settings as Record<string, unknown> | null | undefined;
  const next = { ...(current ?? {}), weekly: incoming };
  await db.insert(playerSettings)
    .values({ playerId, settings: next })
    .onConflictDoUpdate({
      target: playerSettings.playerId,
      set: { settings: next, updatedAt: new Date() },
    });
}

// ── Batch 1 (P1-M5): server-side plausibility gate for client-pushed stats ──
// The old code stored GREATEST(existing, submitted) with no check, so any
// authenticated token could post +1,000,000 missions and top the leaderboard.
// Caps are deliberately far above real play: the client syncs on every mission
// clear and shift end, so a legit single sync moves totals by a handful, not
// hundreds. A rejected sync writes NOTHING (not even the weekly snapshot) and
// the client keeps its local totals — the next legit sync still lands.
export const STATS_ABSOLUTE_CAPS = {
  missionsCompleted: 1_000_000,
  totalCreditsEarned: 100_000_000,
  missionsFailed: 1_000_000,
  mutualAidAnswered: 1_000_000,
} as const;

export const STATS_DELTA_CAPS = {
  missionsCompleted: 500,
  totalCreditsEarned: 2_000_000,
  missionsFailed: 500,
  mutualAidAnswered: 500,
} as const;

export interface StatsSubmission {
  missionsCompleted: number;
  totalCreditsEarned: number;
  missionsFailed: number;
  mutualAidAnswered: number;
  bestResponseTime: number;
}

export function validateStatsSync(
  existing: StatsSubmission | null,
  submitted: StatsSubmission,
): string | null {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  // No-row baseline is ZERO, not a free pass: a first-ever sync is gated by the
  // same per-sync delta caps. Otherwise any fresh token could post the full
  // absolute cap (1,000,000 missions) on its first sync and top the board —
  // the exact attack this gate exists to stop (proven live 2026-11-03: a
  // throwaway guest's first sync of exactly 1,000,000 missions landed).
  const baseline: StatsSubmission = existing ?? {
    missionsCompleted: 0,
    totalCreditsEarned: 0,
    missionsFailed: 0,
    mutualAidAnswered: 0,
    bestResponseTime: 0,
  };
  for (const key of ['missionsCompleted', 'totalCreditsEarned', 'missionsFailed', 'mutualAidAnswered'] as const) {
    const value = num(submitted[key]);
    if (!Number.isFinite(value) || value < 0) return `${key} must be a non-negative number`;
    if (value > STATS_ABSOLUTE_CAPS[key]) return `${key} exceeds the plausible maximum`;
    const delta = value - num(baseline[key]);
    if (delta > STATS_DELTA_CAPS[key]) {
      return `${key} jumped by ${Math.floor(delta)} in one sync — implausible, rejected`;
    }
  }
  const brt = num(submitted.bestResponseTime);
  if (!Number.isFinite(brt) || brt < 0) return 'bestResponseTime must be a non-negative number';
  // 0 = unset. A nonzero best response under 5s is not a real dispatch; over
  // a day is not a response time. Either way it never reaches the board.
  if (brt !== 0 && (brt < 5 || brt > 86400)) return 'bestResponseTime is outside the plausible range';
  return null;
}

// Cumulative career stats pushed by the client (Dispatch Records). Upserts into
// player_stats so the server-side leaderboard reflects real play.
player.post('/stats', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const stats = body?.stats ?? null;
  if (!stats || typeof stats !== 'object') {
    return c.json({ error: 'stats object required' }, 400);
  }

  const existingRows = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);
  const existing: StatsSubmission | null = existingRows.length > 0
    ? {
        missionsCompleted: existingRows[0].missionsCompleted ?? 0,
        totalCreditsEarned: existingRows[0].totalCreditsEarned ?? 0,
        missionsFailed: existingRows[0].totalMissionsFailed ?? 0,
        mutualAidAnswered: existingRows[0].mutualAidAnswered ?? 0,
        bestResponseTime: existingRows[0].bestResponseTime ?? 0,
      }
    : null;

  const submitted: StatsSubmission = {
    missionsCompleted: Math.max(0, Number(stats.missionsCompleted) || 0),
    totalCreditsEarned: Math.max(0, Number(stats.totalCreditsEarned) || 0),
    missionsFailed: Math.max(0, Number(stats.missionsFailed) || 0),
    mutualAidAnswered: Math.max(0, Number(stats.mutualAidAnswered) || 0),
    bestResponseTime: Math.max(0, Number(stats.bestResponseTime) || 0),
  };

  const rejection = validateStatsSync(existing, submitted);
  if (rejection) return c.json({ error: rejection }, 422);

  // Weekly snapshot for the Friends leaderboard (rides along on every sync).
  // Best-effort: a settings-write failure must never block the primary career
  // stats upsert below.
  try {
    await storeWeekly(playerId, body?.weekly ?? null);
  } catch (e) {
    console.warn('Failed to store weekly snapshot:', e);
  }

  if (!existing) {
    await db.insert(playerStats).values({
      playerId,
      missionsCompleted: submitted.missionsCompleted,
      totalCreditsEarned: submitted.totalCreditsEarned,
      totalMissionsFailed: submitted.missionsFailed,
      mutualAidAnswered: submitted.mutualAidAnswered,
      bestResponseTime: submitted.bestResponseTime,
    });
  } else {
    // Monotonic counters: take the client's value when it is ahead; keep the
    // fastest (lowest nonzero) best response time.
    await db.update(playerStats)
      .set({
        missionsCompleted: sql`GREATEST(${playerStats.missionsCompleted}, ${submitted.missionsCompleted})`,
        totalCreditsEarned: sql`GREATEST(${playerStats.totalCreditsEarned}, ${submitted.totalCreditsEarned})`,
        totalMissionsFailed: sql`GREATEST(${playerStats.totalMissionsFailed}, ${submitted.missionsFailed})`,
        mutualAidAnswered: sql`GREATEST(${playerStats.mutualAidAnswered}, ${submitted.mutualAidAnswered})`,
        bestResponseTime: submitted.bestResponseTime > 0
          ? sql`CASE WHEN ${playerStats.bestResponseTime} = 0 OR ${submitted.bestResponseTime} < ${playerStats.bestResponseTime} THEN ${submitted.bestResponseTime} ELSE ${playerStats.bestResponseTime} END`
          : playerStats.bestResponseTime,
        updatedAt: new Date(),
      })
      .where(eq(playerStats.playerId, playerId));
  }

  return c.json({ success: true });
});

player.get('/me', async (c) => {
  const playerId = c.get('playerId');
  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (result.length === 0) return c.json({ error: 'Player not found' }, 404);
  const row = result[0];
  return c.json({
    id: row.id,
    username: row.username,
    email: row.email,
    credits: row.credits,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    isPremium: premiumActive(row),
    homeLat: row.homeLat,
    homeLng: row.homeLng,
    createdAt: row.createdAt,
    lastActive: row.lastActive,
  });
});

// ── Batch 1 (P1-M3): grant-ledger delivery ─────────────────────────────────
// Undelivered grants for the CALLER only (self-scoped by the auth blanket).
// The client applies each grant id once (deduped against localStorage, so a
// crash between apply and ack can never double-apply) and acks the batch.
player.get('/grants/pending', async (c) => {
  const playerId = c.get('playerId');
  return c.json({ grants: await pendingGrants(playerId) });
});

player.post('/grants/ack', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const acked = await ackGrants(playerId, ids);
  return c.json({ success: true, acked });
});

// Batch 1 (P0-1): least privilege. The old route returned ANY player's email,
// wallet, and home coordinates to ANY authenticated player — no client caller
// exists (only /player/settings, /player/saves, /player/stats in apiClient),
// so the route is now self-or-admin only. A non-self, non-admin caller gets
// 404 (indistinguishable from a missing player), never a redacted profile
// that would confirm the id exists. /me above stays self-scoped and unchanged.
player.get('/:id', async (c) => {
  const playerId = c.get('playerId');
  const id = c.req.param('id');
  if (id !== playerId && !(await isAdminPlayer(playerId))) {
    return c.json({ error: 'Player not found' }, 404);
  }
  const result = await db.select().from(players).where(eq(players.id, id)).limit(1);
  if (result.length === 0) {
    return c.json({ error: 'Player not found' }, 404);
  }
  const row = result[0];
  return c.json({
    id: row.id,
    username: row.username,
    email: row.email,
    credits: row.credits,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    isPremium: premiumActive(row),
    homeLat: row.homeLat,
    homeLng: row.homeLng,
    createdAt: row.createdAt,
    lastActive: row.lastActive,
  });
});

// NOTE (2026-10-25 server-gate batch): the old PUT /:id route was DELETED,
// not gated. It let any authenticated player rewrite any player's wallet,
// level, and premium flag, and no client caller exists anywhere in the tree
// (web, desktop, servers, packages, scripts, docs) — game state syncs via
// the WebSocket actionHandler and /player/saves + /player/stats. Admin
// grants go through POST /api/admin/grant. If a write endpoint is ever
// needed again, it must check id === playerId (or admin) and must never
// let a non-admin set isPremium.

export { player as playerRoutes };
