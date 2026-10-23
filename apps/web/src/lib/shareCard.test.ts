import { describe, it, expect } from 'vitest';
import { buildShareCardData, CARD_HEIGHT, CARD_WIDTH } from './shareCard';
import type { ShiftSummary } from './shiftSummary';

const baseSummary: ShiftSummary = {
  bestResponseSec: 87,
  clearanceRate: 0.8,
  topZone: 'downtown',
  tierMix: { routine: 8, moderate: 4, serious: 2, critical: 1 },
  unitLeaders: [{ name: 'Unit 1', missions: 5 }],
  crewHoursRidden: 3.5,
  avgFatigue: 46,
  peakFatigue: 78,
  overworkEvents: 2,
  moraleBoosts: 1,
  restEvents: 3,
  patientOutcomes: { transported: 2, treated: 2, recovered: 2, released: 0, diverted: 0, airlifted: 1, roadTransported: 1, recoveryRate: 1 },
  wardExpansions: 1,
  wardBedsAdded: 10,
  wardCreditsSpent: 5000,
  copyText: '',
};

const baseInput = {
  username: 'deandrewharris',
  rankIcon: '👮',
  rankTitle: 'Chief',
  level: 12,
  serviceLabel: 'Police',
  shiftDurationLabel: '1h 12m',
  summary: baseSummary,
  creditsEarned: 12400,
  xpEarned: 860,
  zoneRows: [
    { id: 'downtown', name: 'Downtown', calls: 7, patrolKm: 12.4 },
    { id: 'westside', name: 'West Side', calls: 4, patrolKm: 8.1 },
    { id: 'eastside', name: 'East Side', calls: 2, patrolKm: 3.0 },
  ],
  contest: {
    icon: '🎆',
    name: 'Summer Blaze',
    clears: 3,
    totalCalls: 41,
    rank: 12,
    timeLeft: '3 days',
  },
};

describe('buildShareCardData', () => {
  it('builds the six stat tiles from the summary', () => {
    const data = buildShareCardData(baseInput);
    expect(data.stats).toHaveLength(6);
    expect(data.stats[0]).toEqual({ label: 'Missions Cleared', value: '15', accent: expect.any(String) });
    expect(data.stats[1]).toEqual({ label: 'Clearance Rate', value: '80%', accent: expect.any(String) });
    expect(data.stats[2]).toEqual({ label: 'Best Response', value: '1:27', accent: expect.any(String) });
    expect(data.stats[3]).toEqual({ label: 'Shift Duration', value: '1h 12m', accent: expect.any(String) });
    expect(data.stats[4]).toEqual({ label: 'Credits Earned', value: '$12,400', accent: expect.any(String) });
    expect(data.stats[5]).toEqual({ label: 'XP Earned', value: '860', accent: expect.any(String) });
  });

  it('orders zones by calls, caps at five, and computes call share percentages', () => {
    const data = buildShareCardData(baseInput);
    expect(data.zoneRows.map((r) => r.name)).toEqual(['Downtown', 'West Side', 'East Side']);
    expect(data.totalZoneCalls).toBe(13);
    expect(data.zoneRows[0].pct).toBe(Math.round((7 / 13) * 100));
    expect(data.zoneRows[1].pct).toBe(Math.round((4 / 13) * 100));
  });

  it('caps zone rows at five even with many neighborhoods', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `z${i}`, name: `Zone ${i}`, calls: 9 - i, patrolKm: 1,
    }));
    const data = buildShareCardData({ ...baseInput, zoneRows: rows });
    expect(data.zoneRows).toHaveLength(5);
    expect(data.zoneRows[0].name).toBe('Zone 0');
    expect(data.zoneRows[4].name).toBe('Zone 4');
  });

  it('carries the crew line through with a formatted hours label', () => {
    const data = buildShareCardData(baseInput);
    expect(data.crew).not.toBeNull();
    expect(data.crew!.hoursLabel).toBe('3h 30m');
    expect(data.crew!.avgFatigue).toBe(46);
    expect(data.crew!.peakFatigue).toBe(78);
  });

  it('drops the contest line when no contest calls were cleared', () => {
    const data = buildShareCardData({ ...baseInput, contest: { ...baseInput.contest!, clears: 0 } });
    expect(data.contest).toBeNull();
  });

  it('keeps the contest line when contest calls were cleared', () => {
    const data = buildShareCardData(baseInput);
    expect(data.contest).not.toBeNull();
    expect(data.contest!.clears).toBe(3);
    expect(data.contest!.timeLeft).toBe('3 days');
  });

  it('handles a zero-call shift without dividing by zero', () => {
    const empty = {
      ...baseInput,
      summary: { ...baseSummary, clearanceRate: 0, tierMix: { routine: 0, moderate: 0, serious: 0, critical: 0 }, crewHoursRidden: 0, avgFatigue: null, peakFatigue: 0, overworkEvents: 0, moraleBoosts: 0, restEvents: 0, bestResponseSec: null },
      zoneRows: [],
      creditsEarned: 0,
      xpEarned: 0,
      contest: null,
    };
    const data = buildShareCardData(empty);
    expect(data.zoneRows).toHaveLength(0);
    expect(data.contest).toBeNull();
    expect(data.clearancePct).toBe(0);
    expect(data.crew!.hoursLabel).toBe('0h 0m');
  });

  it('carries the patient recovery stat when patients were transported this shift', () => {
    const data = buildShareCardData(baseInput);
    expect(data.recovery).not.toBeNull();
    expect(data.recovery).toMatchObject({
      transported: 2,
      treated: 2,
      recovered: 2,
      released: 0,
      diverted: 0,
      recoveryRate: 1,
    });
  });

  it('keeps the recovery stat null when no patients were transported', () => {
    const quiet = {
      ...baseInput,
      summary: { ...baseSummary, patientOutcomes: { transported: 0, treated: 0, recovered: 0, released: 0, diverted: 0, airlifted: 0, roadTransported: 0, recoveryRate: null } },
    };
    const data = buildShareCardData(quiet);
    expect(data.recovery).toBeNull();
  });

  it('preserves the diverted count and a null recovery rate on the card data', () => {
    const diverted = {
      ...baseInput,
      summary: { ...baseSummary, patientOutcomes: { transported: 5, treated: 3, recovered: 2, released: 0, diverted: 2, airlifted: 1, roadTransported: 4, recoveryRate: null } },
    };
    const data = buildShareCardData(diverted);
    expect(data.recovery).toMatchObject({ transported: 5, treated: 3, recovered: 2, released: 0, diverted: 2, airlifted: 1, roadTransported: 4, recoveryRate: null });
  });

  it('exposes the 4:5 social crop dimensions', () => {
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1350);
  });
});
