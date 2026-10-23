import { describe, it, expect } from 'vitest';
import { gapSeverityFor, zoneCoverageRatio, stationRadiusKm } from './coverage';
import type { CityZone } from '@/lib/patrol/patrolZones';
import type { Station } from '@dispatch-hq/shared';

const zone: CityZone = {
  id: 'z-central',
  name: 'Downtown',
  center: { lat: 35.15, lng: -90.18 },
  bounds: { latMin: 35.14, latMax: 35.16, lngMin: -90.19, lngMax: -90.17 },
  direction: 'central',
  covered: true,
};

function station(lat: number, lng: number, coverageRadius = 5): Station {
  return {
    id: `st-${lat}-${lng}`,
    ownerId: 'p1',
    name: 'Test',
    type: 'police_station',
    position: { lat, lng },
    level: 1,
    capacity: 5,
    coverageRadius,
  } as unknown as Station;
}

describe('coverage gap', () => {
  it('no stations means a full gap', () => {
    expect(zoneCoverageRatio(zone, [])).toBe(0);
    expect(gapSeverityFor(zone, [])).toBe('full');
  });

  it('a station on the zone center fully covers it', () => {
    expect(zoneCoverageRatio(zone, [station(35.15, -90.18)])).toBe(1);
    expect(gapSeverityFor(zone, [])).toBe('full');
    expect(gapSeverityFor(zone, [station(35.15, -90.18)])).toBeNull();
  });

  it('a far-away station leaves a full gap', () => {
    // ~50 km away — beyond any default 5 km radius.
    expect(gapSeverityFor(zone, [station(35.6, -90.4)])).toBe('full');
  });

  it('partial coverage when only part of the zone is in reach', () => {
    // Station ~5 km north of the zone reaches the north corners but not the
    // south corners or center (zone is ~2.2 km tall) → roughly half covered.
    const edge = station(35.20, -90.18, 5);
    const ratio = zoneCoverageRatio(zone, [edge]);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.99);
    expect(gapSeverityFor(zone, [edge])).toBe('partial');
  });

  it('landless cells are never flagged', () => {
    expect(gapSeverityFor({ ...zone, covered: false }, [])).toBeNull();
  });

  it('stationRadiusKm honors the perk-adjusted radius with a 5 km default', () => {
    expect(stationRadiusKm(station(0, 0))).toBe(5);
    expect(stationRadiusKm(station(0, 0, 7.5))).toBe(7.5);
  });
});
