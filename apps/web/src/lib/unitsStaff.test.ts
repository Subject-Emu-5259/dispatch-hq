// Batch 3a harness — veterancy, academy, fatigue-deepening, shift
// scheduling, and save/load round-trip of all four systems. Real behavior
// on fixtures, not existence checks: every assertion pins a computed value.
import { describe, it, expect } from 'vitest';
import {
  veterancyRankFor, veterancyXpToNext, veterancyXpGain, veterancyEtaMultiplier,
  veterancySuccessBonus, applyMissionVeterancy, ACADEMY_COURSES, academyCourse,
  enrollAcademy, completeAcademy, academyRemainingGameMin, eligibleCertForMission,
  unitHasCert, crewConditionMultiplier, shiftKeyFor, shiftCoverage,
  shiftResponseMultiplier, toggleShift, applyUnitsStaffEta, ensureUnitStaffDefaults,
} from './unitsStaff';

describe('veterancy', () => {
  it('ranks at 100 / 300 XP with exact ETA + success bonuses', () => {
    expect(veterancyRankFor(0)).toBe('Rookie');
    expect(veterancyRankFor(99)).toBe('Rookie');
    expect(veterancyRankFor(100)).toBe('Veteran');
    expect(veterancyRankFor(299)).toBe('Veteran');
    expect(veterancyRankFor(300)).toBe('Elite');
    expect(veterancyXpToNext(0)).toBe(100);
    expect(veterancyXpToNext(250)).toBe(50);
    expect(veterancyXpToNext(300)).toBeNull();
    expect(veterancyEtaMultiplier('Rookie')).toBe(1);
    expect(veterancyEtaMultiplier('Veteran')).toBe(0.92);
    expect(veterancyEtaMultiplier('Elite')).toBe(0.85);
    expect(veterancySuccessBonus('Veteran')).toBe(0.05);
    expect(veterancySuccessBonus('Elite')).toBe(0.1);
  });
  it('XP gain scales with difficulty and certs, and rank-up is detected', () => {
    expect(veterancyXpGain(1)).toBe(25);
    expect(veterancyXpGain(5)).toBe(45);
    expect(veterancyXpGain(10)).toBe(70);
    expect(veterancyXpGain(5, true)).toBe(68); // 45 * 1.5 rounded
    const r = applyMissionVeterancy({ veterancyXp: 90 }, 5);
    expect(r.veterancyXp).toBe(135);
    expect(r.rank).toBe('Veteran');
    expect(r.rankedUp).toBe(true);
    const r2 = applyMissionVeterancy({ veterancyXp: 10 }, 1);
    expect(r2.rankedUp).toBe(false);
  });
});

describe('academy', () => {
  const unit = { certs: [] as string[], academy: null, trainingEndsAt: undefined, status: 'available' as const };
  it('queue -> game-clock completion -> cert, with exact durations', () => {
    expect(ACADEMY_COURSES.map((c) => [c.id, c.durationGameMin])).toEqual([
      ['driving', 120], ['hazmat', 240], ['paramedic', 360],
    ]);
    const enrolled = enrollAcademy(unit, 'hazmat', 1000);
    expect(enrolled).toEqual({ academy: { course: 'hazmat', endsAtGameMin: 1240 } });
    const busy = { ...unit, academy: enrolled!.academy };
    expect(academyRemainingGameMin(busy, 1100)).toBe(140);
    expect(completeAcademy(busy, 1239)).toBeNull();
    const done = completeAcademy(busy, 1240)!;
    expect(done.certs).toEqual(['hazmat']);
    expect(done.academy).toBeNull();
    expect(done.completedCourse).toBe('hazmat');
    expect(unitHasCert(done, 'hazmat')).toBe(true);
  });
  it('rejects duplicates, double queues, busy and uncertifiable enrolls', () => {
    expect(enrollAcademy(unit, 'nope' as never, 0)).toBeNull();
    expect(enrollAcademy({ ...unit, certs: ['driving'] }, 'driving', 0)).toBeNull();
    expect(enrollAcademy({ ...unit, academy: { course: 'driving', endsAtGameMin: 500 } }, 'hazmat', 0)).toBeNull();
    expect(enrollAcademy({ ...unit, status: 'en_route' as const }, 'driving', 0)).toBeNull();
    expect(enrollAcademy({ ...unit, trainingEndsAt: Date.now() + 60000 }, 'driving', 0)).toBeNull();
  });
  it('maps missions to tiers, never hard-gating a dispatch', () => {
    expect(eligibleCertForMission({ name: 'Chemical spill', category: 'fire', difficulty: 3 })).toBe('hazmat');
    expect(eligibleCertForMission({ name: 'Cardiac arrest', category: 'ems', difficulty: 9 })).toBe('paramedic');
    expect(eligibleCertForMission({ name: 'Vehicle pursuit', category: 'police', difficulty: 4 })).toBe('driving');
    expect(eligibleCertForMission({ name: 'Noise complaint', category: 'police', difficulty: 1 })).toBeNull();
    expect(academyCourse('paramedic')!.tierLabel).toBe('Critical Care');
  });
});

describe('fatigue deepening + shifts', () => {
  const crew = [
    { id: 'e1', fatigue: 10, morale: 90 },
    { id: 'e2', fatigue: 15, morale: 85 },
  ];
  it('rested crews speed up, exhausted crews slow down, uncrewed units unaffected', () => {
    expect(crewConditionMultiplier(crew, ['e1', 'e2'])).toBe(0.95);
    expect(crewConditionMultiplier([...crew, { id: 'e3', fatigue: 90, morale: 40 }], ['e1', 'e2', 'e3'])).toBe(1.1);
    expect(crewConditionMultiplier(crew, [])).toBe(1);
    expect(crewConditionMultiplier(crew, ['nobody'])).toBe(1);
    expect(crewConditionMultiplier([{ id: 'e1', fatigue: 50, morale: 60 }], ['e1'])).toBe(1);
  });
  it('shift keys follow the game clock and coverage math is exact', () => {
    // gameMinutes: day 0 (Monday), hour = floor(m/30) % 24
    expect(shiftKeyFor(6 * 30)).toBe('day'); // 06:00 Monday
    expect(shiftKeyFor(21 * 30)).toBe('night'); // 21:00 Monday
    expect(shiftKeyFor(5 * 720 + 10 * 30)).toBe('weekend'); // Saturday
    expect(shiftCoverage({ shifts: undefined }, 0)).toBe('unscheduled');
    expect(shiftCoverage({ shifts: {} }, 0)).toBe('unscheduled');
    expect(shiftCoverage({ shifts: { day: true } }, 6 * 30)).toBe('covered');
    expect(shiftCoverage({ shifts: { day: true } }, 21 * 30)).toBe('uncovered');
    expect(shiftResponseMultiplier({ shifts: { day: true } }, 6 * 30)).toBe(0.93);
    expect(shiftResponseMultiplier({ shifts: { day: true } }, 21 * 30)).toBe(1.12);
    expect(shiftResponseMultiplier({ shifts: undefined }, 0)).toBe(1);
    expect(toggleShift(undefined, 'night')).toEqual({ night: true });
    expect(toggleShift({ night: true }, 'night')).toEqual({});
  });
  it('combined ETA math composes every factor', () => {
    // 100s base, Elite .85, covered .93, rested .95, fresh crew eff 1
    expect(applyUnitsStaffEta(100, { veterancyRank: 'Elite', crewEffectiveness: 1, shiftMultiplier: 0.93, crewConditionMultiplier: 0.95 })).toBe(75);
    // Rookie, unscheduled, plain crew: unchanged
    expect(applyUnitsStaffEta(100, { veterancyRank: 'Rookie', crewEffectiveness: 1, shiftMultiplier: 1, crewConditionMultiplier: 1 })).toBe(100);
    // Tired crew effectiveness still divides (floor 0.7)
    expect(applyUnitsStaffEta(100, { veterancyRank: 'Rookie', crewEffectiveness: 0.8, shiftMultiplier: 1, crewConditionMultiplier: 1 })).toBe(125);
  });
});

describe('save/load round-trip', () => {
  it('old saves gain defaults and new fields survive JSON intact', () => {
    const legacy: { id: string; veterancyXp?: number; certs?: string[]; academy?: { course: string; endsAtGameMin: number } | null } = { id: 'u1' };
    const norm = ensureUnitStaffDefaults(legacy);
    expect(norm.veterancyXp).toBe(0);
    expect(norm.certs).toEqual([]);
    expect(norm.academy).toBeNull();
    const full = {
      id: 'u1', veterancyXp: 310, certs: ['hazmat', 'driving'],
      academy: { course: 'paramedic', endsAtGameMin: 5000 },
    };
    const roundTripped = JSON.parse(JSON.stringify(ensureUnitStaffDefaults(full)));
    expect(roundTripped.veterancyXp).toBe(310);
    expect(veterancyRankFor(roundTripped.veterancyXp)).toBe('Elite');
    expect(roundTripped.certs).toEqual(['hazmat', 'driving']);
    expect(roundTripped.academy.endsAtGameMin).toBe(5000);
    const station = JSON.parse(JSON.stringify({ id: 's1', shifts: { day: true, night: false, weekend: true } }));
    expect(shiftCoverage(station, 6 * 30)).toBe('covered');
  });
});
