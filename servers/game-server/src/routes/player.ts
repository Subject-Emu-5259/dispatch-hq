import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, playerStats, playerSettings } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import { premiumActive } from '../lib/shop';
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

// Cumulative career stats pushed by the client (Dispatch Records). Upserts into
// player_stats so the server-side leaderboard reflects real play.
player.post('/stats', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const stats = body?.stats ?? null;
  if (!stats || typeof stats !== 'object') {
    return c.json({ error: 'stats object required' }, 400);
  }

  const existing = await db
    .select({ playerId: playerStats.playerId })
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);

  const missionsCompleted = Math.max(0, Number(stats.missionsCompleted) || 0);
  const totalCreditsEarned = Math.max(0, Number(stats.totalCreditsEarned) || 0);
  const totalMissionsFailed = Math.max(0, Number(stats.missionsFailed) || 0);
  const mutualAidAnswered = Math.max(0, Number(stats.mutualAidAnswered) || 0);
  const bestResponseTime = Math.max(0, Number(stats.bestResponseTime) || 0);

  // Weekly snapshot for the Friends leaderboard (rides along on every sync).
  // Best-effort: a settings-write failure must never block the primary career
  // stats upsert below.
  try {
    await storeWeekly(playerId, body?.weekly ?? null);
  } catch (e) {
    console.warn('Failed to store weekly snapshot:', e);
  }

  if (existing.length === 0) {
    await db.insert(playerStats).values({
      playerId,
      missionsCompleted,
      totalCreditsEarned,
      totalMissionsFailed,
      mutualAidAnswered,
      bestResponseTime,
    });
  } else {
    // Monotonic counters: take the client's value when it is ahead; keep the
    // fastest (lowest nonzero) best response time.
    await db.update(playerStats)
      .set({
        missionsCompleted: sql`GREATEST(${playerStats.missionsCompleted}, ${missionsCompleted})`,
        totalCreditsEarned: sql`GREATEST(${playerStats.totalCreditsEarned}, ${totalCreditsEarned})`,
        totalMissionsFailed: sql`GREATEST(${playerStats.totalMissionsFailed}, ${totalMissionsFailed})`,
        mutualAidAnswered: sql`GREATEST(${playerStats.mutualAidAnswered}, ${mutualAidAnswered})`,
        bestResponseTime: bestResponseTime > 0
          ? sql`CASE WHEN ${playerStats.bestResponseTime} = 0 OR ${bestResponseTime} < ${playerStats.bestResponseTime} THEN ${bestResponseTime} ELSE ${playerStats.bestResponseTime} END`
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

player.get('/:id', async (c) => {
  const id = c.req.param('id');
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

player.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowedFields = ['credits', 'coins', 'xp', 'level', 'isPremium', 'homeLat', 'homeLng', 'lastActive'];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }
  await db.update(players).set(updates).where(eq(players.id, id));
  return c.json({ success: true });
});

export { player as playerRoutes };