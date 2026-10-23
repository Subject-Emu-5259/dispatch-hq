import { describe, it, expect } from 'vitest';
import type { Station } from '@dispatch-hq/shared';
import { buildShiftSummary } from './shiftSummary';

function shift(over: Record<string, unknown> = {}) {
  return {
    missionsCompleted: 8, missionsFailed: 2, creditsEarned: 1200, xpEarned: 300,
    zoneStats: { south: { calls: 5, patrolKm: 12 } },
    unitShiftStats: { u1: 3, u2: 1 },
    tierCounts: { routine: 4, serious: 2 },
    startedAt: 0, levelUps: 1, dutiesHandled: 2, patrolDistanceKm: 30, patrolShifts: 2,
    crewHoursRidden: 0, peakFatigue: 0, overworkEvents: 0, moraleBoosts: 0, restEvents: 0,
    ...over,
  } as any;
}

function station(employees: Array<{ id: string; fatigue?: number }>): Station {
  return {
    id: 's1', ownerId: 'p1', type: 'police_station', level: 2, name: 'HQ',
    position: { lat: 35.14, lng: -90.18 }, capacity: 5, unitCount: 1, coverageRadius: 5,
    createdAt: new Date().toISOString(),
    employees: employees as any,
  };
}

describe('buildShiftSummary', () => {
  it('computes clearance and copy text', () => {
    const s = buildShiftSummary({
      shift: shift(),
      units: [{ id: 'u1', name: 'Engine 1' }, { id: 'u2', name: 'Squad 2' }],
      career: { bestResponseTime: 42, level: 4 } as any,
    });
    expect(s.clearanceRate).toBeCloseTo(0.8, 1);
    expect(s.topZone).toBe('south');
    expect(s.copyText).toContain('SHIFT REPORT');
    expect(s.unitLeaders[0].name).toBe('Engine 1');
  });

  it('handles an empty shift gracefully', () => {
    const s = buildShiftSummary({
      shift: shift({ missionsCompleted: 0, missionsFailed: 0, creditsEarned: 0, xpEarned: 0, zoneStats: {}, unitShiftStats: {}, tierCounts: {}, startedAt: 0, levelUps: 0, dutiesHandled: 0, patrolDistanceKm: 0, patrolShifts: 0 }),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
    });
    expect(s.clearanceRate).toBe(0);
    expect(s.topZone).toBeNull();
    expect(s.bestResponseSec).toBeNull();
  });
});

describe('buildShiftSummary — hospital recovery (v0.22.10)', () => {
  it('folds patient milestones into the debrief copy text', () => {
    const s = buildShiftSummary({
      shift: shift(), // startedAt 0 → every admitted patient counts
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      patients: [
        { id: 'a', status: 'discharged', admitTime: 10, treatedAt: 20, dischargedAt: 30 } as any,
        { id: 'b', status: 'discharged', admitTime: 10, dischargedAt: 40 } as any,
        { id: 'c', status: 'treated', admitTime: 10, treatedAt: 20 } as any,
        { id: 'd', status: 'admitted', admitTime: 10 } as any,
      ],
    });
    expect(s.patientOutcomes.transported).toBe(4);
    expect(s.patientOutcomes.treated).toBe(2);
    expect(s.patientOutcomes.recovered).toBe(1);
    expect(s.patientOutcomes.released).toBe(1);
    expect(s.patientOutcomes.diverted).toBe(0);
    expect(s.patientOutcomes.recoveryRate).toBe(0.5);
    expect(s.copyText).toContain('Recovery: 4 transported · 2 treated · 1 recovered / 2 discharged (50% recovery)');
  });

  it('names diverted patients in the debrief copy text', () => {
    const s = buildShiftSummary({
      shift: shift(),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      patients: [
        { id: 'a', status: 'admitted', admitTime: 10, diverted: true } as any,
        { id: 'b', status: 'admitted', admitTime: 11 } as any,
      ],
    });
    expect(s.patientOutcomes.diverted).toBe(1);
    expect(s.copyText).toContain('1 diverted to trauma center');
  });

  it('omits the recovery line when nothing was transported', () => {
    const s = buildShiftSummary({
      shift: shift(),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      patients: [
        { id: 'old', status: 'discharged', admitTime: -100, treatedAt: -50, dischargedAt: -10 } as any,
      ],
    });
    expect(s.copyText).not.toContain('Recovery:');
    expect(s.patientOutcomes.transported).toBe(0);
    expect(s.patientOutcomes.recoveryRate).toBeNull();
  });
});

describe('buildShiftSummary — crew condition (v0.20.5)', () => {
  it('averages fatigue across all personnel and reports the crew numbers', () => {
    const s = buildShiftSummary({
      shift: shift({ crewHoursRidden: 3.5, peakFatigue: 80, overworkEvents: 2, moraleBoosts: 1, restEvents: 1 }),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      stations: [
        station([{ id: 'a', fatigue: 20 }, { id: 'b', fatigue: 60 }]),
        station([{ id: 'c', fatigue: 40 }]),
      ],
    });
    expect(s.avgFatigue).toBe(40);      // (20+60+40)/3
    expect(s.crewHoursRidden).toBe(3.5);
    expect(s.peakFatigue).toBe(80);
    expect(s.overworkEvents).toBe(2);
    expect(s.copyText).toContain('Crew: 3.5h ridden');
  });

  it('returns null avg fatigue when nobody is hired', () => {
    const s = buildShiftSummary({
      shift: shift(),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      stations: [station([])],
    });
    expect(s.avgFatigue).toBeNull();
    expect(s.copyText).not.toContain('Crew:');
  });

  it('defaults crew counters to zero for legacy shifts', () => {
    const s = buildShiftSummary({
      shift: shift({ crewHoursRidden: undefined, peakFatigue: undefined, overworkEvents: undefined, moraleBoosts: undefined, restEvents: undefined }),
      units: [],
      career: { bestResponseTime: 0, level: 1 } as any,
      stations: [station([{ id: 'a', fatigue: 10 }])],
    });
    expect(s.crewHoursRidden).toBe(0);
    expect(s.peakFatigue).toBe(0);
    expect(s.overworkEvents).toBe(0);
  });
});
