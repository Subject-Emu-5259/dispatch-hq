// ============================================
// Dispatch HQ — Mission Completion Rewards
// ============================================
// Pure computation of what a cleared mission pays out. Extracted from the
// game loop in App.tsx so the multiplier stack (tech, speed, chain, rank,
// mutual aid, alliance) is unit-testable and has a single home. All store
// mutations, notifications, and the alliance-XP network call stay at the call
// site — this module never touches the store.

import type { Mission, ServiceType } from '@dispatch-hq/shared';
import { allianceCommanderBonus, levelBonusFor, premiumCreditMultiplier, rankForLevel } from '@dispatch-hq/shared';
import { chainBonusForStage } from './missionChains';

/**
 * The department responsible for a mission's category (mirrors the Dispatch
 * Board). Fire handles fire + rescue + hazmat, police handles police +
 * traffic — used to split the board into your service's missions vs. Mutual
 * Aid requests from other departments.
 */
export function missionService(m: Pick<Mission, 'category'>): ServiceType {
  if (m.category === 'fire' || m.category === 'rescue' || m.category === 'hazmat') return 'fire';
  if (m.category === 'ems') return 'ems';
  return 'police'; // police + traffic
}

export interface MissionRewardInput {
  mission: Pick<
    Mission,
    | 'category'
    | 'creditsReward'
    | 'xpReward'
    | 'timeRemaining'
    | 'totalTime'
    | 'disasterId'
    | 'recovery'
    | 'chainStage'
    | 'chainSkipped'
  >;
  /** The player's level (rank bonus source). */
  playerLevel: number;
  /** The player's selected service; mutual aid only applies when non-null. */
  service: ServiceType | null;
  /** The alliance's current XP, or null when the player is not in an alliance. */
  allianceXp: number | null;
  /** Tech-tree reward multiplier (getMissionRewardMultiplier()); defaults to 1. */
  techRewardMult?: number;
  /** Station specialization reward bonus (v0.20.1); defaults to 1. */
  stationRewardMult?: number;
  /** Seasonal-event reward multiplier (v0.21.0); defaults to 1. */
  seasonalMult?: number;
  /** Premium membership credit multiplier (v0.31.0); defaults to 1. Credits only. */
  premiumMult?: number;
  /** Batch 3b: district-satisfaction reward multiplier (districtRewardMultiplier); defaults to 1. */
  districtRewardMult?: number;
  /** Batch 3b: disaster-wave stage multiplier (waveRewardMultForStage); defaults to 1. */
  waveRewardMult?: number;
  /** Batch 3d: fog-of-war exploration multiplier (fogBonusMultiplier); defaults to 1. */
  fogRewardMult?: number;
}

export interface MissionRewards {
  earnedCredits: number;
  earnedXp: number;
  /** Combined multiplier applied to base rewards (incl. the +25% mutual aid). */
  finalMult: number;
  speedBonus: number;
  chainBonus: number;
  /** Batch 3b: district-satisfaction multiplier actually applied. */
  districtMult: number;
  /** Batch 3b: disaster-wave stage multiplier actually applied. */
  waveMult: number;
  rankBonus: number;
  /** Per-level credit earning bonus (ECONOMY.levelBonus, v0.22.0) — credits only. */
  levelBonus: number;
  /** Premium membership credit multiplier (v0.31.0) — credits only. */
  premiumMult: number;
  commanderBonus: number;
  isMutualAid: boolean;
  /**
   * Alliance XP to credit: 25% of the mission's base XP (before the commander
   * bonus, so guild levels don't self-accelerate). Null when the player is
   * not in an alliance or the mission earned no XP.
   */
  allianceXp: number | null;
}

/**
 * Compute a completed mission's payouts from its fields and the player's
 * current multipliers. Pure — pass the values in, get the math out.
 *
 * Multiplier stack (v0.14–v0.22): tech reward tech (×1.25) · speed bonus
 * (1 + remaining-time ratio × 0.5, up to ×1.5) · chain bonus (×1.25 from
 * stage 2) · rank bonus (rewardBonus by rank ladder) · level bonus
 * (ECONOMY.levelBonus, ×1.0–2.0 — credits only; XP keeps the rank ladder
 * alone so progression isn't self-accelerating) · alliance commander bonus
 * (×1.0–1.2 by alliance level), then ×1.25 when the call is answered as a
 * Mutual Aid request.
 */
export function computeMissionRewards(input: MissionRewardInput): MissionRewards {
  const { mission: m, playerLevel, service, allianceXp } = input;
  const techRewardMult = input.techRewardMult ?? 1;
  const stationRewardMult = input.stationRewardMult ?? 1;
  const seasonalMult = input.seasonalMult ?? 1;
  const premiumMult = input.premiumMult ?? 1;
  const districtRewardMult = input.districtRewardMult ?? 1;
  const waveRewardMult = input.waveRewardMult ?? 1;
  const fogRewardMult = input.fogRewardMult ?? 1;

  const remainingRatio = Math.max(0, m.timeRemaining / (m.totalTime || 600));
  const speedBonus = 1 + remainingRatio * 0.5;
  const chainBonus = chainBonusForStage(m.chainStage, m.chainSkipped);
  const rankBonus = rankForLevel(playerLevel, service ?? undefined).rewardBonus;
  // The declared per-level credit earning curve (×1.0 at L1 → ×2.0 at L20).
  // Credits only — XP progression already has its own curve via the level table.
  const levelBonus = levelBonusFor(playerLevel);

  // Mutual aid: answering an organic partner-department call pays +25%.
  // Disaster waves + recovery are city-wide emergencies that already span all
  // services — they are not "mutual aid requests" and don't get the bonus.
  const isMutualAid =
    service != null &&
    !m.disasterId &&
    !m.recovery &&
    missionService(m) !== service;

  const commanderBonus = allianceXp != null ? allianceCommanderBonus(allianceXp) : 1;

  // Credits carry the level + premium bonuses; XP deliberately does not (the
  // membership accelerates credits, never progression — pay-to-accelerate, not
  // pay-to-win).
  let creditMult = techRewardMult * speedBonus * chainBonus * rankBonus * levelBonus * commanderBonus * stationRewardMult * seasonalMult * premiumMult * districtRewardMult * waveRewardMult * fogRewardMult;
  let xpMult = techRewardMult * speedBonus * chainBonus * rankBonus * commanderBonus * stationRewardMult * seasonalMult * districtRewardMult * waveRewardMult * fogRewardMult;
  if (isMutualAid) {
    creditMult *= 1.25;
    xpMult *= 1.25;
  }

  const earnedCredits = Math.round(m.creditsReward * creditMult);
  const earnedXp = Math.round(m.xpReward * xpMult);

  // Shared alliance XP rides on the pre-commander bonus stack so levels don't
  // self-accelerate as the guild levels up.
  let allianceCredit: number | null = null;
  if (allianceXp != null && earnedXp > 0) {
    const baseMissionXp = Math.round(
      m.xpReward * techRewardMult * speedBonus * chainBonus * rankBonus * (isMutualAid ? 1.25 : 1),
    );
    allianceCredit = Math.max(1, Math.round(baseMissionXp * 0.25));
  }

  return {
    earnedCredits,
    earnedXp,
    finalMult: creditMult,
    speedBonus,
    chainBonus,
    districtMult: districtRewardMult,
    waveMult: waveRewardMult,
    rankBonus,
    levelBonus,
    premiumMult,
    commanderBonus,
    isMutualAid,
    allianceXp: allianceCredit,
  };
}
