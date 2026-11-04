// ============================================
// Dispatch HQ — Unit purchase (single source of truth)
// ============================================
// Correction build: State Troopers and County Sheriffs are their own
// agencies, NOT city police. Both buy surfaces (StationsPanel and Sidebar)
// used to carry their own STATION_UNITS copies; this module is now the ONE
// buy list, the ONE jurisdiction rule, and the ONE purchase decision, so
// the two surfaces cannot drift apart again.
//
// Grandfathering: units are keyed by unit TYPE, never by the station they
// were bought at. A trooper/deputy bought at a police station before this
// correction keeps its stationId, its jurisdiction, and its dispatch alias
// (see dispatchLogic unitFulfillsRequirement) — nothing here deletes or
// moves a player's unit. Only future purchases follow the new lists.

import { UNIT_CONFIGS } from '@dispatch-hq/shared';
import type { Jurisdiction } from '@dispatch-hq/shared';

/** Units each station type may sell. Police stations sell city police only. */
export const STATION_UNITS: Record<string, string[]> = {
  fire_station: ['engine', 'ladder', 'rescue', 'battalion_chief'],
  police_station: ['patrol_car', 'swat_van', 'k9_unit', 'police_suv'],
  ems_station: ['ambulance', 'paramedic_unit', 'ems_supervisor', 'fire_ambulance'],
  trooper_station: ['trooper_car'],
  sheriff_station: ['deputy_car'],
};

/** Buy list for a station type. Unknown types sell nothing (never crash). */
export function stationUnitsFor(stationType: string): string[] {
  return STATION_UNITS[stationType] ?? [];
}

/** Jurisdiction follows the UNIT type, so a grandfathered police-station
 *  trooper/deputy keeps the jurisdiction it was bought with. */
export function jurisdictionForUnitType(unitType: string): Jurisdiction {
  if (unitType === 'trooper_car') return 'state';
  if (unitType === 'deputy_car') return 'county';
  return 'city';
}

export interface UnitPurchaseStation {
  id: string;
  unitCount?: number;
  capacity: number;
  position: { lat: number; lng: number };
}

export interface UnitPurchaseInput {
  station: UnitPurchaseStation;
  unitTypeKey: string;
  ownerId: string;
  credits: number;
  /** getUnitCostMultiplier() from techTree, passed in to keep this pure. */
  unitCostMultiplier: number;
}

export type UnitPurchaseResult =
  | {
      ok: true;
      cost: number;
      jurisdiction: Jurisdiction;
      unit: {
        id: string;
        ownerId: string;
        stationId: string;
        type: string;
        jurisdiction: Jurisdiction;
        name: string;
        status: 'available';
        position: { lat: number; lng: number };
        destination: null;
        heading: 0;
        eta: null;
        missionId: null;
        trainingLevel: 1;
        createdAt: string;
      };
    }
  | { ok: false; reason: 'unknown-unit' | 'station-full' | 'insufficient-credits'; cost: number };

/**
 * Pure purchase decision + unit draft. Callers apply the result to the
 * store (addUnit, station unitCount +1, credits − cost) and keep their own
 * surface extras (speed multiplier, crew assignment, position jitter).
 * Guard order matches the old component handlers: capacity, then credits.
 */
export function resolveUnitPurchase(input: UnitPurchaseInput): UnitPurchaseResult {
  const { station, unitTypeKey, ownerId, credits, unitCostMultiplier } = input;
  const config = (UNIT_CONFIGS as Record<string, { name: string; cost: number } | undefined>)[unitTypeKey];
  if (!config) return { ok: false, reason: 'unknown-unit', cost: 0 };
  const cost = Math.round(config.cost * unitCostMultiplier);
  if ((station.unitCount || 0) >= station.capacity) {
    return { ok: false, reason: 'station-full', cost };
  }
  if (credits < cost) {
    return { ok: false, reason: 'insufficient-credits', cost };
  }
  const jurisdiction = jurisdictionForUnitType(unitTypeKey);
  return {
    ok: true,
    cost,
    jurisdiction,
    unit: {
      id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ownerId,
      stationId: station.id,
      type: unitTypeKey,
      jurisdiction,
      name: `${config.name} ${Math.floor(Math.random() * 99)}`,
      status: 'available',
      position: { ...station.position },
      destination: null,
      heading: 0,
      eta: null,
      missionId: null,
      trainingLevel: 1,
      createdAt: new Date().toISOString(),
    },
  };
}
