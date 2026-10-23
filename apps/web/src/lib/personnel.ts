// ============================================
// Dispatch HQ — Personnel Fatigue & Morale
// ============================================
// Crews get tired on long shifts and their morale sags when overworked.
// Purely computed so it's unit-testable and cheap to run from the game tick:
// `advancePersonnel` quantizes to integers so the store only rewrites a
// station when a value visibly changes (a few writes per minute, not per tick).

import type { Employee, Station, Unit } from '@dispatch-hq/shared';
import type { FatigueMode } from '@/utils/settings';

/** Fatigue per game-minute while riding a unit (full in ~33 real min of nonstop duty). */
export const FATIGUE_ASSIGNED_PER_GAME_MIN = 0.05;
/** Fatigue recovered per game-minute idle at the station. */
export const FATIGUE_REST_PER_GAME_MIN = 0.06;
/** Resting (off duty / in training) recovers twice as fast. */
export const FATIGUE_OFFDUTY_PER_GAME_MIN = 0.12;
/** Morale drains per game-minute while overworked (fatigue ≥ 70). */
export const MORALE_OVERWORK_DRAIN_PER_GAME_MIN = 0.03;
/** Morale recovers per game-minute while resting or idle. */
export const MORALE_RECOVERY_PER_GAME_MIN = 0.015;

// ── Trait-driven rate modifiers (v0.20.2) ────────────────────────────────
// Generated traits (see lib/employees) tune the simulation per employee.
// Hardened crews tire slower; Steady ones keep their cool; Energized ones
// bounce back faster.
export const TRAIT_FATIGUE_GAIN: Record<string, number> = { Hardened: 0.75 };
export const TRAIT_MORALE_DRAIN: Record<string, number> = { Steady: 0.5 };
export const TRAIT_MORALE_RECOVERY: Record<string, number> = { Energized: 1.5 };

export function fatigueGainMultiplier(traits?: string[]): number {
  return (traits ?? []).reduce((m, t) => m * (TRAIT_FATIGUE_GAIN[t] ?? 1), 1);
}

export function moraleDrainMultiplier(traits?: string[]): number {
  return (traits ?? []).reduce((m, t) => m * (TRAIT_MORALE_DRAIN[t] ?? 1), 1);
}

export function moraleRecoveryMultiplier(traits?: string[]): number {
  return (traits ?? []).reduce((m, t) => m * (TRAIT_MORALE_RECOVERY[t] ?? 1), 1);
}
/** Overwork threshold — fatigue at/above this drains morale. */
export const OVERWORK_THRESHOLD = 70;

export interface PersonnelResult {
  stations: Station[];
  changed: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function advanceEmployee(e: Employee, deltaGameMinutes: number, mode: FatigueMode): Employee {
  let fatigue = e.fatigue ?? 0;
  let morale = e.morale ?? 100;

  const fatigueMult = fatigueGainMultiplier(e.traits);
  const drainMult = moraleDrainMultiplier(e.traits);
  const recoveryMult = moraleRecoveryMultiplier(e.traits);
  // Gentle mode halves the shift-pressure rates so crews last twice as long.
  const rate = mode === 'gentle' ? 0.5 : 1;

  if (e.status === 'assigned') {
    fatigue += FATIGUE_ASSIGNED_PER_GAME_MIN * fatigueMult * rate * deltaGameMinutes;
  } else if (e.status === 'off_duty' || e.status === 'training') {
    fatigue -= FATIGUE_OFFDUTY_PER_GAME_MIN * deltaGameMinutes;
  } else {
    // available / injured: recovering or stable at the station
    fatigue -= FATIGUE_REST_PER_GAME_MIN * deltaGameMinutes;
  }

  if (fatigue >= OVERWORK_THRESHOLD) {
    morale -= MORALE_OVERWORK_DRAIN_PER_GAME_MIN * drainMult * rate * deltaGameMinutes;
  } else if (e.status !== 'assigned') {
    morale += MORALE_RECOVERY_PER_GAME_MIN * recoveryMult * deltaGameMinutes;
  }

  const next = {
    ...e,
    fatigue: clamp(Math.round(fatigue), 0, 100),
    morale: clamp(Math.round(morale), 0, 100),
  };
  return next;
}

/**
 * Advance every employee's fatigue/morale by `deltaGameMinutes` of game time.
 * `mode` is the Shift Pressure setting (v0.20.2): 'off' freezes the simulation
 * entirely (values stay put — safe to re-enable later), 'gentle' halves the
 * rates, 'full' is the complete simulation. Returns new station objects only
 * for stations whose roster changed, plus a `changed` flag so the game loop
 * can skip the store write on quiet ticks.
 */
export function advancePersonnel(
  stations: Station[],
  deltaGameMinutes: number,
  mode: FatigueMode = 'full',
): PersonnelResult {
  if (mode === 'off') return { stations, changed: false };
  let changed = false;
  const next = stations.map((station) => {
    const employees = station.employees ?? [];
    if (employees.length === 0) return station;
    let stationChanged = false;
    const nextEmployees = employees.map((e) => {
      const n = advanceEmployee(e, deltaGameMinutes, mode);
      if (n.fatigue !== e.fatigue || n.morale !== e.morale) stationChanged = true;
      return n;
    });
    if (!stationChanged) return station;
    changed = true;
    return { ...station, employees: nextEmployees };
  });
  return { stations: next, changed };
}

/** 1.0 when fresh → 0.75 when exhausted. */
export function fatigueFactor(fatigue: number): number {
  return clamp(1 - 0.0025 * fatigue, 0.75, 1);
}

/** 1.0 at full morale → 0.85 at rock bottom. */
export function moraleFactor(morale: number): number {
  return clamp(0.85 + 0.0015 * morale, 0.85, 1);
}

/** Combined effectiveness of one employee's condition. */
export function employeeEffectiveness(e: Pick<Employee, 'fatigue' | 'morale'>): number {
  return fatigueFactor(e.fatigue ?? 0) * moraleFactor(e.morale ?? 100);
}

/**
 * Mean effectiveness of a unit's crew. Units without a known crew (CPU units,
 * uncrewed) are unaffected — default 1. With `mode === 'off'` the shift-pressure
 * mechanic is fully disabled: effectiveness is always 1 regardless of stored
 * fatigue (which is left untouched so re-enabling resumes where it left off).
 */
export function crewEffectiveness(
  employees: Pick<Employee, 'id' | 'fatigue' | 'morale'>[],
  unit: Pick<Unit, 'crewIds'>,
  mode: FatigueMode = 'full',
): number {
  if (mode === 'off') return 1;
  const ids = unit.crewIds ?? [];
  if (ids.length === 0) return 1;
  const crew = employees.filter((e) => ids.includes(e.id));
  if (crew.length === 0) return 1;
  const total = crew.reduce((sum, e) => sum + employeeEffectiveness(e), 0);
  return total / crew.length;
}

/** Resolve a station's roster for a unit stationed there (fallback 1). */
export function stationCrewEffectiveness(
  stations: Station[],
  unit: Pick<Unit, 'stationId' | 'crewIds'>,
  mode: FatigueMode = 'full',
): number {
  const station = stations.find((s) => s.id === unit.stationId);
  return crewEffectiveness(station?.employees ?? [], unit, mode);
}

export interface CrewReadiness {
  /** Driven by the worst (most fatigued) member — that is who fails first. */
  level: 'fresh' | 'weary' | 'tired' | 'exhausted';
  label: string;
  worstFatigue: number;
  avgEffectiveness: number;
}

/**
 * One number for the unit HUD: the crew's readiness chip level (worst member
 * drives it) plus mean effectiveness. Null when the crew is empty — the HUD
 * falls back to "no crew".
 */
export function crewReadiness(crew: Pick<Employee, 'fatigue' | 'morale'>[]): CrewReadiness | null {
  if (crew.length === 0) return null;
  const worstFatigue = Math.max(...crew.map((e) => e.fatigue ?? 0));
  const avgEffectiveness =
    crew.reduce((sum, e) => sum + employeeEffectiveness(e), 0) / crew.length;
  const level =
    worstFatigue >= 85 ? 'exhausted'
    : worstFatigue >= 60 ? 'tired'
    : worstFatigue >= 30 ? 'weary'
    : 'fresh';
  return { level, label: fatigueLabel(worstFatigue), worstFatigue, avgEffectiveness };
}

export function fatigueLabel(fatigue: number): string {
  if (fatigue >= 85) return 'Exhausted';
  if (fatigue >= 60) return 'Tired';
  if (fatigue >= 30) return 'Weary';
  return 'Fresh';
}

export function moraleLabel(morale: number): string {
  if (morale >= 75) return 'High';
  if (morale >= 45) return 'Steady';
  if (morale >= 20) return 'Low';
  return 'Rock Bottom';
}
