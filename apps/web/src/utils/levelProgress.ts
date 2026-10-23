// ============================================
// Dispatch HQ — Level Progress Helper
// ============================================
// Single derivation for the v0.19 XP curve displays (ProfileModal, BottomBar,
// Sidebar). player.xp is stored as the remainder INTO the current level, so the
// progress fraction is remainder / xpRequiredForNextLevel(level), which returns
// Infinity at the level-20 cap.

import { xpRequiredForNextLevel, lifetimeXpFor } from '@dispatch-hq/shared';

export interface LevelProgress {
  level: number;
  /** XP earned into the current level (the stored remainder). */
  levelXp: number;
  /** XP needed to reach the next level; Infinity at the cap. */
  xpForNext: number;
  atMaxLevel: boolean;
  /** 0–100 display percentage (100 when maxed). */
  pct: number;
}

export function levelProgress(player?: { level?: number; xp?: number } | null): LevelProgress {
  const level = player?.level ?? 1;
  const levelXp = player?.xp ?? 0; // already the into-level remainder
  const xpForNext = xpRequiredForNextLevel(level);
  const atMaxLevel = !Number.isFinite(xpForNext);
  return {
    level,
    levelXp,
    xpForNext,
    atMaxLevel,
    pct: atMaxLevel ? 100 : Math.min(100, Math.round((levelXp / xpForNext) * 100)),
  };
}

/**
 * True lifetime XP for the leaderboard: the curve total to REACH the level
 * plus the remainder into it. Shared helper (also used server-side) so the
 * player's own row compares fairly against the ranked entries.
 */
export function lifetimeXpOf(player?: { level?: number; xp?: number } | null): number {
  return lifetimeXpFor(player?.level ?? 1, player?.xp ?? 0);
}
