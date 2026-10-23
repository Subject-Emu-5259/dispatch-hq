// ============================================
// Dispatch HQ — Chain Mission Spawner
// ============================================
// Completing a chain mission (chainId + chainStage set at spawn) triggers the
// next stage in CHAIN_DEFINITIONS at the same location, with a reward bonus
// for multi-stage sequences.

import type { Mission, ServiceType } from '@dispatch-hq/shared';
import { chainForId, nextStage, getMissionsForService } from '@dispatch-hq/shared';
import type { CityData } from '@/stores/gameStore';
import { buildMission } from './spawn';

export const CHAIN_REWARD_BONUS = 1.25;

/**
 * Reward multiplier for a chain stage: stages past the first pay 25% more.
 * Pure and shared by chainRewardBonus and the mission-reward computation
 * (lib/rewards) so the bonus rule has exactly one source of truth.
 */
export function chainBonusForStage(stage: number | null | undefined): number {
  return stage != null && stage >= 2 ? CHAIN_REWARD_BONUS : 1;
}

/** Reward multiplier for a completed mission (stages past the first pay 25% more). */
export function chainRewardBonus(m: Mission): number {
  return chainBonusForStage(m.chainStage);
}

/**
 * Spawn the stage that follows `completed` in its chain (at the completed
 * mission's location). Returns the spawned mission, or null when the mission
 * is not chained or the chain is finished.
 */
export async function spawnChainStage(
  completed: Mission,
  city: CityData | null,
  level: number,
  addMission: (m: Mission) => void,
): Promise<Mission | null> {
  if (!completed.chainId || !completed.chainStage) return null;
  const def = chainForId(completed.chainId);
  if (!def) return null;
  const stage = nextStage(def, completed.chainStage);
  if (!stage) return null;

  const template = getMissionsForService(stage.service).find((t) => t.id === stage.templateId);
  if (!template) return null;

  const mission = await buildMission(stage.service as ServiceType, city, {
    level,
    origin: completed.location,
    prefix: `${def.name}: `,
    template,
  });
  mission.chainId = def.id;
  mission.chainStage = (completed.chainStage ?? 0) + 1;
  mission.chainTotal = def.stages.length;
  addMission(mission);
  return mission;
}
