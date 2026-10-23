import { describe, expect, it, vi } from 'vitest';

// The planner resolves street segments through the OSRM-backed fetchDrivingRoute;
// stub it so route planning never touches the network in tests.
vi.mock('@/utils/routing', () => ({
  fetchDrivingRoute: vi.fn(
    async (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => ({
      waypoints: [a, b],
      durationSec: 10,
      distanceKm: 0.1,
    }),
  ),
}));

import { planPatrolRoute, suggestPatrolMode } from './patrolEngine';

const CITY = { lat: 34.74, lng: -92.28 };
const STATION = { lat: 34.75, lng: -92.29 };

describe('suggestPatrolMode', () => {
  it('focuses hotspots in a big, busy city', () => {
    expect(suggestPatrolMode(9, 10)).toBe('hotspot');
  });

  it('sweeps a big, spread-out city', () => {
    expect(suggestPatrolMode(2, 8)).toBe('city-sweep');
  });

  it('patrols a heat-weighted zone in a busy mid-size city', () => {
    expect(suggestPatrolMode(5, 5)).toBe('zone');
  });

  it('falls back to a station beat in a quiet or small city', () => {
    expect(suggestPatrolMode(1, 4)).toBe('station-beat');
    expect(suggestPatrolMode(0, 2)).toBe('station-beat');
  });
});

describe('planPatrolRoute', () => {
  const baseConfig = {
    cityCenter: CITY,
    cityRadiusKm: 5,
    cityBounds: null,
    boundary: null,
    missions: [],
    station: STATION,
    targetZoneId: null,
  };

  it('returns a usable route for every patrol mode', async () => {
    for (const mode of ['station-beat', 'zone', 'hotspot', 'city-sweep'] as const) {
      const route = await planPatrolRoute('unit-1', { ...baseConfig, mode });
      expect(route.length, `${mode} route`).toBeGreaterThanOrEqual(2);
      // Every stop stays on the map (sane lat/lng, not NaN).
      for (const p of route) {
        expect(Number.isFinite(p.lat)).toBe(true);
        expect(Number.isFinite(p.lng)).toBe(true);
      }
    }
  });

  it('loops back near the station for a station beat', async () => {
    const route = await planPatrolRoute('unit-2', { ...baseConfig, mode: 'station-beat' });
    const first = route[0];
    const last = route[route.length - 1];
    const dLat = Math.abs(first.lat - last.lat);
    const dLng = Math.abs(first.lng - last.lng);
    expect(dLat).toBeLessThan(0.01);
    expect(dLng).toBeLessThan(0.01);
  });
});
