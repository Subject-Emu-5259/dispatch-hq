import { describe, it, expect } from 'vitest';
import type { Employee, Station, Unit } from '@dispatch-hq/shared';
import {
  advancePersonnel,
  fatigueFactor,
  moraleFactor,
  employeeEffectiveness,
  crewEffectiveness,
  stationCrewEffectiveness,
  fatigueLabel,
  moraleLabel,
  fatigueGainMultiplier,
  moraleDrainMultiplier,
  moraleRecoveryMultiplier,
  crewReadiness,
  OVERWORK_THRESHOLD,
} from './personnel';

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    stationId: 's1',
    name: 'Test Officer',
    role: 'Patrol Officer',
    service: 'police',
    level: 1,
    xp: 0,
    status: 'available',
    assignedUnitId: null,
    fatigue: 0,
    morale: 100,
    ...over,
  };
}

function station(employees: Employee[]): Station {
  return {
    id: 's1',
    ownerId: 'p1',
    type: 'police_station',
    level: 2,
    name: 'HQ',
    position: { lat: 35.14, lng: -90.18 },
    capacity: 5,
    unitCount: 1,
    coverageRadius: 5,
    createdAt: new Date().toISOString(),
    employees,
  };
}

describe('advancePersonnel — fatigue', () => {
  it('tires assigned employees and rests everyone else', () => {
    const roster = [
      emp({ id: 'a', status: 'assigned', fatigue: 0 }),
      emp({ id: 'b', status: 'available', fatigue: 100 }),
    ];
    const { stations, changed } = advancePersonnel([station(roster)], 100);
    expect(changed).toBe(true);
    const [a, b] = stations[0].employees!;
    expect(a.fatigue).toBe(5);   // +0.05 × 100 game min
    expect(b.fatigue).toBe(94);  // −0.06 × 100 → rounds from 94.0
  });

  it('rests off-duty and training employees twice as fast', () => {
    const roster = [
      emp({ id: 'a', status: 'off_duty', fatigue: 50 }),
      emp({ id: 'b', status: 'training', fatigue: 50 }),
    ];
    const { stations } = advancePersonnel([station(roster)], 100);
    const [a, b] = stations[0].employees!;
    expect(a.fatigue).toBe(38); // 50 − 12
    expect(b.fatigue).toBe(38);
  });

  it('never goes below 0 or above 100', () => {
    const roster = [
      emp({ id: 'a', status: 'assigned', fatigue: 99 }),
      emp({ id: 'b', status: 'available', fatigue: 1 }),
    ];
    const { stations } = advancePersonnel([station(roster)], 1000);
    const [a, b] = stations[0].employees!;
    expect(a.fatigue).toBe(100);
    expect(b.fatigue).toBe(0);
  });

  it('reports changed=false when nothing moves a full point', () => {
    const { changed } = advancePersonnel([station([emp()])], 0.1);
    expect(changed).toBe(false);
  });

  it('leaves stations with no employees untouched', () => {
    const s = station([]);
    const { stations, changed } = advancePersonnel([s], 100);
    expect(changed).toBe(false);
    expect(stations[0]).toBe(s);
  });
});

describe('advancePersonnel — morale', () => {
  it('drains morale only when overworked (fatigue ≥ 70)', () => {
    const tired = emp({ id: 'a', status: 'assigned', fatigue: OVERWORK_THRESHOLD, morale: 90 });
    const { stations } = advancePersonnel([station([tired])], 100);
    expect(stations[0].employees![0].morale).toBe(87); // −0.03 × 100
  });

  it('recovering employees regain morale up to 100', () => {
    const low = emp({ id: 'a', status: 'available', morale: 80 });
    const { stations } = advancePersonnel([station([low])], 100);
    expect(stations[0].employees![0].morale).toBe(82); // +0.015 × 100
  });

  it('clamps morale at 100', () => {
    const fresh = emp({ id: 'a', status: 'available', morale: 100 });
    const { stations } = advancePersonnel([station([fresh])], 1000);
    expect(stations[0].employees![0].morale).toBe(100);
  });
});

describe('advancePersonnel — shift-pressure modes (v0.20.2)', () => {
  it('freezes the simulation entirely when mode is off', () => {
    const roster = [emp({ id: 'a', status: 'assigned', fatigue: 42, morale: 55 })];
    const s = station(roster);
    const { stations, changed } = advancePersonnel([s], 500, 'off');
    expect(changed).toBe(false);
    expect(stations[0]).toBe(s);
    expect(stations[0].employees![0].fatigue).toBe(42);
    expect(stations[0].employees![0].morale).toBe(55);
  });

  it('gentle mode halves fatigue gain and morale drain', () => {
    const roster = [
      emp({ id: 'a', status: 'assigned', fatigue: 0 }),
      emp({ id: 'b', status: 'assigned', fatigue: OVERWORK_THRESHOLD, morale: 90 }),
    ];
    const { stations } = advancePersonnel([station(roster)], 100, 'gentle');
    const [a, b] = stations[0].employees!;
    expect(a.fatigue).toBe(3);  // 0.05 × 0.5 × 100 = 2.5 → rounds to 3
    expect(b.morale).toBe(89);  // −0.03 × 0.5 × 100 = −1.5 → rounds to 89
  });

  it('full mode keeps the standard rates', () => {
    const roster = [emp({ id: 'a', status: 'assigned', fatigue: 0 })];
    const { stations } = advancePersonnel([station(roster)], 100, 'full');
    expect(stations[0].employees![0].fatigue).toBe(5);
  });

  it('crewEffectiveness ignores stored fatigue when mode is off', () => {
    const crew = [{ id: 'a', fatigue: 100, morale: 0 }];
    expect(crewEffectiveness(crew, { crewIds: ['a'] }, 'off')).toBe(1);
    expect(stationCrewEffectiveness([station([emp({ id: 'a', fatigue: 100, morale: 0 })])], { stationId: 's1', crewIds: ['a'] }, 'off')).toBe(1);
  });
});

describe('trait multipliers (v0.20.2)', () => {
  it('Hardened crews tire 25% slower', () => {
    expect(fatigueGainMultiplier([])).toBe(1);
    expect(fatigueGainMultiplier(['Hardened'])).toBe(0.75);
  });

  it('Steady crews drain 50% less morale when overworked', () => {
    expect(moraleDrainMultiplier(['Steady'])).toBe(0.5);
    expect(moraleDrainMultiplier(['Steady', 'Night Owl'])).toBe(0.5);
  });

  it('Energized crews recover morale 50% faster', () => {
    expect(moraleRecoveryMultiplier(['Energized'])).toBe(1.5);
    expect(moraleRecoveryMultiplier(['Night Owl'])).toBe(1);
  });

  it('traits compound in the simulation', () => {
    const roster = [emp({ id: 'a', status: 'assigned', fatigue: 0, traits: ['Hardened'] })];
    const { stations } = advancePersonnel([station(roster)], 100);
    expect(stations[0].employees![0].fatigue).toBe(4); // 0.05 × 0.75 × 100 = 3.75 → 4
  });
});

describe('effectiveness factors', () => {
  it('fatigueFactor: 1.0 fresh → 0.75 exhausted', () => {
    expect(fatigueFactor(0)).toBe(1);
    expect(fatigueFactor(100)).toBe(0.75);
    expect(fatigueFactor(40)).toBe(0.9);
  });

  it('moraleFactor: 1.0 at 100 → 0.85 at 0', () => {
    expect(moraleFactor(100)).toBe(1);
    expect(moraleFactor(0)).toBe(0.85);
  });

  it('employeeEffectiveness combines both factors', () => {
    expect(employeeEffectiveness({ fatigue: 0, morale: 100 })).toBe(1);
    expect(employeeEffectiveness({ fatigue: 100, morale: 0 })).toBeCloseTo(0.75 * 0.85);
  });

  it('crewEffectiveness averages the crew and defaults to 1 when unknown', () => {
    const crew = [
      { id: 'a', fatigue: 0, morale: 100 },
      { id: 'b', fatigue: 100, morale: 100 },
    ];
    const unit: Pick<Unit, 'crewIds'> = { crewIds: ['a', 'b'] };
    expect(crewEffectiveness(crew, unit)).toBeCloseTo((1 + 0.75) / 2);

    expect(crewEffectiveness(crew, { crewIds: [] })).toBe(1);
    expect(crewEffectiveness(crew, { crewIds: ['zzz'] })).toBe(1);
  });

  it('stationCrewEffectiveness resolves the unit station', () => {
    const s = station([emp({ id: 'a', fatigue: 100, morale: 100 })]);
    const unit = { stationId: 's1', crewIds: ['a'] };
    expect(stationCrewEffectiveness([s], unit)).toBe(0.75);
    expect(stationCrewEffectiveness([s], { stationId: 'nope', crewIds: ['a'] })).toBe(1);
  });
});

describe('crewReadiness — unit HUD chip', () => {
  it('returns null for an empty crew', () => {
    expect(crewReadiness([])).toBeNull();
  });

  it('is driven by the worst (most fatigued) member', () => {
    const crew = [
      { fatigue: 0, morale: 100 },
      { fatigue: 90, morale: 100 },
    ];
    const r = crewReadiness(crew)!;
    expect(r.level).toBe('exhausted');
    expect(r.label).toBe('Exhausted');
    expect(r.worstFatigue).toBe(90);
  });

  it('walks the fatigue thresholds fresh/weary/tired/exhausted', () => {
    expect(crewReadiness([{ fatigue: 10, morale: 100 }])!.level).toBe('fresh');
    expect(crewReadiness([{ fatigue: 40, morale: 100 }])!.level).toBe('weary');
    expect(crewReadiness([{ fatigue: 70, morale: 100 }])!.level).toBe('tired');
    expect(crewReadiness([{ fatigue: 100, morale: 100 }])!.level).toBe('exhausted');
  });

  it('averages crew effectiveness across members', () => {
    const r = crewReadiness([
      { fatigue: 0, morale: 100 },    // 1.0
      { fatigue: 100, morale: 100 },  // 0.75
    ])!;
    expect(r.avgEffectiveness).toBeCloseTo(0.875);
  });
});

describe('labels', () => {
  it('fatigueLabel walks Fresh → Weary → Tired → Exhausted', () => {
    expect(fatigueLabel(0)).toBe('Fresh');
    expect(fatigueLabel(40)).toBe('Weary');
    expect(fatigueLabel(70)).toBe('Tired');
    expect(fatigueLabel(95)).toBe('Exhausted');
  });

  it('moraleLabel walks High → Steady → Low → Rock Bottom', () => {
    expect(moraleLabel(90)).toBe('High');
    expect(moraleLabel(50)).toBe('Steady');
    expect(moraleLabel(30)).toBe('Low');
    expect(moraleLabel(10)).toBe('Rock Bottom');
  });
});
