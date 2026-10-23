// ============================================
// Dispatch HQ — Real Road Routing (OSRM + Fallback)
// ============================================

import type { GeoPoint } from '@dispatch-hq/shared';
import { haversineKm, generateRoadPath } from './roadPathfinding';

// patrolEngine is lazy-loaded — only fetched when a patrol route is generated.
// Types are re-exported inline so callers don't need to import the engine.
export type PatrolMode = import('@/lib/patrol/patrolEngine').PatrolMode;

async function loadPatrolEngine() {
  return import('@/lib/patrol/patrolEngine');
}

// Routing endpoints — the game's own origin ONLY: servers/game-server/src/
// routes/mapData.ts proxies /routing/* to OSRM with a disk cache, so the
// browser never talks to a third-party routing host. If the proxy is
// unreachable the street-grid fallback below covers total outage (v0.23.2).
const OSRM_ENDPOINTS = ['/routing/route/v1/driving'];

const OSRM_NEAREST_ENDPOINTS = ['/routing/nearest/v1/driving'];

export interface DrivingRoute {
  waypoints: GeoPoint[];
  distanceKm: number;
  durationSec: number;
  source: 'osrm' | 'roadpath' | 'fallback' | 'grid';
}

// Simple in-memory cache so repeated routes don't hammer OSRM and can recover
// from a single slow/timeout response on the next request.
type CacheKey = string;
interface CachedRoute {
  route: DrivingRoute;
  ts: number;
}
const routeCache = new Map<CacheKey, CachedRoute>();
const snapCache = new Map<string, { point: GeoPoint; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(a: GeoPoint, b: GeoPoint): CacheKey {
  // Round to ~1m precision for cache stability
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return `${round(a.lat)},${round(a.lng)}->${round(b.lat)},${round(b.lng)}`;
}

function getCached(key: CacheKey): DrivingRoute | null {
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return hit.route;
}

function setCached(key: CacheKey, route: DrivingRoute): void {
  routeCache.set(key, { route, ts: Date.now() });
}

/**
 * Snap a point to the nearest drivable road using OSRM.
 * Falls back to the original point if OSRM is unavailable.
 */
export async function snapPointToRoad(point: GeoPoint): Promise<GeoPoint> {
  const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  const cached = snapCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.point;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  for (const endpoint of OSRM_NEAREST_ENDPOINTS) {
    try {
      const url = `${endpoint}/${point.lng},${point.lat}?number=1`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      const data = await res.json();
      const loc = data.waypoints?.[0]?.location;
      if (loc && Array.isArray(loc) && loc.length >= 2) {
        const snapped: GeoPoint = { lat: loc[1], lng: loc[0] };
        snapCache.set(key, { point: snapped, ts: Date.now() });
        return snapped;
      }
    } catch {
      // try next endpoint
    }
  }

  clearTimeout(timer);
  snapCache.set(key, { point, ts: Date.now() });
  return point;
}

function deterministic(s: number): () => number {
  let v = s % 2147483647;
  if (v <= 0) v += 2147483646;
  return () => {
    v = (v * 16807) % 2147483647;
    return (v - 1) / 2147483646;
  };
}

/**
 * Generate a city-grid-style fallback path.
 * Emergencies don't usually fly through city blocks diagonally; this creates a
 * dense, orthogonal path that follows approximate street grain instead of a
 * straight line through buildings.
 */
export function generateGridRoadPath(start: GeoPoint, end: GeoPoint, seed = Date.now()): { waypoints: GeoPoint[]; totalDistanceKm: number } {
  if (start.lat === end.lat && start.lng === end.lng) {
    return { waypoints: [{ ...start }, { ...end }], totalDistanceKm: 0 };
  }
  const rand = deterministic(seed + Math.round(start.lat * 100000) + Math.round(end.lng * 100000));
  const midLat = start.lat + (end.lat - start.lat) * (0.4 + rand() * 0.2);
  const midLng = start.lng + (end.lng - start.lng) * (0.4 + rand() * 0.2);

  // Two segments: start -> (midLat, start.lng) -> (midLat, end.lng) -> end.
  const corners: GeoPoint[] = [
    { lat: midLat, lng: start.lng },
    { lat: midLat, lng: end.lng },
  ];

  const allPoints: GeoPoint[] = [{ ...start }];
  let prev = start;
  for (const corner of corners) {
    const d = haversineKm(prev, corner);
    if (d < 0.02) {
      allPoints.push({ ...corner });
    } else {
      const steps = Math.max(2, Math.ceil((d * 1000) / 80));
      for (let i = 1; i <= steps; i++) {
        allPoints.push({
          lat: prev.lat + (corner.lat - prev.lat) * (i / steps),
          lng: prev.lng + (corner.lng - prev.lng) * (i / steps),
        });
      }
    }
    prev = corner;
  }
  // final leg
  const finalD = haversineKm(prev, end);
  if (finalD < 0.02) {
    allPoints.push({ ...end });
  } else {
    const steps = Math.max(2, Math.ceil((finalD * 1000) / 80));
    for (let i = 1; i <= steps; i++) {
      allPoints.push({
        lat: prev.lat + (end.lat - prev.lat) * (i / steps),
        lng: prev.lng + (end.lng - prev.lng) * (i / steps),
      });
    }
  }

  const deduped: GeoPoint[] = [];
  for (const p of allPoints) {
    const last = deduped[deduped.length - 1];
    if (!last || haversineKm(last, p) > 0.00001) {
      deduped.push(p);
    }
  }
  const totalDistanceKm = deduped.length >= 2
    ? deduped.slice(1).reduce((sum, p, i) => sum + haversineKm(deduped[i], p), 0)
    : 0;
  return { waypoints: deduped.length >= 2 ? deduped : [{ ...start }, { ...end }], totalDistanceKm };
}

function buildFallbackRoute(start: GeoPoint, end: GeoPoint, unitSpeedMs: number): DrivingRoute {
  const path = generateGridRoadPath(start, end);
  const durationSec = Math.max(1, Math.round((path.totalDistanceKm * 1000) / unitSpeedMs));
  return {
    waypoints: path.waypoints,
    distanceKm: path.totalDistanceKm,
    durationSec,
    source: 'grid',
  };
}

async function fetchOsrmFromEndpoint(endpoint: string, start: GeoPoint, end: GeoPoint, timeoutMs: number): Promise<DrivingRoute> {
  const req = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = `${endpoint}/${req}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates) throw new Error('No route geometry');
    const waypoints: GeoPoint[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng }),
    );
    if (waypoints.length < 2) throw new Error('Route too short');
    const distanceKm = route.distance / 1000;
    const durationSec = Math.max(1, Math.round(route.duration));
    return { waypoints, distanceKm, durationSec, source: 'osrm' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDrivingRoute(
  start: GeoPoint,
  end: GeoPoint,
  unitSpeedMs = 13.9,
): Promise<DrivingRoute> {
  const key = cacheKey(start, end);
  const cached = getCached(key);
  if (cached) return cached;

  // Try each OSRM endpoint with a short timeout; fall back immediately on failure.
  for (const endpoint of OSRM_ENDPOINTS) {
    try {
      const route = await fetchOsrmFromEndpoint(endpoint, start, end, 4000);
      setCached(key, route);
      return route;
    } catch {
      // try next endpoint
    }
  }

  // OSRM unavailable — use a city-grid fallback so units follow plausible roads.
  const fallback = buildFallbackRoute(start, end, unitSpeedMs);
  setCached(key, fallback);
  return fallback;
}

// ============================================
// Immersive Patrol Route Generator
// ============================================

export interface PatrolRouteOptions {
  mode?: PatrolMode;
  cityCenter?: GeoPoint;
  cityRadiusKm?: number;
  /** Precise city bounds so patrol zones/clamps align with the real city. */
  cityBounds?: [[number, number], [number, number]] | null;
  /** Precise city limits polygon — patrol stops stay inside it. */
  boundary?: GeoPoint[][] | null;
  missions?: { location: GeoPoint; category: string; difficulty: number }[];
  /** Specific zone id to patrol (zone mode). */
  targetZoneId?: string | null;
}

/**
 * Generate a patrol route.
 * - With cityCenter/cityRadiusKm/missions passed in, it builds a longer, crime-aware,
 *   city-wide route where each call gets a unique path.
 * - With only the legacy arguments, it falls back to a short beat around the station.
 */
export async function generatePatrolRoute(
  stationPos: GeoPoint,
  seed = Date.now(),
  beatIndex = 0,
  opts: PatrolRouteOptions = {},
): Promise<GeoPoint[]> {
  const { mode, cityCenter, cityRadiusKm, cityBounds, boundary, missions, targetZoneId } = opts;

  // Legacy low-information call: short neighborhood loop.
  if (!cityCenter || !cityRadiusKm) {
    return generateStationBeat(stationPos, seed, beatIndex);
  }

  const engine = await loadPatrolEngine();
  const selectedMode: PatrolMode = mode ?? engine.suggestPatrolMode(missions?.length ?? 0, cityRadiusKm);

  return engine.planPatrolRoute(seed.toString() + beatIndex, {
    mode: selectedMode,
    cityCenter,
    cityRadiusKm,
    cityBounds,
    boundary,
    targetZoneId,
    missions:
      missions?.map((m) => ({
        id: '',
        templateId: '',
        name: '',
        description: '',
        category: m.category as any,
        icon: '',
        status: 'active' as const,
        location: m.location,
        poiType: '',
        difficulty: m.difficulty,
        creditsReward: 0,
        xpReward: 0,
        requirements: [],
        assignedUnits: [],
        progress: 0,
        timeRemaining: 0,
        totalTime: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      })) ?? [],
    station: stationPos,
  });
}

/** Build a varied rectangular/block-style patrol beat around a station.
 *  Each beatIndex produces a different direction and size so units don't stack.
 */
async function generateStationBeat(stationPos: GeoPoint, seed = Date.now(), beatIndex = 0): Promise<GeoPoint[]> {
  function deterministic(s: number): () => number {
    let v = s % 2147483647;
    if (v <= 0) v += 2147483646;
    return () => {
      v = (v * 16807) % 2147483647;
      return (v - 1) / 2147483646;
    };
  }

  const rand = deterministic(seed + beatIndex * 7919);
  const legCount = 4 + Math.floor(rand() * 2); // 4-5 legs

  const baseAngle = (beatIndex % 4) * (Math.PI / 2) + rand() * 0.5;
  const baseRadius = 0.0016 + (beatIndex % 3) * 0.0006 + rand() * 0.0015; // ~180-420m
  const startAngle = baseAngle + rand() * 0.4;

  const corners: GeoPoint[] = [];
  for (let i = 0; i < legCount; i++) {
    const angle = startAngle + (i / legCount) * Math.PI * 2 + (rand() - 0.5) * 0.3;
    const radius = baseRadius * (0.8 + rand() * 0.4);
    corners.push({
      lat: stationPos.lat + Math.cos(angle) * radius,
      lng: stationPos.lng + Math.sin(angle) * radius,
    });
  }

  const loop: GeoPoint[] = [{ ...stationPos }];
  let prev = stationPos;
  for (const corner of corners) {
    try {
      const route = await fetchDrivingRoute(prev, corner, 5.5);
      const legs = route.waypoints.slice(1);
      if (legs.length > 0) loop.push(...legs);
      prev = corner;
    } catch {
      const fb = generateRoadPath(prev, corner).waypoints.slice(1);
      if (fb.length > 0) loop.push(...fb);
      prev = corner;
    }
  }

  // Return leg from last corner back to station
  try {
    const route = await fetchDrivingRoute(prev, stationPos, 5.5);
    const legs = route.waypoints.slice(1);
    if (legs.length > 0) loop.push(...legs);
  } catch {
    const fb = generateRoadPath(prev, stationPos).waypoints.slice(1);
    if (fb.length > 0) loop.push(...fb);
  }

  const deduped: GeoPoint[] = [];
  for (const w of loop) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.lat - w.lat) > 1e-7 || Math.abs(last.lng - w.lng) > 1e-7) {
      deduped.push(w);
    }
  }
  return deduped.length >= 2 ? deduped : [{ ...stationPos }, { lat: stationPos.lat + 0.002, lng: stationPos.lng }];
}

/** @deprecated Use generatePatrolRoute for varied beats. */
export async function generateRoadPatrolRoute(stationPos: GeoPoint): Promise<GeoPoint[]> {
  return generatePatrolRoute(stationPos, 999);
}

/** Map a unit/vehicle type to its primary emergency service. */
export function getUnitServiceType(type: string | null | undefined): 'fire' | 'police' | 'ems' {
  const t = type ?? '';
  if (t.includes('engine') || t.includes('ladder') || t.includes('rescue') || t.includes('battalion') || t.includes('fire_ambulance')) return 'fire';
  if (t.includes('ambulance') || t.includes('paramedic') || t.includes('medic')) return 'ems';
  return 'police';
}
