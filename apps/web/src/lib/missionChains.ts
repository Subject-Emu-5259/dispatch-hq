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
 * A skipped chain pays no bonus at any stage — the bonus is the reward for
 * running the chain clean, and a skip breaks it (see skipChainStage).
 * Pure and shared by chainRewardBonus and the mission-reward computation
 * (lib/rewards) so the bonus rule has exactly one source of truth.
 */
export function chainBonusForStage(stage: number | null | undefined, chainSkipped?: boolean): number {
  if (chainSkipped) return 1;
  return stage != null && stage >= 2 ? CHAIN_REWARD_BONUS : 1;
}

/** Reward multiplier for a completed mission (stages past the first pay 25% more; none when the chain was skipped). */
export function chainRewardBonus(m: Mission): number {
  return chainBonusForStage(m.chainStage, m.chainSkipped);
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
  // A broken chain stays broken: once any stage was skipped, every later
  // stage inherits the marker and pays no bonus (chainBonusForStage).
  if (completed.chainSkipped) mission.chainSkipped = true;
  addMission(mission);
  return mission;
}

export interface ChainSkipResult {
  /** True when a chain stage was actually skipped. */
  skipped: boolean;
  /** The next stage mission, or null when the skipped stage was the last. */
  next: Mission | null;
  /** True when skipping ended the chain (skipped stage was the final one). */
  chainEnded: boolean;
}

/**
 * Skip the current stage of a chain mission: remove it from the board and
 * spawn the next stage via spawnChainStage. The skipped stage earns no
 * reward (the skip never runs the completion hook), and the chain loses its
 * 1.25x bonus for all remaining stages — the next stage is spawned from a
 * chainSkipped-marked mission, so the marker propagates forward. Skipping
 * the final stage ends the chain. Service-agnostic: chains span fire,
 * police, and EMS, and the skip treats them all the same.
 */
export async function skipChainStage(
  current: Mission,
  city: CityData | null,
  level: number,
  addMission: (m: Mission) => void,
  removeMission: (id: string) => void,
): Promise<ChainSkipResult> {
  if (!current.chainId || !current.chainStage) {
    return { skipped: false, next: null, chainEnded: false };
  }
  removeMission(current.id);
  const next = await spawnChainStage({ ...current, chainSkipped: true }, city, level, addMission);
  return { skipped: true, next, chainEnded: next === null };
}
