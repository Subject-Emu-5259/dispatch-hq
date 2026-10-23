// ============================================
// Dispatch HQ — Patrol Engine (Revamp)
// ============================================
// Handles patrol route planning for the revamped patrol system.
// - Routes are longer, city-wide, and follow real roads when possible.
// - Routes depend on active mission density (crime heat) and city zones.
// - Each unit receives its own seed so identical starting areas still diverge.
// - Multiple modes: station-beat, zone-patrol, hotspot, city-sweep.
// ============================================

import type { GeoPoint, Mission } from '@dispatch-hq/shared';
import { fetchDrivingRoute } from '@/utils/routing';
import { haversineKm, generateRoadPath } from '@/utils/roadPathfinding';
import { clampToBoundary } from '@/data/cityBoundaries';
import { generateCityZones, generateCityZonesFromBounds, computeZoneHeat, pickWeightedZone, pickTwoWeightedZones, type CityZone } from './patrolZones';

export type PatrolMode = 'station-beat' | 'zone' | 'hotspot' | 'city-sweep';

export interface PatrolAssignment {
  unitId: string;
  mode: PatrolMode;
  /** Preferred zones by id (zone/hotspot modes). */
  targetZones: string[];
  /** If true, unit returns to station after a mission. If false, returns to patrol. */
  returnToStationAfterMission: boolean;
  /** Shift length in seconds before the route is regenerated. */
  shiftSeconds: number;
}

export interface PatrolConfig {
  mode: PatrolMode;
  /** City center lat/lng. */
  cityCenter: GeoPoint;
  /** Radius in km the patrol should cover. */
  cityRadiusKm: number;
  /** Precise city map bounds — zones/clamps align to the real city when present. */
  cityBounds?: [[number, number], [number, number]] | null;
  /** Precise city limits polygon — route stops are pulled inside it when present. */
  boundary?: GeoPoint[][] | null;
  /** Active missions used to weight high-crime zones. */
  missions: Mission[];
  /** Station the unit originates from. */
  station: GeoPoint;
  /** When set (zone mode), patrol this specific zone instead of a weighted pick. */
  targetZoneId?: string | null;
}

interface MutableRandom {
  next: () => number;
}

function makeRand(seed: number): MutableRandom {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return {
    next: () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    },
  };
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

function jitter(point: GeoPoint, rand: MutableRandom, radiusM: number): GeoPoint {
  const degLat = 1 / 111000;
  const degLng = 1 / (111000 * Math.cos(point.lat * (Math.PI / 180)) || 1);
  const r = Math.sqrt(rand.next()) * radiusM;
  const theta = rand.next() * Math.PI * 2;
  return {
    lat: point.lat + r * Math.cos(theta) * degLat,
    lng: point.lng + r * Math.sin(theta) * degLng,
  };
}

function pointAlongBearing(start: GeoPoint, bearingDeg: number, distanceM: number): GeoPoint {
  const R = 6371000;
  const lat1 = (start.lat * Math.PI) / 180;
  const lng1 = (start.lng * Math.PI) / 180;
  const bearing = (bearingDeg * Math.PI) / 180;
  const d = distanceM / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

function dedupe(points: GeoPoint[], minDeg = 1e-7): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.lat - p.lat) > minDeg || Math.abs(last.lng - p.lng) > minDeg) {
      out.push(p);
    }
  }
  return out;
}

function clampToBounds(point: GeoPoint, radiusKm: number, center: GeoPoint, cityBounds?: [[number, number], [number, number]] | null): GeoPoint {
  if (cityBounds) {
    const [[latMin, lngMin], [latMax, lngMax]] = cityBounds;
    const marginLat = (latMax - latMin) * 0.02;
    const marginLng = (lngMax - lngMin) * 0.02;
    return {
      lat: Math.max(latMin + marginLat, Math.min(latMax - marginLat, point.lat)),
      lng: Math.max(lngMin + marginLng, Math.min(lngMax - marginLng, point.lng)),
    };
  }
  const d = haversineKm(center, point);
  if (d <= radiusKm) return point;
  const bearing =
    (Math.atan2(point.lng - center.lng, point.lat - center.lat) * 180) / Math.PI;
  return pointAlongBearing(center, bearing, radiusKm * 1000);
}

async function routeBetween(a: GeoPoint, b: GeoPoint, speedMs = 5.5): Promise<GeoPoint[]> {
  try {
    const r = await fetchDrivingRoute(a, b, speedMs);
    // Same fallback as dispatched units: a dense, smoothly-interpolated path so
    // patrol legs never render as crude L-shapes that cut across neighborhoods.
    return r.waypoints.length >= 2 ? r.waypoints : generateRoadPath(a, b).waypoints;
  } catch {
    return generateRoadPath(a, b).waypoints;
  }
}

async function buildRoutePoints(
  stops: GeoPoint[],
  speedMs = 5.5,
  closeLoop = false,
): Promise<GeoPoint[]> {
  if (stops.length === 0) return [];
  const pairs: [GeoPoint, GeoPoint][] = [];
  for (let i = 1; i < stops.length; i++) pairs.push([stops[i - 1], stops[i]]);
  if (closeLoop && stops.length > 2) pairs.push([stops[stops.length - 1], stops[0]]);

  // Resolve all street segments in parallel so a slow OSRM response on one leg
  // doesn't stall the whole route; each leg falls back to a road-grain grid.
  const segments = await Promise.all(pairs.map(([a, b]) => routeBetween(a, b, speedMs)));

  const all: GeoPoint[] = [{ ...stops[0] }];
  for (const seg of segments) all.push(...seg.slice(1));
  return dedupe(all);
}

/** Generate a unique patrol route using crime-heat and city zones. */
export async function planPatrolRoute(
  unitId: string,
  config: PatrolConfig,
): Promise<GeoPoint[]> {
  const { mode, cityCenter, cityRadiusKm, cityBounds, boundary, missions, station, targetZoneId } = config;
  const seed = Date.now() + hashString(unitId);
  const rand = makeRand(seed);

  // Align zones to the real city footprint when bounds exist.
  const zones = cityBounds
    ? generateCityZonesFromBounds(cityBounds, boundary)
    : generateCityZones(cityCenter, cityRadiusKm);
  const heat = computeZoneHeat(zones, missions);
  const pickable = zones.filter((z) => z.covered !== false);
  // Heat ranking only considers zones with actual city land (uncovered cells can
  // never hold missions, and this keeps the hotspot branch robust even if a
  // future spawn path forgets the boundary check).
  const sortedZones = [...pickable].sort((a, b) => (heat.get(b.id) ?? 0) - (heat.get(a.id) ?? 0));

  // Clamp a stop to the map bounds AND pull it inside the city polygon so patrol
  // routes never run through neighboring towns (bbox corners past the city line).
  const clampStop = (p: GeoPoint): GeoPoint => {
    const clamped = clampToBounds(p, cityRadiusKm, cityCenter, cityBounds);
    return boundary ? clampToBoundary(clamped, boundary) : clamped;
  };



  if (mode === 'station-beat') {
    // Legacy short beat around station, but still unique per unit.
    const beatCount = 4 + Math.floor(rand.next() * 3); // 4-6
    const baseAngle = rand.next() * Math.PI * 2;
    const baseRadius = 0.15 + rand.next() * 0.25; // km
    const radiusM = baseRadius * 1000;
    const stops: GeoPoint[] = [];
    for (let i = 0; i < beatCount; i++) {
      const bearing = baseAngle + (i / beatCount) * 360 + (rand.next() - 0.5) * 30;
      stops.push(clampStop(pointAlongBearing(station, bearing, radiusM)));
    }
    const loop = await buildRoutePoints([station, ...stops], 5.5, true);
    return loop;
  }

  // For zone / hotspot / city-sweep we always produce longer routes.
  let targetZones: CityZone[];

  if (mode === 'zone') {
    // Explicit zone assignment wins; otherwise pick a weighted (heat-aware) zone.
    const explicit = targetZoneId ? zones.find((z) => z.id === targetZoneId && z.covered !== false) : undefined;
    targetZones = explicit ? [explicit] : [pickWeightedZone(zones, heat, () => rand.next())];
  } else if (mode === 'hotspot') {
    // Two weighted zones when heat exists; otherwise fall back to hottest zones.
    if ((heat.get(sortedZones[0].id) ?? 0) > 0) {
      targetZones = pickTwoWeightedZones(zones, heat, () => rand.next());
    } else {
      const first = pickable[0] ?? sortedZones[0];
      const second = pickable[1 % pickable.length] ?? sortedZones[1 % sortedZones.length];
      targetZones = [first, second];
    }
  } else {
    // city-sweep: long route across the whole city using 4-6 random-distributed waypoints.
    const sweepCount = 4 + Math.floor(rand.next() * 3);
    const pool = pickable.length > 0 ? pickable : zones;
    targetZones = [];
    for (let i = 0; i < sweepCount; i++) {
      targetZones.push(pool[Math.floor(rand.next() * pool.length)]);
    }
  }

  // Anchor the route near (but not exactly at) the station, then visit hot zones.
  const stops: GeoPoint[] = [clampStop(jitter(station, rand, 200))];

  for (const zone of targetZones) {
    // Jitter the zone center so same-zone units get unique paths.
    const p = jitter(zone.center, rand, 600);
    stops.push(clampStop(p));
  }

  // Close with a stop on the far side of the city for length, then drift back.
  if (mode === 'city-sweep') {
    const farBearing = rand.next() * 360;
    const farPoint = pointAlongBearing(cityCenter, farBearing, cityRadiusKm * 0.85 * 1000);
    stops.push(clampStop(farPoint));
    const returnZone = (pickable[Math.floor(rand.next() * pickable.length)] ?? zones[0]);
    stops.push(clampStop(jitter(returnZone.center, rand, 600)));
  }

  // Partial loop: route back to near station to repeat if the caller loops the index.
  stops.push(clampStop(jitter(station, rand, 300)));

  const route = await buildRoutePoints(stops, 6.7, false);
  return route.length >= 2 ? route : generateRoadPath(station, cityCenter).waypoints;
}

/** Pick the route mode that best fits the current situation. */
export function suggestPatrolMode(
  activeMissions: number,
  cityRadiusKm: number,
): PatrolMode {
  // Big, busy city → focus the hottest neighborhoods.
  if (activeMissions >= 8 && cityRadiusKm > 3) return 'hotspot';
  // Big, spread-out city → cover the whole footprint.
  if (cityRadiusKm > 6) return 'city-sweep';
  // Busy mid-size city → patrol a heat-weighted zone.
  if (activeMissions >= 4) return 'zone';
  // Quiet/small city → a short station beat beats a fake city-wide loop.
  return 'station-beat';
}

/** Re-export helpers so callers can inspect zones without extra imports. */
export { generateCityZones, generateCityZonesFromBounds, computeZoneHeat, type CityZone };
