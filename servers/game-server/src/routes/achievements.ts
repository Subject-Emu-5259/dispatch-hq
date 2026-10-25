// ============================================
// Dispatch HQ — Achievements Routes
// ============================================

import { Hono } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { achievements, playerAchievements, playerStats, players } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const ACHIEVEMENT_SEED = [
  { key: 'first_dispatch', name: 'First Response', description: 'Dispatch your first unit.', icon: '🚨', xpBonus: 50, requirementType: 'missions_completed', requirementValue: 1 },
  { key: 'builder', name: 'Station Builder', description: 'Build your first station.', icon: '🏗️', xpBonus: 100, requirementType: 'stations_built', requirementValue: 1 },
  { key: 'fleet_commander', name: 'Fleet Commander', description: 'Own 10 units.', icon: '🚓', xpBonus: 200, requirementType: 'units_owned', requirementValue: 10 },
  { key: 'seasoned', name: 'Seasoned Commander', description: 'Complete 50 missions.', icon: '🏅', xpBonus: 500, requirementType: 'missions_completed', requirementValue: 50 },
  // Ward expansion (v0.22.17) — credits-bought ER bed upgrades unlock at level 3.
  { key: 'ward_expander', name: 'Ward Expander', description: 'Expanded the ER ward three times.', icon: '🏥', xpBonus: 300, requirementType: 'ward_upgrades', requirementValue: 3 },
  // Seasonal participation badges — awarded for clearing any call during a
  // holiday window (v0.21.0). Must exist server-side or award/:key 404s.
  { key: 'seasonal_4th_of_july', name: 'Liberty Responder', description: 'Answered calls during the Fourth of July celebration.', icon: '🎆', xpBonus: 200, requirementType: 'seasonal_clears', requirementValue: 1 },
  { key: 'seasonal_christmas', name: 'Holiday Hero', description: 'Kept the city safe through Christmas Eve and Day.', icon: '🎄', xpBonus: 200, requirementType: 'seasonal_clears', requirementValue: 1 },
  // Seasonal contest winner badges — awarded to the top clearer when a window ends (v0.21.1).
  { key: 'seasonal_winner_independence-day', name: 'July 4th Champion', description: 'Cleared the most calls during the Fourth of July contest.', icon: '🏆', xpBonus: 1000, requirementType: 'seasonal_winner', requirementValue: 1 },
  { key: 'seasonal_winner_christmas', name: 'Holiday Champion', description: 'Cleared the most calls during the Christmas contest.', icon: '🏆', xpBonus: 1000, requirementType: 'seasonal_winner', requirementValue: 1 },
  // Halloween 2026 (window Oct 26 – Nov 1 UTC) — same pattern as above.
  { key: 'seasonal_halloween', name: 'Night Watch', description: 'Kept the city safe through Halloween week.', icon: '🎃', xpBonus: 200, requirementType: 'seasonal_clears', requirementValue: 1 },
  { key: 'seasonal_winner_halloween', name: 'Halloween Champion', description: 'Cleared the most calls during the Halloween contest.', icon: '🏆', xpBonus: 1000, requirementType: 'seasonal_winner', requirementValue: 1 },
];

async function ensureAchievements() {
  const existing = await db.select({ id: achievements.id, key: achievements.key }).from(achievements);
  const existingKeys = new Set(existing.map((e) => e.key));
  const missing = ACHIEVEMENT_SEED.filter((a) => !existingKeys.has(a.key));
  if (missing.length > 0) {
    await db.insert(achievements).values(missing);
  }
}

const achievementsApp = new Hono<{ Variables: AuthVars }>();

achievementsApp.get('/', async (c) => {
  await ensureAchievements();
  const playerId = c.get('playerId');
  const all = await db.select().from(achievements);
  const earnedRows = await db.select({ achievementId: playerAchievements.achievementId }).from(playerAchievements).where(eq(playerAchievements.playerId, playerId));
  const earned = new Set(earnedRows.map((r) => r.achievementId));
  return c.json({
    achievements: all.map((a) => ({ ...a, earned: earned.has(a.id) })),
  });
});

/**
 * Award an achievement to a player by key — idempotent. Creates the row when
 * missing (per-player) and credits the XP bonus once. Used by the award route
 * and by the seasonal contest winner resolution.
 */
export async function awardAchievementByKey(
  playerId: string,
  key: string,
): Promise<{ success: boolean; alreadyEarned?: boolean; achievement?: typeof achievements.$inferSelect }> {
  await ensureAchievements();
  const achRows = await db.select().from(achievements).where(eq(achievements.key, key)).limit(1);
  if (achRows.length === 0) return { success: false };
  const ach = achRows[0];

  const already = await db.select().from(playerAchievements)
    .where(and(eq(playerAchievements.playerId, playerId), eq(playerAchievements.achievementId, ach.id)))
    .limit(1);
  if (already.length > 0) return { success: true, alreadyEarned: true };

  await db.insert(playerAchievements).values({ playerId, achievementId: ach.id });
  if (ach.xpBonus > 0) {
    await db.update(players).set({ xp: sql`${players.xp} + ${ach.xpBonus}` }).where(eq(players.id, playerId));
  }
  return { success: true, achievement: ach };
}

achievementsApp.post('/award/:key', async (c) => {
  const playerId = c.get('playerId');
  const key = c.req.param('key');
  const result = await awardAchievementByKey(playerId, key);
  if (!result.success) return c.json({ error: 'Achievement not found' }, 404);
  return c.json({ success: true, alreadyEarned: result.alreadyEarned ?? false, achievement: result.achievement });
});

export { achievementsApp as achievementsRoutes, ensureAchievements };
