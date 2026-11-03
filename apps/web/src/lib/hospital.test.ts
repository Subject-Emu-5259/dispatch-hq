import { describe, expect, it, vi } from 'vitest';
// The staffing-decay path reads the Shift Pressure setting; stub the server
// write so saveSettings() never touches the network in tests.
vi.mock('@/lib/apiClient', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/apiClient')>();
  return {
    ...mod,
    getSettings: vi.fn(async () => ({ success: true, settings: null })),
    updateSettings: vi.fn(async () => ({ success: true, settings: {} })),
  };
});
import { saveSettings } from '@/utils/settings';
import { getCityBoundary, isPointInBoundary } from '@/data/cityBoundaries';
import {
  makeHospital, makeHelipad, hospitalOccupancy, patientOutcomesForShift,
  isAirborneTransport,
  erStaffing, erStaffFatigue, staffDecayFraction, effectiveBeds, hospitalBedBonus, atCapacity, traumaCenterFor,
  HOSPITAL_BEDS, HOSPITAL_BUILD_COST, HELIPAD_BUILD_COST, BASE_ER_STAFF, MAX_ER_STAFF_BONUS,
  TRANSPORT_TIMEOUT_MS, AIR_TRANSPORT_TIMEOUT_MS, AIR_SPEED_MS,
  wardLevel, wardUpgradeCost, applyWardUpgrade,
  WARD_BEDS_PER_LEVEL, HOSPITAL_WARD_MAX_LEVEL, WARD_UPGRADE_COSTS,
  STAFF_FATIGUE_PER_GAME_MIN, STAFF_OVERWORK_THRESHOLD,
  NURSE_ROTATION_COST, applyNurseRotation,
} from './hospital';

const MEMPHIS = {
  name: 'Memphis',
  lat: 35.1495,
  lng: -90.049,
  bounds: [[35.05, -90.12], [35.25, -89.96]] as [[number, number], [number, number]],
};

const WEST_MEMPHIS = {
  name: 'West Memphis',
  lat: 35.1461,
  lng: -90.1845,
  bounds: [[35.11, -90.23], [35.19, -90.13]] as [[number, number], [number, number]],
};

describe('makeHospital (player-placed ER)', () => {
  const spot = { lat: 35.145, lng: -90.18 };

  it('sits exactly where the commander placed it', () => {
    const hospital = makeHospital(WEST_MEMPHIS, spot)!;
    expect(hospital.position).toEqual(spot);
    expect(hospital.id).toBe('hospital_west_memphis');
    expect(hospital.name).toBe('West Memphis General Hospital');
  });

  it('names the hospital per city', () => {
    expect(makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 }).name).toBe('Memphis General Hospital');
    expect(makeHospital(WEST_MEMPHIS, spot).name).toBe('West Memphis General Hospital');
  });

  it('handles a missing city gracefully', () => {
    const hospital = makeHospital(null, spot)!;
    expect(hospital.id).toBe('hospital_city');
    expect(hospital.name).toBe('City General Hospital');
  });

  it('carries the standard bed count and a sane transport window', () => {
    const hospital = makeHospital(MEMPHIS, spot)!;
    expect(hospital.beds).toBe(HOSPITAL_BEDS);
    expect(TRANSPORT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AIR_TRANSPORT_TIMEOUT_MS).toBeGreaterThan(0);
    // v0.22.x two-leg flight: scene → helipad → hospital ER is MORE road to
    // cover than a single road transport, so the air window is deliberately
    // the longer one (the old 'air is shorter' assumption predates the
    // hospital leg).
    expect(AIR_TRANSPORT_TIMEOUT_MS).toBeGreaterThan(TRANSPORT_TIMEOUT_MS);
    expect(AIR_SPEED_MS).toBeGreaterThan(20); // airlift is clearly faster than road
  });
});

describe('ward expansion — credits-bought base beds (v0.22.16)', () => {
  const spot = { lat: 35.145, lng: -90.18 };

  it('starts a fresh hospital at ward level 0 with the base 40 beds', () => {
    const hospital = makeHospital(WEST_MEMPHIS, spot)!;
    expect(hospital.beds).toBe(HOSPITAL_BEDS);
    expect(wardLevel(hospital)).toBe(0);
  });

  it('prices the first upgrade from the cost table and escalates', () => {
    const hospital = makeHospital(WEST_MEMPHIS, spot)!;
    expect(wardUpgradeCost(hospital)).toBe(WARD_UPGRADE_COSTS[0]);
    expect(wardUpgradeCost({ beds: 50, wardLevel: 1 } as never)).toBe(WARD_UPGRADE_COSTS[1]);
    expect(wardUpgradeCost({ beds: 60, wardLevel: 2 } as never)).toBe(WARD_UPGRADE_COSTS[2]);
  });

  it('applies an upgrade: +10 beds, +1 level, same site', () => {
    const hospital = makeHospital(WEST_MEMPHIS, spot)!;
    const upgraded = applyWardUpgrade(hospital)!;
    expect(upgraded.beds).toBe(HOSPITAL_BEDS + WARD_BEDS_PER_LEVEL);
    expect(wardLevel(upgraded)).toBe(1);
    expect(upgraded.id).toBe(hospital.id);
    expect(upgraded.position).toEqual(hospital.position);
  });

  it('handles old saves without a wardLevel field as level 0', () => {
    const legacy = { id: 'hospital_west_memphis', name: 'West Memphis General Hospital', position: spot, beds: 40 } as never;
    expect(wardLevel(legacy)).toBe(0);
    expect(wardUpgradeCost(legacy)).toBe(WARD_UPGRADE_COSTS[0]);
    const upgraded = applyWardUpgrade(legacy)!;
    expect(upgraded.beds).toBe(40 + WARD_BEDS_PER_LEVEL);
    expect(wardLevel(upgraded)).toBe(1);
  });

  it('returns null cost and no-ops once the ward is fully expanded', () => {
    const full = { beds: HOSPITAL_BEDS + HOSPITAL_WARD_MAX_LEVEL * WARD_BEDS_PER_LEVEL, wardLevel: HOSPITAL_WARD_MAX_LEVEL };
    expect(wardUpgradeCost(full)).toBeNull();
    expect(applyWardUpgrade(full as never)).toBe(full);
  });

  it('stacks upgraded base beds with the shift staffing bonus', () => {
    // Lv-2 ward (60 base) + 5 EMS clears (2 base nurses + 5 = 7) → 67 beds.
    const hospital = { beds: HOSPITAL_BEDS + 2 * WARD_BEDS_PER_LEVEL, wardLevel: 2 } as never;
    expect(effectiveBeds(hospital, { emsCleared: 5 })).toBe(HOSPITAL_BEDS + 2 * WARD_BEDS_PER_LEVEL + 7);
  });
});

describe('makeHelipad (player-placed landing zone, v0.22.12)', () => {
  const spot = { lat: 35.16, lng: -90.15 };

  it('sits exactly where the commander placed it', () => {
    const pad = makeHelipad(WEST_MEMPHIS, spot)!;
    expect(pad.position).toEqual(spot);
    expect(pad.id).toBe('helipad_west_memphis');
    expect(pad.name).toBe('West Memphis Air Ambulance Helipad');
  });

  it('names the helipad per city and handles a missing city', () => {
    expect(makeHelipad(MEMPHIS, spot).name).toBe('Memphis Air Ambulance Helipad');
    expect(makeHelipad(null, spot).id).toBe('helipad_city');
    expect(makeHelipad(null, spot).name).toBe('City Air Ambulance Helipad');
  });

  it('is an independent build with its own cost', () => {
    expect(HELIPAD_BUILD_COST).toBeGreaterThan(0);
    expect(HELIPAD_BUILD_COST).toBeLessThan(HOSPITAL_BUILD_COST);
  });
});

describe('hospitalOccupancy', () => {
  it('counts only non-discharged patients', () => {
    expect(hospitalOccupancy([
      { status: 'admitted' },
      { status: 'treated' },
      { status: 'discharged' },
      { status: 'admitted' },
    ])).toBe(3);
  });
});

describe('patientOutcomesForShift', () => {
  const T0 = 1_000_000;
  const p = (over: Partial<{ status: string; admitTime: number; treatedAt: number; dischargedAt: number; diverted: boolean; transportMode: 'air' | 'road' }>) => ({
    status: 'admitted' as const,
    admitTime: T0,
    treatedAt: undefined as number | undefined,
    dischargedAt: undefined as number | undefined,
    diverted: undefined as boolean | undefined,
    transportMode: undefined as 'air' | 'road' | undefined,
    ...over,
  });

  it('counts transported, treated, recovered, and released within the shift', () => {
    const patients = [
      p({ status: 'discharged', admitTime: T0 + 1, treatedAt: T0 + 2, dischargedAt: T0 + 3 }), // recovered
      p({ status: 'discharged', admitTime: T0 + 1, dischargedAt: T0 + 4 }),                    // released early
      p({ status: 'treated', admitTime: T0 + 1, treatedAt: T0 + 2 }),                          // treated, in care
      p({ status: 'admitted', admitTime: T0 + 1 }),                                            // in treatment
    ];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.transported).toBe(4);
    expect(o.treated).toBe(2);
    expect(o.recovered).toBe(1);
    expect(o.released).toBe(1);
    expect(o.diverted).toBe(0);
    expect(o.recoveryRate).toBe(0.5);
  });

  it('counts diverted patients admitted within the shift', () => {
    const patients = [
      p({ status: 'admitted', admitTime: T0 + 1, diverted: true }),
      p({ status: 'admitted', admitTime: T0 + 2, diverted: true }),
      p({ status: 'admitted', admitTime: T0 - 100, diverted: true }), // predates the shift
      p({ status: 'admitted', admitTime: T0 + 3 }),
    ];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.transported).toBe(3);
    expect(o.diverted).toBe(2);
  });

  it('excludes visits that predate the shift', () => {
    const patients = [
      p({ status: 'discharged', admitTime: T0 - 100, treatedAt: T0 - 50, dischargedAt: T0 - 10 }),
      p({ status: 'admitted', admitTime: T0 - 100 }),
    ];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.transported).toBe(0);
    expect(o.treated).toBe(0);
    expect(o.recovered).toBe(0);
    expect(o.released).toBe(0);
    expect(o.recoveryRate).toBeNull();
  });

  it('counts a discharge in this shift even when the admission was before it', () => {
    const patients = [
      p({ status: 'discharged', admitTime: T0 - 100, treatedAt: T0 - 50, dischargedAt: T0 + 5 }),
    ];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.transported).toBe(0);
    expect(o.recovered).toBe(1);
    expect(o.recoveryRate).toBe(1);
  });

  it('returns a null rate when nothing was discharged this shift', () => {
    const patients = [p({ status: 'admitted', admitTime: T0 + 1 })];
    expect(patientOutcomesForShift(patients as never, T0).recoveryRate).toBeNull();
  });

  it('splits transports into airlifted vs road (v0.22.14)', () => {
    const patients = [
      p({ status: 'discharged', admitTime: T0 + 1, transportMode: 'air' }),
      p({ status: 'admitted', admitTime: T0 + 2, transportMode: 'air' }),
      p({ status: 'admitted', admitTime: T0 + 3, transportMode: 'road' }),
      p({ status: 'admitted', admitTime: T0 + 4, transportMode: 'road' }),
      p({ status: 'admitted', admitTime: T0 + 5, transportMode: 'road' }),
      // Scene-admitted patient — no transport leg, counts in neither bucket.
      p({ status: 'admitted', admitTime: T0 + 6 }),
      // Transported last shift — not part of this shift's tally.
      p({ status: 'admitted', admitTime: T0 - 100, transportMode: 'air' }),
    ];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.transported).toBe(6);
    expect(o.airlifted).toBe(2);
    expect(o.roadTransported).toBe(3);
  });

  it('defaults the airlift split to zero when no transports carried a mode', () => {
    const patients = [p({ status: 'admitted', admitTime: T0 + 1 }), p({ status: 'admitted', admitTime: T0 + 2 })];
    const o = patientOutcomesForShift(patients as never, T0);
    expect(o.airlifted).toBe(0);
    expect(o.roadTransported).toBe(0);
  });
});

describe('ER depth (v0.22.12): staffing, beds, overflow', () => {
  const hospital = makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 });

  it('staffing starts at the baseline and grows with EMS clears (capped)', () => {
    expect(erStaffing({})).toBe(BASE_ER_STAFF);
    expect(erStaffing({ emsCleared: 0 })).toBe(BASE_ER_STAFF);
    expect(erStaffing({ emsCleared: 3 })).toBe(BASE_ER_STAFF + 3);
    expect(erStaffing({ emsCleared: 99 })).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
    expect(erStaffing({ emsCleared: -5 })).toBe(BASE_ER_STAFF); // defensive
  });

  it('effective beds = ward + staffing bonus', () => {
    expect(effectiveBeds(hospital, { emsCleared: 0 })).toBe(HOSPITAL_BEDS + BASE_ER_STAFF);
    expect(effectiveBeds(hospital, { emsCleared: 5 })).toBe(HOSPITAL_BEDS + BASE_ER_STAFF + 5);
    expect(effectiveBeds(null, { emsCleared: 1 })).toBe(BASE_ER_STAFF + 1); // no hospital built
  });

  it('adds the Hospital Ward perk beds on top of ward + staffing (v0.24.0)', () => {
    const base = effectiveBeds(hospital, { emsCleared: 0 });
    expect(effectiveBeds(hospital, { emsCleared: 0 }, Date.now(), [{ perks: ['hospital_ward'] }])).toBe(base + 5);
    // Two EMS stations with the perk stack.
    expect(
      effectiveBeds(hospital, { emsCleared: 0 }, Date.now(), [{ perks: ['hospital_ward'] }, { perks: ['hospital_ward'] }]),
    ).toBe(base + 10);
    // A non-capacity perk is neutral.
    expect(effectiveBeds(hospital, { emsCleared: 0 }, Date.now(), [{ perks: ['community_care'] }])).toBe(base);
    // The pure bonus helper aggregates the same way.
    expect(hospitalBedBonus([{ perks: ['hospital_ward'] }])).toBe(5);
    expect(hospitalBedBonus([])).toBe(0);
  });

  it('atCapacity triggers exactly when every effective bed is occupied', () => {
    const occupied = (n: number) => Array.from({ length: n }, () => ({ status: 'admitted' as const }));
    const beds = effectiveBeds(hospital, { emsCleared: 0 });
    expect(atCapacity(occupied(beds - 1), hospital, { emsCleared: 0 })).toBe(false);
    expect(atCapacity(occupied(beds), hospital, { emsCleared: 0 })).toBe(true);
    // More EMS clears → more beds → the same crowd no longer overflows.
    expect(atCapacity(occupied(beds), hospital, { emsCleared: 4 })).toBe(false);
    // Discharged patients free beds.
    expect(atCapacity([{ status: 'discharged' as const }, ...occupied(beds - 1)], hospital, { emsCleared: 0 })).toBe(false);
  });

  it('maps each launch city to its OWN regional trauma center (Batch 1: Memphis/Nashville were swapped)', () => {
    expect(traumaCenterFor('West Memphis, AR')).toBe('Memphis Regional Trauma Center');
    expect(traumaCenterFor('Memphis')).toBe('Memphis Regional Trauma Center');
    expect(traumaCenterFor('Nashville, TN')).toBe('Nashville Regional Trauma Center');
    expect(traumaCenterFor('Little Rock, AR')).toBe('UAMS Medical Center');
    expect(traumaCenterFor('New York City')).toBe('Bellevue Hospital Center');
    expect(traumaCenterFor('New York, NY')).toBe('Bellevue Hospital Center');
    expect(traumaCenterFor('Los Angeles')).toBe('LAC+USC Medical Center');
    expect(traumaCenterFor('Los Angeles, CA')).toBe('LAC+USC Medical Center');
    expect(traumaCenterFor('Chicago')).toBe('Stroger Hospital of Cook County');
    expect(traumaCenterFor('Chicago, IL')).toBe('Stroger Hospital of Cook County');
    expect(traumaCenterFor('Houston')).toBe('Ben Taub Hospital');
    expect(traumaCenterFor('Houston, TX')).toBe('Ben Taub Hospital');
    expect(traumaCenterFor('London')).toBe('Royal London Hospital');
    expect(traumaCenterFor('London, UK')).toBe('Royal London Hospital');
    expect(traumaCenterFor('Paris')).toBe('Hôpital de la Pitié-Salpêtrière');
    expect(traumaCenterFor('Paris, FR')).toBe('Hôpital de la Pitié-Salpêtrière');
    expect(traumaCenterFor('Berlin')).toBe('Charité – Universitätsmedizin Berlin');
    expect(traumaCenterFor('Berlin, DE')).toBe('Charité – Universitätsmedizin Berlin');
    expect(traumaCenterFor('Anywhere')).toBe('Regional Trauma Center');
    expect(traumaCenterFor(null)).toBe('Regional Trauma Center');
    expect(traumaCenterFor(undefined)).toBe('Regional Trauma Center');
  });
});

describe('ER staffing decay — nurses leave on long shifts (v0.22.16)', () => {
  // 1 real sec = 0.5 game min; fatigue 0.05/game-min (full mode, gameSpeed 1).
  const MIN = 60_000;
  const shift = (startedAt = 0) => ({ emsCleared: 8, startedAt });

  it('accrues no fatigue on a fresh shift or with no shift clock', () => {
    expect(erStaffFatigue({ startedAt: 0 }, 0)).toBe(0);
    expect(erStaffFatigue({}, 50 * MIN)).toBe(0);
    expect(staffDecayFraction(shift(0), 0)).toBe(0);
  });

  it('keeps the full earned staff below the overwork threshold', () => {
    // 40 real min → 1200 game min → fatigue 60 (< 70): no nurses leave.
    expect(erStaffFatigue(shift(0), 40 * MIN)).toBe(60);
    expect(erStaffFatigue(shift(0), 40 * MIN)).toBeLessThan(STAFF_OVERWORK_THRESHOLD);
    expect(erStaffing(shift(0), 40 * MIN)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
  });

  it('rotates bonus nurses off the floor once the shift runs long', () => {
    // 60 real min → 1800 game min → fatigue 90 → fraction (90-70)/30 = 2/3
    // → 8 bonus nurses × 2/3 = 5.33 → 5 leave, skeleton crew stays.
    expect(erStaffFatigue(shift(0), 60 * MIN)).toBe(90);
    expect(staffDecayFraction(shift(0), 60 * MIN)).toBeCloseTo(2 / 3, 5);
    expect(erStaffing(shift(0), 60 * MIN)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS - 5);
    // 80 real min → fatigue clamps at 100 → every bonus nurse is gone.
    expect(erStaffing(shift(0), 80 * MIN)).toBe(BASE_ER_STAFF);
  });

  it('sags effective capacity and re-triggers overflow on a long shift', () => {
    const hospital = makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 });
    // Fresh shift: 40 base + 10 staff = 50 beds → 49 admitted still fits.
    expect(effectiveBeds(hospital, shift(0), 0)).toBe(HOSPITAL_BEDS + BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
    expect(atCapacity(Array.from({ length: 49 }, () => ({ status: 'admitted' as const })), hospital, shift(0), 0)).toBe(false);
    // Same 49 patients, but the shift wore on → only 5 staff → 45 beds → overflow.
    expect(atCapacity(Array.from({ length: 49 }, () => ({ status: 'admitted' as const })), hospital, shift(0), 60 * MIN)).toBe(true);
  });

  it('stacks decay with ward expansions', () => {
    const ward = { ...makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 }), beds: HOSPITAL_BEDS + 2 * WARD_BEDS_PER_LEVEL, wardLevel: 2 } as never;
    expect(effectiveBeds(ward, shift(0), 60 * MIN)).toBe(HOSPITAL_BEDS + 2 * WARD_BEDS_PER_LEVEL + BASE_ER_STAFF + MAX_ER_STAFF_BONUS - 5);
  });

  it('freezes when Shift Pressure is off and halves in gentle', () => {
    // 'off' — a marathon shift changes nothing.
    saveSettings({ fatigueMode: 'off' });
    try {
      expect(erStaffFatigue(shift(0), 80 * MIN)).toBe(0);
      expect(erStaffing(shift(0), 80 * MIN)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
    } finally {
      saveSettings({ fatigueMode: 'full' });
    }
    // 'gentle' — rates halved: 60 real min → fatigue 45 (< 70): no decay.
    saveSettings({ fatigueMode: 'gentle' });
    try {
      expect(erStaffFatigue(shift(0), 60 * MIN)).toBe(45);
      expect(erStaffing(shift(0), 60 * MIN)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
      expect(STAFF_FATIGUE_PER_GAME_MIN).toBeGreaterThan(0);
      expect(STAFF_OVERWORK_THRESHOLD).toBe(70);
    } finally {
      saveSettings({ fatigueMode: 'full' });
    }
  });
});

describe('nurse rotation — the active counter to marathon shifts (v0.22.17)', () => {
  const MIN = 60_000;
  const shift = (startedAt = 0) => ({ emsCleared: 8, startedAt });

  it('costs a flat credit amount', () => {
    expect(NURSE_ROTATION_COST).toBe(2000);
  });

  it('stamps the rotation so the fatigue clock restarts mid-shift', () => {
    // 60 real min in: fatigue 90 without a rotation.
    expect(erStaffFatigue(shift(0), 60 * MIN)).toBe(90);
    // Rotate at 40 real min → fatigue restarts from there: only 20 real min
    // (600 game min) have elapsed → fatigue 30.
    const rotated = applyNurseRotation(makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 }), 40 * MIN);
    expect(erStaffFatigue(shift(0), 60 * MIN, rotated)).toBe(30);
  });

  it('brings every earned nurse (and their beds) straight back', () => {
    const hospital = makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 });
    // 60 real min in, no rotation: 5 of 8 bonus nurses have left.
    expect(erStaffing(shift(0), 60 * MIN, hospital)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS - 5);
    expect(effectiveBeds(hospital, shift(0), 60 * MIN)).toBe(HOSPITAL_BEDS + BASE_ER_STAFF + MAX_ER_STAFF_BONUS - 5);
    // Rotate at 60 real min → fatigue 0 → full staff again.
    const rotated = applyNurseRotation(hospital, 60 * MIN);
    expect(erStaffing(shift(0), 60 * MIN, rotated)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
    expect(effectiveBeds(rotated, shift(0), 60 * MIN)).toBe(HOSPITAL_BEDS + BASE_ER_STAFF + MAX_ER_STAFF_BONUS);
    // The same 49 patients that overflowed pre-rotation fit again post-rotation.
    expect(atCapacity(Array.from({ length: 49 }, () => ({ status: 'admitted' as const })), hospital, shift(0), 60 * MIN)).toBe(true);
    expect(atCapacity(Array.from({ length: 49 }, () => ({ status: 'admitted' as const })), rotated, shift(0), 60 * MIN)).toBe(false);
  });

  it('ignores a rotation from a previous shift (new shift wins the anchor)', () => {
    const hospital = makeHospital(MEMPHIS, { lat: 35.14, lng: -90.05 });
    // Rotated long ago, then a NEW shift started after it.
    const rotated = applyNurseRotation(hospital, 0);
    // Shift started at 5 real min; at 15 real min only 10 real min (300 game
    // min) have elapsed → fatigue 15, counted from the SHIFT start — the old
    // rotation anchor is older and ignored.
    expect(erStaffFatigue(shift(5 * MIN), 15 * MIN, rotated)).toBe(15);
  });

  it('is a no-op on a missing hospital and preserves old-save behavior without a stamp', () => {
    expect(applyNurseRotation(null)).toBeNull();
    expect(applyNurseRotation(undefined)).toBeNull();
    // No stamp → anchor is the shift start, exactly the pre-rotation behavior.
    expect(erStaffFatigue(shift(0), 60 * MIN)).toBe(90);
    expect(erStaffing(shift(0), 60 * MIN)).toBe(BASE_ER_STAFF + MAX_ER_STAFF_BONUS - 5);
  });
});

describe('NYC precise boundary (v0.30.0)', () => {
  it('resolves New York City to the consolidated five-borough ring', () => {
    const nyc = getCityBoundary('New York City');
    expect(nyc).toBeDefined();
    expect(nyc!.name).toContain('New York');
    expect(nyc!.rings.length).toBeGreaterThanOrEqual(1);
    expect(nyc!.rings[0].length).toBeGreaterThan(150);
  });

  it('resolves the plain "New York" name too (gameSetup key)', () => {
    expect(getCityBoundary('New York')).toBeDefined();
  });

  it('keeps the boroughs in and New Jersey out', () => {
    const nyc = getCityBoundary('New York City')!;
    expect(isPointInBoundary({ lat: 40.7549, lng: -73.984 }, nyc)).toBe(true);  // Midtown Manhattan
    expect(isPointInBoundary({ lat: 40.7447, lng: -73.9484 }, nyc)).toBe(true); // Long Island City
    expect(isPointInBoundary({ lat: 40.5076, lng: -74.2509 }, nyc)).toBe(true); // Tottenville, Staten Island
    expect(isPointInBoundary({ lat: 40.7282, lng: -74.0776 }, nyc)).toBe(false); // Jersey City
    expect(isPointInBoundary({ lat: 40.7357, lng: -74.1724 }, nyc)).toBe(false); // Newark
  });
});

describe('LA precise boundary (v0.32.0)', () => {
  it('resolves Los Angeles to the consolidated city-limits ring with enclave holes', () => {
    const la = getCityBoundary('Los Angeles');
    expect(la).toBeDefined();
    expect(la!.name).toContain('Los Angeles');
    expect(la!.rings.length).toBeGreaterThanOrEqual(1);
    expect(la!.rings[0].length).toBeGreaterThan(150);
  });

  it('resolves the state-qualified forms too (picker + geocode paths)', () => {
    expect(getCityBoundary('Los Angeles, CA')).toBeDefined();
    expect(getCityBoundary('Los Angeles', 'US')).toBeDefined();
  });

  it('keeps the city in and the independent enclaves out', () => {
    const la = getCityBoundary('Los Angeles')!;
    expect(isPointInBoundary({ lat: 34.0522, lng: -118.2437 }, la)).toBe(true); // Downtown
    expect(isPointInBoundary({ lat: 34.0928, lng: -118.3287 }, la)).toBe(true); // Hollywood
    expect(isPointInBoundary({ lat: 34.1654, lng: -118.6088 }, la)).toBe(true); // Woodland Hills (SFV)
    expect(isPointInBoundary({ lat: 33.7357, lng: -118.2922 }, la)).toBe(true); // San Pedro (harbor)
    expect(isPointInBoundary({ lat: 34.0195, lng: -118.4912 }, la)).toBe(false); // Santa Monica
    expect(isPointInBoundary({ lat: 34.0736, lng: -118.4004 }, la)).toBe(false); // Beverly Hills
    expect(isPointInBoundary({ lat: 34.09, lng: -118.3617 }, la)).toBe(false); // West Hollywood
    expect(isPointInBoundary({ lat: 34.0211, lng: -118.3965 }, la)).toBe(false); // Culver City
    expect(isPointInBoundary({ lat: 33.7701, lng: -118.1937 }, la)).toBe(false); // Long Beach
  });
});

describe('isAirborneTransport — two-leg flight rendering (v0.22.x)', () => {
  const air = (padReached?: boolean) => ({
    patientTransport: {
      patient: { firstName: 'A', lastName: 'B' } as never,
      hospitalId: 'h1',
      hospitalName: 'West Memphis General Hospital',
      hospitalPos: { lat: 35.145, lng: -90.18 },
      startedAt: 0,
      mode: 'air' as const,
      ...(padReached !== undefined ? { padReached } : {}),
    },
  });

  it('is true on the FIRST leg (scene → helipad)', () => {
    expect(isAirborneTransport(air())).toBe(true);
  });

  it('stays true on the SECOND leg (helipad → hospital ER)', () => {
    // The pad flip sets padReached but keeps mode 'air' — the amber flight
    // line, helicopter marker, and air-strike chip must render for the whole
    // scene → pad → ER path, not just the first leg.
    expect(isAirborneTransport(air(true))).toBe(true);
  });

  it('is false for road transports, non-transports, and null', () => {
    expect(isAirborneTransport({ patientTransport: { ...air().patientTransport, mode: 'road' } })).toBe(false);
    expect(isAirborneTransport({})).toBe(false);
    expect(isAirborneTransport(null)).toBe(false);
    expect(isAirborneTransport(undefined)).toBe(false);
  });
});
