// STAGED batch harness — real behavior, not presence checks.
// Covers: charge statutes (all 30 CRIMES rows, charge-driven sentencing),
// jail occupancy (transferred excluded), spawn gates (level/loadout,
// stacking), trooper/deputy configs + requirement alias, city registry,
// CAD tab registry.
import { describe, it, expect } from 'vitest';
import { CHARGE_STATUTES, statuteForCharge, topStatuteForCharges, sentenceAndBailForCharges } from './chargeStatutes';
import { jailOccupancy } from './jailCapacity';
import { canFieldTemplate, stackingShift, MISSION_STACK_MIN_KM } from './spawn';
import { unitFulfillsRequirement } from './dispatchLogic';
import { UNIT_CONFIGS, POLICE_MISSIONS, getMissionsForService } from '@dispatch-hq/shared';
import { CORE_TABS, SERVICE_TABS, visibleTabsFor } from '../components/dispatch-center/tabs';
import { CITY_ACCESS } from './cityProgression';
import { CITY_STREET_POOLS } from '../data/cityStreetData';

describe('charge statutes', () => {
  it('covers exactly the 30 CRIMES strings, one code each, codes are game-only', () => {
    expect(CHARGE_STATUTES).toHaveLength(30);
    const codes = new Set(CHARGE_STATUTES.map((s) => s.code));
    expect(codes.size).toBe(30);
    for (const s of CHARGE_STATUTES) expect(s.code).toMatch(/^DHQ-\d+$/);
  });
  it('sentence/bail derive from the charge, not just risk: violent petty theft < violent robbery', () => {
    const petty = sentenceAndBailForCharges(['Petty theft'], 'violent', 0.5)!;
    const robbery = sentenceAndBailForCharges(['Robbery'], 'violent', 0.5)!;
    expect(robbery.sentenceDays).toBeGreaterThan(petty.sentenceDays);
    expect(robbery.bailAmount).toBeGreaterThan(petty.bailAmount);
  });
  it('top charge wins: infraction + felony picks the felony row', () => {
    expect(topStatuteForCharges(['Public intoxication', 'Robbery'])?.charge).toBe('Robbery');
  });
  it('unknown charges fall back (null) so booking never breaks', () => {
    expect(sentenceAndBailForCharges(['Made-up charge'], 'low')).toBeNull();
    expect(statuteForCharge('Made-up charge')).toBeUndefined();
  });
  it('risk moves the value inside the range, never outside it', () => {
    const low = sentenceAndBailForCharges(['DUI'], 'low', 0)!;
    const high = sentenceAndBailForCharges(['DUI'], 'violent', 1)!;
    expect(low.sentenceDays).toBeGreaterThanOrEqual(30);
    expect(high.sentenceDays).toBeLessThanOrEqual(365);
    expect(high.sentenceDays).toBeGreaterThanOrEqual(low.sentenceDays);
  });
});

describe('jail occupancy', () => {
  it('excludes released AND transferred inmates (transferred used to occupy cells forever)', () => {
    expect(jailOccupancy([
      { status: 'held' }, { status: 'booking' }, { status: 'released' }, { status: 'transferred' },
    ])).toBe(2);
  });
});

describe('spawn gates', () => {
  const units = [
    { type: 'patrol_car', trainingLevel: 1 },
    { type: 'trooper_car', trainingLevel: 2 },
  ] as any;
  it('level-1 player cannot field a difficulty-9 hostage call', () => {
    const hostage = getMissionsForService('police').find((t) => t.id === 'hostage_situation')!;
    expect(canFieldTemplate(hostage, units, 1)).toBe(false);
  });
  it('level-10 player with patrol + trooper fields a trooper template', () => {
    const t = getMissionsForService('police').find((x) => x.id === 'highway_pursuit')!;
    expect(canFieldTemplate(t, units, 10)).toBe(true);
  });
  it('stacking shift moves a colliding point, leaves a clear point alone', () => {
    const live = [{ lat: 35.1, lng: -90.0 }];
    const same = { lat: 35.1, lng: -90.0 };
    const moved = stackingShift(same, live);
    expect(moved).not.toEqual(same);
    expect(stackingShift({ lat: 36.0, lng: -91.0 }, live)).toEqual({ lat: 36.0, lng: -91.0 });
    expect(MISSION_STACK_MIN_KM).toBe(0.1);
  });
});

describe('trooper / deputy', () => {
  it('configs exist with police-service speeds and unlock levels', () => {
    expect(UNIT_CONFIGS.trooper_car.unlockLevel).toBe(6);
    expect(UNIT_CONFIGS.deputy_car.unlockLevel).toBe(2);
    expect(UNIT_CONFIGS.trooper_car.speed).toBeGreaterThan(UNIT_CONFIGS.patrol_car.speed);
  });
  it('new templates exist and name the new unit types', () => {
    for (const id of ['highway_pursuit', 'commercial_vehicle_stop', 'county_warrant_service', 'county_patrol_call']) {
      const t = POLICE_MISSIONS.find((x) => x.id === id);
      expect(t).toBeDefined();
    }
    expect(POLICE_MISSIONS.find((x) => x.id === 'highway_pursuit')!.requirements[0].unitType).toBe('trooper_car');
  });
  it('trooper/deputy satisfy patrol_car requirements, never swat/k9', () => {
    const mission = { requirements: [{ unitType: 'patrol_car', count: 1, minTrainingLevel: 1 }] } as any;
    expect(unitFulfillsRequirement('trooper_car', mission)).toBe(true);
    expect(unitFulfillsRequirement('deputy_car', mission)).toBe(true);
    const swat = { requirements: [{ unitType: 'swat_van', count: 1, minTrainingLevel: 1 }] } as any;
    expect(unitFulfillsRequirement('trooper_car', swat)).toBe(false);
  });
});

describe('cities', () => {
  it('four new cities gated inside the L20 cap, with street pools', () => {
    expect(CITY_ACCESS['St. Louis, MO'].minLevel).toBe(7);
    expect(CITY_ACCESS['Dallas, TX'].minLevel).toBe(9);
    expect(CITY_ACCESS['Atlanta, GA'].minLevel).toBe(13);
    expect(CITY_ACCESS['Seattle, WA'].minLevel).toBe(17);
    for (const key of ['st. louis', 'dallas', 'atlanta', 'seattle']) {
      const pool = (CITY_STREET_POOLS as any)[key];
      expect(pool).toBeDefined();
      expect(pool.fallbackStreets.length).toBeGreaterThan(0);
      expect(Object.keys(pool.zoneStreets)).toContain('c');
    }
  });
});

describe('CAD tab registry', () => {
  it('police sees records + jail, ems sees hospital, fire sees marshal, null sees all', () => {
    expect(visibleTabsFor('police')).toContain('jail');
    expect(visibleTabsFor('ems')).toContain('hospital');
    expect(visibleTabsFor('fire')).toContain('marshal');
    expect(visibleTabsFor(null)).toContain('records');
    expect(CORE_TABS).toContain('calls');
    expect(SERVICE_TABS.police).toContain('records');
  });
});
