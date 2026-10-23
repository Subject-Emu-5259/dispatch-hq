// ============================================
// Dispatch HQ — Unit Training Helpers
// ============================================
// Units are recruited at training level 1. Training raises a unit's level so it
// can satisfy minTrainingLevel 2+ mission requirements (warehouse fires, hostage
// situations, mass-casualty incidents). While training, the unit stays at its
// station and is excluded from dispatch/patrol.

import type { Unit, Player } from '@dispatch-hq/shared';
import { premiumTrainingMultiplier } from '@dispatch-hq/shared';
import { useGameStore } from '@/stores/gameStore';

export const MAX_UNIT_TRAINING_LEVEL = 3;

/** Credits required to train a unit one level (scales with the current level). */
export function unitTrainCost(level: number): number {
  return 1500 + (level - 1) * 1500;
}

/**
 * Seconds a training session takes (scales with the target level). Premium
 * members train ×2 faster (v0.31.0) — the multiplier divides the base so the
 * wait never hits zero (floored at 5s).
 */
export function unitTrainDurationSec(level: number, isPremium = false): number {
  const base = 30 + (level - 1) * 20;
  return Math.max(5, Math.round(base / premiumTrainingMultiplier(isPremium)));
}

/** True while a unit is in a training session (unavailable to dispatch). */
export function isTraining(unit: Unit | undefined | null): boolean {
  return !!unit?.trainingEndsAt && unit.trainingEndsAt > Date.now();
}

/** Seconds remaining in the unit's training session, or 0 when idle. */
export function trainingRemainingSec(unit: Unit | undefined | null): number {
  if (!unit?.trainingEndsAt) return 0;
  return Math.max(0, Math.ceil((unit.trainingEndsAt - Date.now()) / 1000));
}

/** Start a training session. Returns false (with no side effects) when not allowed. */
export function startUnitTraining(unit: Unit, player: Player | null): boolean {
  if (!unit || isTraining(unit)) return false;
  if (unit.status !== 'available') return false;
  if (unit.trainingLevel >= MAX_UNIT_TRAINING_LEVEL) return false;
  if (!player) return false;

  const cost = unitTrainCost(unit.trainingLevel);
  if (player.credits < cost) return false;

  const store = useGameStore.getState();
  store.updatePlayer({ credits: player.credits - cost });
  store.updateUnit(unit.id, {
    trainingEndsAt: Date.now() + unitTrainDurationSec(unit.trainingLevel, player.isPremium) * 1000,
  });
  return true;
}

/** Complete a finished training session (called by the game tick). */
export function finishUnitTraining(unit: Unit): boolean {
  if (!unit.trainingEndsAt || unit.trainingEndsAt > Date.now()) return false;
  useGameStore.getState().updateUnit(unit.id, {
    trainingLevel: Math.min(MAX_UNIT_TRAINING_LEVEL, unit.trainingLevel + 1),
    trainingEndsAt: undefined,
  });
  return true;
}
