// Batch 3c — social + economy pure-rule harness (server side).
// Competitions ranking (server-verified rows only) + lease terms/split/expiry.
// No DB: these modules take rows/numbers only, so a client number has no
// parameter to ride in on — that IS the anti-farming proof at this layer
// (the route layer, which only feeds DB rows, is covered by tsc + code).
import { describe, it, expect } from 'vitest';
import { weekKeyFor, weekStartFor, rankAlliancesByClears } from '../lib/competitions';
import {
  validateLeaseTerms, leaseFeeFor, leaseEndDate, leaseEffectiveStatus, leaseRevenueSplit,
} from '../lib/leases';

describe('competition weeks', () => {
  it('Monday-start ISO weeks: Mon 2026-11-02 and Sun 2026-11-08 share a week', () => {
    expect(weekKeyFor(new Date('2026-11-02T12:00:00Z'))).toBe('2026-11-02');
    expect(weekKeyFor(new Date('2026-11-08T23:59:00Z'))).toBe('2026-11-02');
    expect(weekKeyFor(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09');
    expect(weekStartFor(new Date('2026-11-05T10:00:00Z')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });
});

describe('rankAlliancesByClears', () => {
  it('ranks by total (manual + city), members deduped, ties broken deterministically', () => {
    const ranks = rankAlliancesByClears([
      { allianceId: 'a1', playerId: 'p1', callsCleared: 5, cityClears: 2 },
      { allianceId: 'a1', playerId: 'p1', callsCleared: 3, cityClears: 0 }, // same player, second row
      { allianceId: 'a1', playerId: 'p2', callsCleared: 1, cityClears: 0 },
      { allianceId: 'a2', playerId: 'p3', callsCleared: 4, cityClears: 4 },
    ]);
    // a1 total = 5+2+3+1 = 11; a2 total = 8
    expect(ranks[0]).toEqual({ allianceId: 'a1', rank: 1, totalClears: 11, manualClears: 9, cityClears: 2, memberCount: 2 });
    expect(ranks[1].allianceId).toBe('a2');
    expect(ranks[1].totalClears).toBe(8);
  });
  it('empty input ranks nothing — a client XP number cannot appear because there is no such input', () => {
    expect(rankAlliancesByClears([])).toEqual([]);
  });
});

describe('lease terms', () => {
  it('term/share bounds enforced', () => {
    expect(validateLeaseTerms(7, 25)).toBeNull();
    expect(validateLeaseTerms(0, 25)).toBeTruthy();
    expect(validateLeaseTerms(31, 25)).toBeTruthy();
    expect(validateLeaseTerms(7, 51)).toBeTruthy();
    expect(validateLeaseTerms(7, -1)).toBeTruthy();
    expect(validateLeaseTerms(7.5, 25)).toBeTruthy();
  });
  it('fee is 100/day; end date is start + term', () => {
    expect(leaseFeeFor(7)).toBe(700);
    expect(leaseEndDate(new Date('2026-11-03T00:00:00Z'), 7).toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });
  it('active past end reads expired; ended stays ended', () => {
    const end = new Date('2026-11-10T00:00:00Z');
    expect(leaseEffectiveStatus('active', end, new Date('2026-11-10T00:00:00Z'))).toBe('expired');
    expect(leaseEffectiveStatus('active', end, new Date('2026-11-09T00:00:00Z'))).toBe('active');
    expect(leaseEffectiveStatus('ended', end, new Date('2026-11-09T00:00:00Z'))).toBe('ended');
  });
  it('revenue split: 25% of 1000 → treasury 250, lessee 750; flooring remainder to lessee', () => {
    expect(leaseRevenueSplit(1000, 25)).toEqual({ lessee: 750, treasury: 250 });
    expect(leaseRevenueSplit(101, 50)).toEqual({ lessee: 51, treasury: 50 });
    expect(leaseRevenueSplit(0, 25)).toEqual({ lessee: 0, treasury: 0 });
  });
});
