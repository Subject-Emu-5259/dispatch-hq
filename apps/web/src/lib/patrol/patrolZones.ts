// ============================================
// Dispatch HQ — City Zone / Crime Heat System
// ============================================
// Splits the playable city area into directional neighborhoods and computes
// a dynamic "heat" score from active missions. This heat drives patrol routing
// so units naturally flow toward trouble spots while still covering the city.
//
// Coordinate order: [lat, lng] for bounds.
// ============================================

import type { GeoPoint, Mission } from '@dispatch-hq/shared';
import { clipBoundaryToRect, polygonCentroid } from '@/data/cityBoundaries';

export interface CityZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  bounds: { latMin: number; latMax: number; lngMin: number; lngMax: number };
  direction: 'north' | 'south' | 'east' | 'west' | 'central' | 'northeast' | 'northwest' | 'southeast' | 'southwest';
  /** False when this bbox cell has no land inside the city polygon (e.g. the
   *  corner cells that stick past the city line into neighboring towns). */
  covered: boolean;
  /** Precise city footprint inside this cell (clipped ring), when a boundary exists. */
  polygon?: GeoPoint[];
}

const DIRECTION_NAMES: Record<string, string> = {
  north: 'Uptown',
  south: 'Southside',
  east: 'East End',
  west: 'Westside',
  central: 'Downtown',
  northeast: 'Northeast Heights',
  northwest: 'Northwest District',
  southeast: 'Southeast Industrial',
  southwest: 'Southwest Quarter',
};

const GRID: { id: string; dir: CityZone['direction']; latRow: number; lngCol: number }[] = [
  { id: 'nw', dir: 'northwest', latRow: 2, lngCol: 0 },
  { id: 'n',  dir: 'north',     latRow: 2, lngCol: 1 },
  { id: 'ne', dir: 'northeast', latRow: 2, lngCol: 2 },
  { id: 'w',  dir: 'west',      latRow: 1, lngCol: 0 },
  { id: 'c',  dir: 'central',   latRow: 1, lngCol: 1 },
  { id: 'e',  dir: 'east',      latRow: 1, lngCol: 2 },
  { id: 'sw', dir: 'southwest', latRow: 0, lngCol: 0 },
  { id: 's',  dir: 'south',     latRow: 0, lngCol: 1 },
  { id: 'se', dir: 'southeast', latRow: 0, lngCol: 2 },
];

/**
 * Split the city's actual map bounds into 9 directional zones so the heat
 * overlay, patrol targeting, and mission spawn hints align with the real
 * geography (Westside covers the west side of the city, Downtown the center,
 * etc.) instead of a radius circle that spills past the city limits. When a
 * precise boundary polygon is supplied, each cell is clipped to the city's
 * actual footprint so nothing paints into neighboring towns.
 */
export function generateCityZonesFromBounds(
  bounds: [[number, number], [number, number]],
  boundary?: GeoPoint[][] | null,
): CityZone[] {
  const [[latMin, lngMin], [latMax, lngMax]] = bounds;
  const dLat = (latMax - latMin) / 3;
  const dLng = (lngMax - lngMin) / 3;

  return GRID.map((g) => {
    const latA = latMin + g.latRow * dLat;
    const latB = latA + dLat;
    const lngA = lngMin + g.lngCol * dLng;
    const lngB = lngA + dLng;
    const zoneBounds = { latMin: latA, latMax: latB, lngMin: lngA, lngMax: lngB };
    const polygon = boundary ? clipBoundaryToRect(boundary, zoneBounds) : null;
    const covered = polygon ? true : boundary ? false : true;
    const center = polygon
      ? polygonCentroid(polygon)
      : { lat: (latA + latB) / 2, lng: (lngA + lngB) / 2 };
    return {
      id: g.id,
      name: DIRECTION_NAMES[g.dir],
      direction: g.dir,
      center,
      bounds: zoneBounds,
      covered,
      polygon: polygon ?? undefined,
    };
  });
}

/**
 * Pick the best zone set for whatever geometry the caller has. When precise
 * map bounds exist (always in-game), zones align to the city; otherwise fall
 * back to a center+radius circle layout.
 */
export function patrolZonesForCity(input: {
  bounds?: [[number, number], [number, number]] | null;
  center?: { lat: number; lng: number };
  radiusKm?: number;
  /** Precise city limits polygon — cells are clipped to it when present. */
  boundary?: GeoPoint[][] | null;
}): CityZone[] {
  if (input.bounds && Array.isArray(input.bounds) && input.bounds.length === 2) {
    return generateCityZonesFromBounds(input.bounds, input.boundary);
  }
  return generateCityZones(input.center ?? { lat: 0, lng: 0 }, input.radiusKm ?? 8);
}

/** Split a city area into 9 directional zones from a center point (fallback). */
export function generateCityZones(
  center: { lat: number; lng: number },
  radiusKm: number,
): CityZone[] {
  const degPerKmLat = 1 / 111;
  const degPerKmLng = 1 / (111 * Math.cos(center.lat * (Math.PI / 180)) || 1);
  const dLat = radiusKm * degPerKmLat;
  const dLng = radiusKm * degPerKmLng;

  const thirdsLat = dLat / 3;
  const thirdsLng = dLng / 3;

  return GRID.map((g) => {
    const latMin = center.lat - dLat + g.latRow * thirdsLat;
    const latMax = latMin + thirdsLat;
    const lngMin = center.lng - dLng + g.lngCol * thirdsLng;
    const lngMax = lngMin + thirdsLng;
    return {
      id: g.id,
      name: DIRECTION_NAMES[g.dir],
      direction: g.dir,
      center: { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2 },
      bounds: { latMin, latMax, lngMin, lngMax },
      covered: true,
    };
  });
}

/**
 * Return the id of the zone containing the point, or null. Used for mission
 * spawn attribution and per-zone patrol coverage accounting.
 */
export function zoneIdForPoint(
  zones: CityZone[] | null,
  point: { lat: number; lng: number },
): string | null {
  if (!zones) return null;
  return zones.find(
    (z) => point.lat >= z.bounds.latMin && point.lat <= z.bounds.latMax && point.lng >= z.bounds.lngMin && point.lng <= z.bounds.lngMax,
  )?.id ?? null;
}

/** Count active missions inside each zone to produce patrol heat. */
export function computeZoneHeat(zones: CityZone[], missions: Mission[]): Map<string, number> {
  const heat = new Map<string, number>();
  zones.forEach((z) => heat.set(z.id, 0));

  for (const m of missions) {
    if (!m.location || m.status === 'completed' || m.status === 'failed') continue;
    for (const z of zones) {
      const { lat, lng } = m.location;
      if (lat >= z.bounds.latMin && lat <= z.bounds.latMax && lng >= z.bounds.lngMin && lng <= z.bounds.lngMax) {
        heat.set(z.id, (heat.get(z.id) ?? 0) + 1 + (m.difficulty || 1) * 0.3);
        break;
      }
    }
  }

  return heat;
}

/** Return the hottest zone, or a random zone when no heat exists. */
export function pickWeightedZone(zones: CityZone[], heat: Map<string, number>, rand01: () => number): CityZone {
  if (zones.length === 0) {
    return { id: 'c', name: 'Downtown', direction: 'central', center: { lat: 0, lng: 0 }, bounds: { latMin: -1, latMax: 1, lngMin: -1, lngMax: 1 }, covered: true };
  }
  // Never target bbox cells with no city land (they'd send units into the next town).
  const usable = zones.filter((z) => z.covered !== false);
  const pool = usable.length > 0 ? usable : zones;
  const weights = pool.map((z) => {
    const h = heat.get(z.id) ?? 0;
    return Math.max(0.2, h);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand01() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Pick two distinct zones with weighted probability. */
export function pickTwoWeightedZones(
  zones: CityZone[],
  heat: Map<string, number>,
  rand01: () => number,
): [CityZone, CityZone] {
  const first = pickWeightedZone(zones, heat, rand01);
  const rest = zones.filter((z) => z.id !== first.id && z.covered !== false);
  if (rest.length === 0) return [first, first];
  const second = pickWeightedZone(rest, heat, rand01);
  return [first, second];
}
