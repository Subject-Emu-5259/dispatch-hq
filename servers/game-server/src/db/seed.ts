// ============================================
// Dispatch HQ — Database Seeding
// ============================================
// Seeds an initial Commander player, the achievement catalog, and a welcome
// promo code so the redemption system is testable immediately after deploy.

import { db } from './index';
import { players, achievements, promoCodes, membershipTiers, coinPacks } from './schema';
import { MEMBERSHIP_TIER_SEED, COIN_PACK_SEED } from '../lib/shop';

const ACHIEVEMENT_SEED = [
  { key: 'first_responder', name: 'First Responder', description: 'Complete your first mission.', icon: '\uD83C\uDF96\uFE0F', xpBonus: 50, requirementType: 'missions_completed', requirementValue: 1 },
  { key: 'station_commander', name: 'Station Commander', description: 'Build your first station.', icon: '\uD83C\uDFDB\uFE0F', xpBonus: 100, requirementType: 'stations_built', requirementValue: 1 },
  { key: 'fleet_builder', name: 'Fleet Builder', description: 'Own 10 units at once.', icon: '\uD83D\uDE93', xpBonus: 200, requirementType: 'units_owned', requirementValue: 10 },
  { key: 'seasoned_chief', name: 'Seasoned Chief', description: 'Reach level 10.', icon: '\uD83C\uDFC6', xpBonus: 500, requirementType: 'level', requirementValue: 10 },
  { key: 'credit_mogul', name: 'Credit Mogul', description: 'Earn 100,000 credits.', icon: '\uD83D\uDCB0', xpBonus: 1000, requirementType: 'credits_earned', requirementValue: 100000 },
  // Seasonal participation badges (v0.21.0) + contest winner badges (v0.21.1).
  { key: 'seasonal_4th_of_july', name: 'Liberty Responder', description: 'Answered calls during the Fourth of July celebration.', icon: '\uD83C\uDF86', xpBonus: 200, requirementType: 'seasonal_clears', requirementValue: 1 },
  { key: 'seasonal_christmas', name: 'Holiday Hero', description: 'Kept the city safe through Christmas Eve and Day.', icon: '\uD83C\uDF84', xpBonus: 200, requirementType: 'seasonal_clears', requirementValue: 1 },
  { key: 'seasonal_winner_independence-day', name: 'July 4th Champion', description: 'Cleared the most calls during the Fourth of July contest.', icon: '\uD83C\uDFC6', xpBonus: 1000, requirementType: 'seasonal_winner', requirementValue: 1 },
  { key: 'seasonal_winner_christmas', name: 'Holiday Champion', description: 'Cleared the most calls during the Christmas contest.', icon: '\uD83C\uDFC6', xpBonus: 1000, requirementType: 'seasonal_winner', requirementValue: 1 },
];

/** Welcome promo: grants 10,000 credits + 500 XP, up to 500 redemptions. */
const PROMO_SEED = [
  {
    code: 'DHQ-LAUNCH',
    label: 'Welcome Launch',
    rewards: { credits: 10000, xp: 500 },
    maxUses: 500,
  },
  {
    code: 'DHQ-E9P4-8RX7',
    label: 'Limited Bonus',
    rewards: { credits: 10000, xp: 500 },
    maxUses: 25,
  },
  {
    code: 'WELCOME-50',
    label: 'Welcome Coins',
    rewards: { coins: 50 },
    maxUses: 1000,
  },
];

export async function seedDatabase() {
  console.log('Seeding database...');

  const existing = await db.select().from(players).limit(1);
  if (existing.length === 0) {
    await db.insert(players).values({
      username: 'Commander',
      email: 'commander@dispatchhq.game',
      passwordHash: 'dev-hash-not-for-production',
      credits: 10000,
      coins: 0,
      xp: 0,
      level: 1,
      isPremium: false,
    });
    console.log('Seed data inserted: 1 player (Commander)');
  }

  const existingAchievements = await db.select({ key: achievements.key }).from(achievements);
  const existingKeys = new Set(existingAchievements.map((a) => a.key));
  const missing = ACHIEVEMENT_SEED.filter((a) => !existingKeys.has(a.key));
  if (missing.length > 0) {
    await db.insert(achievements).values(missing);
    console.log(`Seed data inserted: ${missing.length} achievements`);
  }

  // Welcome promo code — idempotent by code, so re-seeding a live DB never
  // duplicates it or resets its usage count. Players redeem it in the profile
  // panel; the founder sees claims in the Admin Console redemption log.
  const existingPromos = await db.select({ code: promoCodes.code }).from(promoCodes);
  const existingPromoCodes = new Set(existingPromos.map((p) => p.code));
  const missingPromos = PROMO_SEED.filter((p) => !existingPromoCodes.has(p.code));
  if (missingPromos.length > 0) {
    await db.insert(promoCodes).values(missingPromos.map((p) => ({
      code: p.code,
      label: p.label,
      rewards: p.rewards,
      maxUses: p.maxUses,
      usedCount: 0,
      active: true,
    })));
    console.log(`Seed data inserted: ${missingPromos.length} promo code(s)`);
  }

  // Shop catalog (v0.31.0) — idempotent by key so re-seeding never duplicates
  // a tier or pack or resets its row id (orders reference those ids).
  const existingTiers = await db.select({ key: membershipTiers.key }).from(membershipTiers);
  const tierKeys = new Set(existingTiers.map((t) => t.key));
  const missingTiers = MEMBERSHIP_TIER_SEED.filter((t) => !tierKeys.has(t.key));
  if (missingTiers.length > 0) {
    await db.insert(membershipTiers).values(missingTiers);
    console.log(`Seed data inserted: ${missingTiers.length} membership tier(s)`);
  }

  const existingPacks = await db.select({ key: coinPacks.key }).from(coinPacks);
  const packKeys = new Set(existingPacks.map((p) => p.key));
  const missingPacks = COIN_PACK_SEED.filter((p) => !packKeys.has(p.key));
  if (missingPacks.length > 0) {
    await db.insert(coinPacks).values(missingPacks);
    console.log(`Seed data inserted: ${missingPacks.length} coin pack(s)`);
  }

  console.log('Database seeding complete.');
}
