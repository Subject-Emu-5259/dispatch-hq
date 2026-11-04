// Correction build: troopers and sheriffs are their own agencies, NOT city
// police. Proves with real behavior (not code presence): the police buy
// list excludes both, each agency station sells only its own units, buying
// through the shared purchase decision deducts credits + assigns the unit
// with the right jurisdiction, and grandfathered police-station troopers
// still dispatch.
import { describe, it, expect } from 'vitest';
import { STATION_CONFIGS, stationServiceFor } from '@dispatch-hq/shared';
import { serviceForStationType } from './stationCustom';
import {
  STATION_UNITS,
  stationUnitsFor,
  jurisdictionForUnitType,
  resolveUnitPurchase,
} from './unitPurchase';
import { unitFulfillsRequirement } from './dispatchLogic';
import { useGameStore } from '@/stores/gameStore';
import type { Station, Unit, Player } from '@dispatch-hq/shared';

const station = (over: Partial<Station>): Station => ({
  id: 'st-1',
  ownerId: 'p1',
  type: 'trooper_station',
  level: 1,
  name: 'Test Post',
  position: { lat: 35.0, lng: -90.0 },
  capacity: 3,
  unitCount: 0,
  coverageRadius: 1000,
  createdAt: new Date().toISOString(),
  ...over,
});

const player = (credits: number): Player =>
  ({ id: 'p1', credits } as Player);

describe('agency stations', () => {
  it('registers five station types with agency configs', () => {
    expect(Object.keys(STATION_CONFIGS)).toHaveLength(5);
    expect(STATION_CONFIGS.trooper_station).toMatchObject({
      name: 'State Trooper Post',
      baseCost: 4500,
      baseCapacity: 3,
      maxLevel: 5,
    });
    expect(STATION_CONFIGS.sheriff_station).toMatchObject({
      name: "County Sheriff's Office",
      baseCost: 4000,
      baseCapacity: 4,
      maxLevel: 5,
    });
  });

  it('maps both agency stations to the police service family', () => {
    expect(stationServiceFor('trooper_station')).toBe('police');
    expect(stationServiceFor('sheriff_station')).toBe('police');
    expect(serviceForStationType('trooper_station')).toBe('police');
    expect(serviceForStationType('sheriff_station')).toBe('police');
  });

  it('police stations sell city police only; agency stations sell only their own', () => {
    expect(STATION_UNITS.police_station).not.toContain('trooper_car');
    expect(STATION_UNITS.police_station).not.toContain('deputy_car');
    expect(stationUnitsFor('police_station')).toEqual([
      'patrol_car',
      'swat_van',
      'k9_unit',
      'police_suv',
    ]);
    expect(stationUnitsFor('trooper_station')).toEqual(['trooper_car']);
    expect(stationUnitsFor('sheriff_station')).toEqual(['deputy_car']);
    expect(stationUnitsFor('nope_station')).toEqual([]);
  });

  it('jurisdiction follows the unit type (grandfather-safe)', () => {
    expect(jurisdictionForUnitType('trooper_car')).toBe('state');
    expect(jurisdictionForUnitType('deputy_car')).toBe('county');
    expect(jurisdictionForUnitType('patrol_car')).toBe('city');
    expect(jurisdictionForUnitType('engine')).toBe('city');
  });

  it('buying a trooper car from a trooper station: cost, assignment, jurisdiction', () => {
    const r = resolveUnitPurchase({
      station: station({}),
      unitTypeKey: 'trooper_car',
      ownerId: 'p1',
      credits: 10000,
      unitCostMultiplier: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.cost).toBe(3200);
    expect(r.jurisdiction).toBe('state');
    expect(r.unit.stationId).toBe('st-1');
    expect(r.unit.type).toBe('trooper_car');
    expect(r.unit.status).toBe('available');
  });

  it('buying a deputy car from a sheriff station: cost, assignment, jurisdiction', () => {
    const r = resolveUnitPurchase({
      station: station({ id: 'st-2', type: 'sheriff_station', capacity: 4 }),
      unitTypeKey: 'deputy_car',
      ownerId: 'p1',
      credits: 10000,
      unitCostMultiplier: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.cost).toBe(1800);
    expect(r.jurisdiction).toBe('county');
    expect(r.unit.stationId).toBe('st-2');
  });

  it('purchase guards: full station, insufficient credits, unknown unit', () => {
    const base = {
      unitTypeKey: 'trooper_car',
      ownerId: 'p1',
      credits: 10000,
      unitCostMultiplier: 1,
    };
    expect(
      resolveUnitPurchase({ ...base, station: station({ unitCount: 3 }) }),
    ).toMatchObject({ ok: false, reason: 'station-full' });
    expect(
      resolveUnitPurchase({ ...base, station: station({}), credits: 3199 }),
    ).toMatchObject({ ok: false, reason: 'insufficient-credits' });
    expect(
      resolveUnitPurchase({ ...base, station: station({}), unitTypeKey: 'nope' }),
    ).toMatchObject({ ok: false, reason: 'unknown-unit' });
  });

  it('end to end through the real store: credits deducted, unit assigned, jurisdiction set', () => {
    const st = station({});
    useGameStore.setState({
      player: player(10000),
      stations: [st],
      units: [] as Unit[],
    });
    const store = useGameStore.getState();
    const result = resolveUnitPurchase({
      station: st,
      unitTypeKey: 'trooper_car',
      ownerId: 'p1',
      credits: store.player!.credits,
      unitCostMultiplier: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    // Same application sequence both buy surfaces perform.
    store.addUnit(result.unit as Unit);
    store.updateStation(st.id, { unitCount: (st.unitCount || 0) + 1 });
    store.updatePlayer({ credits: store.player!.credits - result.cost });
    const after = useGameStore.getState();
    expect(after.player!.credits).toBe(6800);
    expect(after.units).toHaveLength(1);
    expect(after.units[0].type).toBe('trooper_car');
    expect(after.units[0].stationId).toBe('st-1');
    expect(after.units[0].jurisdiction).toBe('state');
    expect(after.stations[0].unitCount).toBe(1);
  });

  it('grandfathered police-station trooper/deputy still satisfy patrol requirements', () => {
    const mission = { requirements: [{ unitType: 'patrol_car' }] } as never;
    expect(unitFulfillsRequirement('trooper_car', mission)).toBe(true);
    expect(unitFulfillsRequirement('deputy_car', mission)).toBe(true);
    // …and the jurisdiction rule never depended on the station, so the
    // grandfathered unit keeps the jurisdiction it was bought with.
    expect(jurisdictionForUnitType('trooper_car')).toBe('state');
    expect(jurisdictionForUnitType('deputy_car')).toBe('county');
  });
});
