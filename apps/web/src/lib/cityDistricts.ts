// ============================================
// Dispatch HQ — City Districts + Citizen Satisfaction (Batch 3b)
// ============================================
// Feature 7 (districts unlock) + feature 10 (satisfaction per district).
// Pure — no store, no I/O — so the harness can run it as real math.
//
// Districts generalize the existing city-level pattern (cityProgression:
// Nashville unlocks at Level 4): every city has the same 8-district roster
// and each district opens at the city's unlock level plus a fixed offset,
// so a commander who keeps playing one city keeps opening new ground with
// harder, richer calls. Satisfaction is a 0..100 rating per district that
// moves with response times and feeds back into call volume (spawn
// weighting) and rewards — the city visibly reacts to performance.

import { cityUnlockLevel } from './cityProgression';

export interface DistrictDef {
  name: string;
  /** Levels above the city's own unlock level before this district opens. */
  unlockOffset: number;
  /** Flavor + spawn character. */
  trait: string;
}

export const DISTRICTS: DistrictDef[] = [
  { name: 'Downtown', unlockOffset: 0, trait: 'Dense commercial calls' },
  { name: 'Northside', unlockOffset: 2, trait: 'Residential + schools' },
  { name: 'Eastside', unlockOffset: 4, trait: 'Transit + warehouses' },
  { name: 'Southside', unlockOffset: 6, trait: 'High-volume residential' },
  { name: 'Westside', unlockOffset: 8, trait: 'Suburban sprawl' },
  { name: 'Industrial', unlockOffset: 10, trait: 'Hazmat + heavy rescue' },
  { name: 'Riverside', unlockOffset: 12, trait: 'Water rescue + floods' },
  { name: 'Uptown', unlockOffset: 14, trait: 'High-rise + late-night' },
];

/** Minimum commander level to play in `district` of `cityName`. */
export function districtUnlockLevel(cityName: string, districtName: string): number {
  const def = DISTRICTS.find((d) => d.name === districtName);
  return cityUnlockLevel(cityName) + (def?.unlockOffset ?? 0);
}

export function isDistrictUnlocked(cityName: string, districtName: string, level: number): boolean {
  return level >= districtUnlockLevel(cityName, districtName);
}

/** District names open at `level` in `cityName`, in roster order. */
export function unlockedDistricts(cityName: string, level: number): string[] {
  return DISTRICTS.filter((d) => level >= cityUnlockLevel(cityName) + d.unlockOffset).map((d) => d.name);
}

/** District names still locked at `level`, with the level that opens each. */
export function lockedDistricts(cityName: string, level: number): { name: string; unlockLevel: number }[] {
  return DISTRICTS
    .filter((d) => level < cityUnlockLevel(cityName) + d.unlockOffset)
    .map((d) => ({ name: d.name, unlockLevel: cityUnlockLevel(cityName) + d.unlockOffset }));
}

// ── Citizen satisfaction ──────────────────────────────────────────────

/** A fresh district starts neutral — neither praised nor angry. */
export const DEFAULT_SATISFACTION = 50;
export const MIN_SATISFACTION = 0;
export const MAX_SATISFACTION = 100;

/** Store/save key for one district's rating. */
export function satisfactionKey(cityName: string, districtName: string): string {
  return `${cityName}::${districtName}`;
}

export type SatisfactionRecord = Record<string, number>;

export function satisfactionFor(record: SatisfactionRecord | null | undefined, cityName: string, districtName: string): number {
  const v = record?.[satisfactionKey(cityName, districtName)];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(MIN_SATISFACTION, Math.min(MAX_SATISFACTION, v)) : DEFAULT_SATISFACTION;
}

/**
 * Rating delta for one finished call. Thresholds are on first-response
 * seconds (mission.responseTimeSeconds): fast responses build trust,
 * slow ones cost it, a failed/expired call costs the most. `failed`
 * overrides the time — a call that never got answered is judged on that,
 * not on how late it was.
 */
export function satisfactionDeltaForResponse(responseTimeSeconds: number | null | undefined, failed: boolean): number {
  if (failed) return -8;
  const t = responseTimeSeconds ?? Infinity;
  if (t <= 180) return 3;
  if (t <= 300) return 1;
  if (t <= 600) return -2;
  return -5;
}

/** Apply a delta to one district's rating, clamped 0..100. Returns a new record. */
export function applySatisfaction(
  record: SatisfactionRecord,
  cityName: string,
  districtName: string,
  delta: number,
): SatisfactionRecord {
  const next = { ...record };
  next[satisfactionKey(cityName, districtName)] = Math.max(
    MIN_SATISFACTION,
    Math.min(MAX_SATISFACTION, satisfactionFor(record, cityName, districtName) + delta),
  );
  return next;
}

/**
 * Call-volume multiplier for a district's rating: happy districts call
 * more (trust in dispatch), unhappy districts call less. 0.70 at 0,
 * 1.00 at 50, 1.25 at 100 — banded so a single call never whipsaws volume.
 */
export function callVolumeMultiplier(rating: number): number {
  if (rating >= 80) return 1.25;
  if (rating >= 60) return 1.1;
  if (rating >= 40) return 1.0;
  if (rating >= 20) return 0.85;
  return 0.7;
}

/**
 * Reward multiplier for a district's rating: 1 + (rating − 50) / 200,
 * so 0 → 0.75×, 50 → 1×, 100 → 1.25×. High-trust districts pay better
 * (grateful city, fuller cooperation); low-trust districts pay worse.
 */
export function districtRewardMultiplier(rating: number): number {
  return 1 + (rating - DEFAULT_SATISFACTION) / 200;
}

/**
 * Pick a district for an organic spawn, weighted by call volume so
 * high-satisfaction districts genuinely generate more calls. `random`
 * is injectable so the harness can drive the pick deterministically.
 */
export function pickDistrictForSpawn(
  unlocked: readonly string[],
  record: SatisfactionRecord,
  cityName: string,
  random: () => number = Math.random,
): string | null {
  if (unlocked.length === 0) return null;
  const weights = unlocked.map((d) => callVolumeMultiplier(satisfactionFor(record, cityName, d)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return unlocked[0];
  let roll = random() * total;
  for (let i = 0; i < unlocked.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return unlocked[i];
  }
  return unlocked[unlocked.length - 1];
}
