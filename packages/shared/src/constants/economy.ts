// ============================================
// Dispatch HQ — Economy Constants
// ============================================

export const ECONOMY = {
  startingCredits: 10000,
  startingCoins: 0,
  
  // XP required per level
  xpPerLevel: [
    0,      // Level 1
    100,    // Level 2
    300,    // Level 3
    600,    // Level 4
    1000,   // Level 5
    1500,   // Level 6
    2200,   // Level 7
    3000,   // Level 8
    4000,   // Level 9
    5500,   // Level 10
    7500,   // Level 11
    10000,  // Level 12
    13000,  // Level 13
    17000,  // Level 14
    22000,  // Level 15
    28000,  // Level 16
    35000,  // Level 17
    45000,  // Level 18
    57000,  // Level 19
    72000,  // Level 20
  ],
  
  // Credit earning multiplier per level
  levelBonus: [
    1.0,    // Level 1
    1.05,   // Level 2
    1.10,   // Level 3
    1.15,   // Level 4
    1.20,   // Level 5
    1.25,   // Level 6
    1.30,   // Level 7
    1.35,   // Level 8
    1.40,   // Level 9
    1.50,   // Level 10
    1.55,   // Level 11
    1.60,   // Level 12
    1.65,   // Level 13
    1.70,   // Level 14
    1.75,   // Level 15
    1.80,   // Level 16
    1.85,   // Level 17
    1.90,   // Level 18
    1.95,   // Level 19
    2.00,   // Level 20
  ],
};

export const PREMIUM = {
  monthlyPrice: 999,     // $9.99 in cents
  creditMultiplier: 2,
  trainingSpeedMultiplier: 2,
  perks: ['badge', 'inbox', 'alliance_auto_respond'],
};

// Coin economy rates (v0.41.0) — shared so the client and server agree on the
// two premium-currency sinks without a round-trip.
export const COIN_SKIP_TRAINING_SECONDS_PER_COIN = 10;
export const COIN_CREDITS_RATE = { coins: 100, credits: 3500 }; // $1 ≈ 3,500 cr

/** Premium credit multiplier — ×2 when a member, else 1. */
export function premiumCreditMultiplier(isPremium: boolean): number {
  return isPremium ? PREMIUM.creditMultiplier : 1;
}

/** Premium training-speed multiplier — ×2 when a member, else 1. */
export function premiumTrainingMultiplier(isPremium: boolean): number {
  return isPremium ? PREMIUM.trainingSpeedMultiplier : 1;
}

/** Coins to finish a training session with `remainingSec` seconds left. */
export function skipTrainingCost(remainingSec: number): number {
  return Math.max(1, Math.ceil(remainingSec / COIN_SKIP_TRAINING_SECONDS_PER_COIN));
}

/** Credits a coin spend buys (100 coins → 5,000 credits). */
export function creditsForCoins(coins: number): number {
  return Math.floor((coins / COIN_CREDITS_RATE.coins) * COIN_CREDITS_RATE.credits);
}

/**
 * Level ladder helpers. Cumulative XP to reach level N is the sum of the first
 * N-1 entries of xpPerLevel. levelForXp returns the highest level whose
 * cumulative requirement is satisfied (clamped to the table ceiling); xpIntoLevel
 * returns how much XP has been earned inside the current level.
 */
export function cumulativeXpForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(level, ECONOMY.xpPerLevel.length));
  return ECONOMY.xpPerLevel.slice(0, clamped).reduce((a, b) => a + b, 0);
}

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 2; i <= ECONOMY.xpPerLevel.length; i++) {
    if (xp >= cumulativeXpForLevel(i)) level = i;
    else break;
  }
  return level;
}

export function xpIntoLevel(xp: number): number {
  return xp - cumulativeXpForLevel(levelForXp(xp) - 1);
}

export function levelBonusFor(level: number): number {
  const clamped = Math.max(1, Math.min(level, ECONOMY.levelBonus.length));
  return ECONOMY.levelBonus[clamped - 1];
}

/**
 * XP needed to advance FROM `level` TO `level + 1`. The curve table entry for
 * level L (1-based) is xpPerLevel[L]. At the top of the table (max level) there
 * is no next level — Infinity makes the advance loop stop cleanly.
 */
export function xpRequiredForNextLevel(level: number): number {
  if (level >= ECONOMY.xpPerLevel.length) return Infinity;
  return ECONOMY.xpPerLevel[level];
}

/**
 * True lifetime XP for a stored (level, remainder) pair: the curve total to
 * REACH the level plus the XP banked into it. Used by the leaderboard (server
 * sort + client display) so rankings mean something now that players.xp is a
 * remainder. The level is clamped to the table ceiling, matching the sort's
 * LEAST(level, 20) clamp so the displayed number always agrees with the order.
 */
export function lifetimeXpFor(
  level: number | null | undefined,
  xp: number | null | undefined
): number {
  return cumulativeXpForLevel(level ?? 1) + Math.max(0, xp ?? 0);
}

/**
 * Apply earned XP to a player's level and return the new (level, XP-into-level)
 * pair. This is the single source of truth for level-up math (v0.19) — the
 * client completion handler, promo redemption, and live admin-grant sync all
 * route through it so every XP path levels the same way.
 *
 * The stored `xp` field is the XP earned *into the current level* (a remainder),
 * never a lifetime total, so existing saves need no data migration: a stored
 * level stays valid, and any XP a player earned under the old flat curve is
 * realized as catch-up levels on the next XP event instead of being lost.
 */
export function advanceLevel(
  currentLevel: number,
  xpIntoCurrentLevel: number,
  earnedXp: number
): { level: number; xpIntoLevel: number } {
  // Clamp the input level too (level grants can exceed the cap) — the curve
  // table ceiling is 20 for every path, XP-driven or explicit-bump.
  let level = Math.min(
    ECONOMY.xpPerLevel.length,
    Math.max(1, Math.floor(currentLevel))
  );
  let xp = Math.max(0, xpIntoCurrentLevel) + Math.max(0, earnedXp);
  while (level < ECONOMY.xpPerLevel.length && xp >= xpRequiredForNextLevel(level)) {
    xp -= xpRequiredForNextLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: xp };
}
