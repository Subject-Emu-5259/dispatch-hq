// ============================================
// Dispatch HQ — Game-Loop Microbenchmarks
// ============================================
// Run:  pnpm --filter @dispatch-hq/web exec vitest bench
//
// Times the hot operations the two 1-second loops in App.tsx perform every
// tick, using the REAL shared helpers (haversineKm, getPositionOnPath,
// zoneIdForPoint) plus faithful reconstructions of the loop-internal math
// (copied from the tick bodies so the numbers attribute where each tick's CPU
// goes). Pure measurement — no assertions, no store writes.
//
// Heads-up: React DevTools' Profiler cannot time these — they are setInterval
// callbacks that mutate the Zustand store imperatively, so a DevTools profile
// only shows the downstream re-renders they trigger, not the tick work itself.

import { bench, describe } from 'vitest';
import { haversineKm, getPositionOnPath } from '../src/utils/roadPathfinding';
import { patrolZonesForCity, zoneIdForPoint } from '../src/lib/patrol/patrolZones';
import type { GeoPoint } from '@dispatch-hq/shared';

// ── Representative city-scale fixtures ────────────────────────────────────
// West Memphis-ish bounds, 9-zone grid, units, missions.
const BOUNDS: [[number, number], [number, number]] = [
  [35.130, -90.215],
  [35.160, -90.150],
];
const CITY_CENTER: GeoPoint = { lat: 35.1465, lng: -90.1845 };

function makeRoute(n: number, seed = 0): GeoPoint[] {
  const pts: GeoPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Wandering polyline across the city (a real OSRM route looks like this).
    pts.push({
      lat: CITY_CENTER.lat - 0.008 + 0.016 * t + 0.002 * Math.sin(i * 0.7 + seed),
      lng: CITY_CENTER.lng - 0.015 + 0.03 * t + 0.003 * Math.cos(i * 0.5 + seed),
    });
  }
  return pts;
}

const ROUTE_50 = makeRoute(50);
const ROUTE_100 = makeRoute(100);
const ROUTE_200 = makeRoute(200);

const ZONES = patrolZonesForCity({ bounds: BOUNDS, boundary: null });
const PATROL_UNITS = Array.from({ length: 8 }, (_, i) => ({
  position: makeRoute(100, i)[42],
  route: makeRoute(100, i),
}));

// Mission fixtures for the game-loop reconstruction.
const MISSIONS = Array.from({ length: 15 }, (_, i) => {
  const category = (['fire', 'police', 'ems'] as const)[i % 3];
  return {
    id: `m${i}`,
    category,
    status: i < 5 ? 'in_progress' : i < 11 ? 'en_route' : 'active',
    progress: 0.4 + (i % 5) * 0.1,
    totalTime: 600,
    timeRemaining: 120 + i * 30,
    location: { lat: CITY_CENTER.lat + 0.005 * Math.cos(i), lng: CITY_CENTER.lng + 0.008 * Math.sin(i) },
    requirements: [
      { unitType: category === 'fire' ? 'engine' : category === 'police' ? 'patrol_car' : 'ambulance', count: 1 },
      { unitType: category === 'fire' ? 'ladder' : category === 'police' ? 'patrol_car' : 'ambulance', count: 1 },
    ],
    assignedUnits: [i, i + 1, i + 2].map((x) => `unit_${x}`),
  } as any;
});

const UNITS = Array.from({ length: 20 }, (_, i) => ({
  id: `unit_${i}`,
  type: i % 3 === 0 ? 'engine' : i % 3 === 1 ? 'patrol_car' : 'ambulance',
  status: i < 8 ? 'patrolling' : i < 14 ? 'en_route' : 'available',
  position: { lat: CITY_CENTER.lat + 0.006 * Math.cos(i * 1.3), lng: CITY_CENTER.lng + 0.009 * Math.sin(i * 1.1) },
  speed: 13.9,
  waypoints: ROUTE_100,
  eta: 120,
  etaTotal: 180,
  destination: { lat: CITY_CENTER.lat + 0.01, lng: CITY_CENTER.lng + 0.01 },
} as any));

// ── Unit operations ────────────────────────────────────────────────────────
describe('unit operations', () => {
  bench('haversineKm (raw distance)', () => {
    haversineKm(CITY_CENTER, UNITS[0].position);
  });

  bench('getPositionOnPath (100-wp route, progress 0.42)', () => {
    getPositionOnPath(ROUTE_100, 0.42);
  });

  bench('zoneIdForPoint (9 zones)', () => {
    zoneIdForPoint(ZONES, UNITS[0].position);
  });

  bench('patrolZonesForCity (9-zone grid, no boundary clip)', () => {
    patrolZonesForCity({ bounds: BOUNDS, boundary: null });
  });
});

// ── The station loop's per-tick hotspot ────────────────────────────────────
// App.tsx recomputes the FULL route arc length every tick per patrolling unit
// (summing haversine over every segment) — a candidate for caching.
describe('station-loop math (per patrolling unit per tick)', () => {
  bench('full route arc-length recompute (100-wp route)', () => {
    let len = 0;
    for (let i = 1; i < ROUTE_100.length; i++) len += haversineKm(ROUTE_100[i - 1], ROUTE_100[i]);
    if (len <= 0) len = 1;
  });

  bench('arc-length + interpolation + zone attribution (one tick of patrol move)', () => {
    for (const u of PATROL_UNITS) {
      const route = u.route;
      let len = 0;
      for (let i = 1; i < route.length; i++) len += haversineKm(route[i - 1], route[i]);
      if (len <= 0) len = 1;
      const p = (0.5 + 0.001) % 1;
      const pos = getPositionOnPath(route, p);
      zoneIdForPoint(ZONES, pos);
      haversineKm(u.position, pos); // recordSpeedUpdate
    }
  });
});

// ── The game-loop tick math ────────────────────────────────────────────────
describe('game-loop math (per tick)', () => {
  bench('requirement-coverage + clear multiplier (5 in-progress missions × units)', () => {
    for (const m of MISSIONS) {
      if (m.status !== 'in_progress') continue;
      let base = 0;
      for (const uid of m.assignedUnits) {
        const u = UNITS.find((x) => x.id === uid);
        base += u ? (u.type === m.category || u.type === 'engine' || u.type === 'patrol_car' || u.type === 'ambulance' ? 1.1 : 1) : 1;
      }
      base = m.assignedUnits.length > 0 ? base / m.assignedUnits.length : 1;
      let coverage = 1;
      for (const req of m.requirements) {
        const have = m.assignedUnits.filter((uid: string) => {
          const u = UNITS.find((x) => x.id === uid);
          return u && u.type === req.unitType;
        }).length;
        coverage *= 0.5 + (0.5 * Math.min(have, req.count)) / req.count;
      }
      void base * coverage;
    }
  });

  bench('patrol sighting scan (8 patrolling units × 15 active missions)', () => {
    for (const u of PATROL_UNITS) {
      for (const m of MISSIONS) {
        if (m.status !== 'active') continue;
        haversineKm(u.position, m.location);
      }
    }
  });

  bench('en-route interpolation + ETA + speed update (6 units)', () => {
    for (const u of UNITS) {
      if (u.status !== 'en_route') continue;
      const etaTotal = Math.max(1, u.etaTotal || u.eta || 1);
      const progress = Math.max(0, Math.min(1, (etaTotal - Math.max(0, u.eta - 1)) / etaTotal));
      if (progress >= 1) continue;
      const pos = getPositionOnPath(u.waypoints, progress);
      haversineKm(u.position, pos); // recordSpeedUpdate
    }
  });
});

// ── Whole reconstructed ticks at city scale ────────────────────────────────
// Faithful copies of the two interval bodies (loop-internal math only — no
// store writes, no notifications) so the headline number is the real per-tick
// CPU cost at a busy-city scale (8 patrol units, 15 missions, 20 units).
describe('whole ticks (reconstructed)', () => {
  bench('station loop tick (20 units: 8 patrol + 6 returning + 6 available)', () => {
    const zones = patrolZonesForCity({ bounds: BOUNDS, boundary: null });
    for (const u of UNITS) {
      if (u.status !== 'patrolling') continue;
      const route = u.waypoints;
      if (!route || route.length < 2) continue;
      let len = 0;
      for (let i = 1; i < route.length; i++) len += haversineKm(route[i - 1], route[i]);
      if (len <= 0) len = 1;
      const p = (0.5 + 0.0005) % 1;
      const pos = getPositionOnPath(route, p);
      zoneIdForPoint(zones, pos);
      haversineKm(u.position, pos);
    }
  });

  bench('game loop tick (15 missions: 5 progress + 6 en-route + 4 active)', () => {
    for (const m of MISSIONS) {
      if (m.status === 'in_progress') {
        let base = 0;
        for (const uid of m.assignedUnits) {
          const u = UNITS.find((x) => x.id === uid);
          base += u ? 1.1 : 1;
        }
        base = base / Math.max(1, m.assignedUnits.length);
        let coverage = 1;
        for (const req of m.requirements) {
          const have = m.assignedUnits.filter((uid: string) => {
            const u = UNITS.find((x) => x.id === uid);
            return u && u.type === req.unitType;
          }).length;
          coverage *= 0.5 + (0.5 * Math.min(have, req.count)) / req.count;
        }
        void (base * coverage);
      } else if (m.status === 'en_route') {
        for (const uid of m.assignedUnits) {
          const u = UNITS.find((x) => x.id === uid);
          if (!u || u.status !== 'en_route') continue;
          const etaTotal = Math.max(1, u.etaTotal || u.eta || 1);
          const progress = Math.max(0, Math.min(1, (etaTotal - Math.max(0, u.eta - 1)) / etaTotal));
          if (progress >= 1) continue;
          const pos = getPositionOnPath(u.waypoints, progress);
          haversineKm(u.position, pos);
        }
      }
      // Patrol sighting scan (all patrolling units × active missions).
      if (m.status === 'active') {
        for (const u of PATROL_UNITS) haversineKm(u.position, m.location);
      }
    }
  });
});
