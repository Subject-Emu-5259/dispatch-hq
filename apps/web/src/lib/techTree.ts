// ============================================
// Dispatch HQ — Tech Tree runtime modifiers
// Reads purchased technologies from the game store and returns live multipliers.
// Pure data lives in ./techData so the store can import it without cycles.
// ============================================

import { useGameStore } from '@/stores/gameStore';
import { STATION_CONFIGS, stationServiceFor, partnerStationDiscountForLevel, MAX_UNIT_SPEED_MPH } from '@dispatch-hq/shared';
import type { ServiceType } from '@dispatch-hq/shared';
import { loadSettings } from '@/utils/settings';
import { type TechNode, type TechEffectKey, TECH_TREE, TECH_BY_ID, BRANCH_CONFIG } from './techData';
import { getCityTrait } from './cityTraits';
import { batch3eClearMultiplier, droneClearMultiplier } from './batch3e';

export type { TechNode, TechEffectKey, TechBranch } from './techData';
export { TECH_TREE, TECH_BY_ID, BRANCH_CONFIG };

function hasTech(id: string): boolean {
  return useGameStore.getState().techPurchased.has(id);
}

export function isTechUnlocked(tech: TechNode, purchased: Set<string>): boolean {
  if (!tech.requires || tech.requires.length === 0) return true;
  return tech.requires.every((r) => purchased.has(r));
}

/** Travel duration after response-speed, training techs, and city trait. */
export function getTravelTimeMultiplier(): number {
  let mult = 1;
  if (hasTech('r1')) mult *= 0.85;
  if (hasTech('r2')) mult *= 0.80;
  if (hasTech('tr1')) mult *= 0.90;
  // City trait (v0.35.0): Paris narrow streets + congestion = 12% slower travel
  const city = useGameStore.getState().selectedCity;
  const trait = getCityTrait(city?.name);
  if (trait?.modifiers.travelTimeMultiplier) mult *= trait.modifiers.travelTimeMultiplier;
  return Math.max(0.4, mult);
}

/** Store an ETA that respects travel techs + city trait + response time delta. */
export function applyTravelTech(durationSec: number): number {
  const city = useGameStore.getState().selectedCity;
  const trait = getCityTrait(city?.name);
  const responseDelta = trait?.modifiers.responseTimeDelta ?? 0;
  return Math.max(1, Math.round(durationSec * getTravelTimeMultiplier() + responseDelta));
}

/** Mission reward multiplier (e3). */
export function getMissionRewardMultiplier(): number {
  return hasTech('e3') ? 1.25 : 1;
}

/**
 * True maximum speed a unit can reach in-game (mph). Raw config speeds
 * (m/s → ~25–40 mph) understate real travel: en-route movement is ETA-based
 * and the ETA decays at the game-speed setting while response-speed/travel
 * tech shortens it further — effectively the spec speed × gameSpeed × tech
 * speed-up. Clamped at the shared 150 mph cap so the UI never quotes a number
 * the simulation can't produce.
 */
export function getUnitMaxSpeedMph(baseSpeedMs: number): number {
  const speedMs = Math.max(0, baseSpeedMs || 13.9);
  const gameSpeed = loadSettings().gameSpeed || 1;
  const techMult = 1 / getTravelTimeMultiplier(); // up to ~1.63×
  return Math.min(MAX_UNIT_SPEED_MPH, Math.round(speedMs * 2.23694 * gameSpeed * techMult));
}

/**
 * Current displayed speed (mph), clamped to the unit's effective max so the
 * HUD never reads above the rated cap shown beside it (v0.28.0). En-route
 * movement is ETA-based and its derived speed can momentarily overshoot the
 * raw spec, which previously produced reads like "52 mph / max 51 mph" on the
 * unit panel and fleet card. Same semantics as before otherwise: idle units
 * quote their spec, everything else quotes currentSpeed.
 */
export function getUnitCurrentSpeedMph(unit: { speed?: number; currentSpeed?: number; status?: string }): number {
  const maxMph = getUnitMaxSpeedMph(unit.speed || 13.9);
  const raw = unit.status === 'available'
    ? (unit.speed || 13.9) * 2.23694
    : (unit.currentSpeed || 0) * 2.23694;
  return Math.min(maxMph, Math.round(raw));
}

/** Purchase cost multiplier for new units (e1). */
export function getUnitCostMultiplier(): number {
  return hasTech('e1') ? 0.85 : 1;
}

/** Station build / upgrade cost multiplier (e2). */
export function getStationBuildCostMultiplier(): number {
  return hasTech('e2') ? 0.80 : 1;
}

/**
 * Effective cost to BUILD a station (v0.22.2). The e2 tech discount applies to
 * builds too — matching Construction Grants' declared description — and
 * partner (cross-service) stations stack the level-gated Mutual Aid discount.
 */
export function getStationBuildCost(
  stationType: string,
  selectedService: ServiceType | null,
  playerLevel: number,
): number {
  const config = STATION_CONFIGS[stationType];
  if (!config) return 0;
  const techMult = getStationBuildCostMultiplier();
  const isPartner = selectedService != null && stationServiceFor(stationType) !== selectedService;
  const partnerMult = isPartner ? 1 - partnerStationDiscountForLevel(playerLevel) : 1;
  return Math.round(config.baseCost * techMult * partnerMult);
}

/** Upper bound for units dispatched at once (r3 unlocks 3, otherwise 1). */
export function getMaxDispatchUnits(): number {
  return hasTech('r3') ? 3 : 1;
}

/** Patrol unit sight radius in degrees (about 1.1km base). */
export function getPatrolSightRadiusDegrees(): number {
  return hasTech('t3') ? 0.016 : 0.011;
}

/** Fog of war reveal multiplier (t2). Accepts purchased set for reactive callers. */
export function getFogRevealMultiplier(purchased?: Set<string>): number {
  const set = purchased ?? useGameStore.getState().techPurchased;
  return set.has('t2') ? 1.4 : 1;
}

/** Base unit effectiveness multiplier from training. */
export function getUnitEffectivenessMultiplier(): number {
  return hasTech('tr1') ? 1.10 : 1;
}

/** Elite stat boost for newly purchased units. */
export function getEliteStatMultiplier(): number {
  return hasTech('tr3') ? 1.20 : 1;
}

/** Infer a unit's primary emergency service from its type. */
export function unitServiceForType(type: string): 'fire' | 'police' | 'ems' {
  if (type.includes('engine') || type.includes('ladder') || type.includes('rescue') || type.includes('battalion') || type.includes('fire_ambulance')) return 'fire';
  if (type.includes('ambulance') || type.includes('paramedic') || type.includes('medic')) return 'ems';
  return 'police';
}

/** Specialization boost when unit service matches mission category. */
export function getSpecializationMultiplier(unitType: string, missionCategory?: string): number {
  if (!hasTech('tr2') || !missionCategory) return 1;
  return unitServiceForType(unitType) === missionCategory ? 1.15 : 1;
}

/** Scene-clear speed multiplier considering all training techs. */
export function getClearSpeedMultiplier(unitType: string, missionCategory?: string): number {
  let mult = getUnitEffectivenessMultiplier();
  mult *= getSpecializationMultiplier(unitType, missionCategory);
  if (hasTech('tr3')) mult *= 1.20;
  // Batch 3e operations branch: drone recon (all calls), hazmat team
  // (hazmat calls), K9 unit (police calls) — see lib/batch3e.
  mult *= batch3eClearMultiplier(missionCategory, useGameStore.getState().techPurchased);
  return Math.max(0.5, mult);
}

/** Batch 3e: scene size-up multiplier from drone recon (1.25 when owned). */
export function getSceneSizeUpMultiplier(): number {
  return droneClearMultiplier(useGameStore.getState().techPurchased);
}

export function getPurchasedTechs(): Set<string> {
  return useGameStore.getState().techPurchased;
}
