// Dispatch HQ — Precise City Boundaries
// ================================================
// Source: U.S. Census Bureau TIGER/Line 2022 Place shapefile for West Memphis, AR.
// Coordinates are GeoPoint objects { lat, lng }.
// Each boundary array is [outerRing, ...holes].

import type { GeoPoint } from '@dispatch-hq/shared';

export interface CityBoundary {
  name: string;
  bounds: [[number, number], [number, number]];
  rings: GeoPoint[][];
}

// ── Lazy boundary data (loaded on first access) ──
// The raw coordinate arrays (~200KB) are in a separate chunk so the initial
// bundle stays lean.  All functions below work synchronously after the first
// call triggers the import.

let _boundaryData: Record<string, CityBoundary> | null = null;
let _loadPromise: Promise<Record<string, CityBoundary>> | null = null;

async function ensureBoundaryData(): Promise<Record<string, CityBoundary>> {
  if (_boundaryData) return _boundaryData;
  if (!_loadPromise) {
    _loadPromise = import('./cityBoundaryData').then((m) => {
      _boundaryData = m.NORMALIZED_BOUNDARIES;
      return _boundaryData!;
    });
  }
  return _loadPromise;
}

// Synchronous accessor — returns cached data or undefined if not yet loaded.
// Called from sync code paths (game loop, patrol); data is guaranteed loaded by
// the time gameplay starts because ensureBoundaryData() is awaited in the boot flow.
function getBoundarySync(): Record<string, CityBoundary> | undefined {
  return _boundaryData ?? undefined;
}

// Preload boundary data at boot (non-blocking).  By the time the player
// reaches city-select or starts a game, the data is cached.
void ensureBoundaryData();

/** Preload boundary data synchronously (for tests). */
export async function preloadBoundaryData(): Promise<void> {
  await ensureBoundaryData();
}

export function getCityBoundary(name: string, country?: string): CityBoundary | undefined {
  const data = getBoundarySync();
  if (!data) return undefined;
  function normalizeKey(n: string, c?: string): string {
    return (n + '-' + (c || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  const base = name.replace(/,\s*(AR|Arkansas)\s*$/i, '').trim();
  const candidates = [name, `${name}-${country || ''}`, base, `${base}-${country || ''}`];
  for (const c of candidates) {
    const key = normalizeKey(c, '');
    if (data[key]) return data[key];
  }
  return undefined;
}

function pointInRing(point: GeoPoint, ring: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    const intersect =
      ((pi.lat > point.lat) !== (pj.lat > point.lat)) && (point.lng < ((pj.lng - pi.lng) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lng);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInBoundary(point: GeoPoint, boundary: CityBoundary | GeoPoint[][] | undefined): boolean {
  if (!boundary) return true;
  const rings = Array.isArray(boundary) ? boundary : boundary.rings;
  if (!rings || rings.length === 0) return true;
  if (!pointInRing(point, rings[0])) return false;
  // Holes (inner rings) exclude the point
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(point, rings[h])) return false;
  }
  return true;
}

export function boundaryForCityData(city: { name: string; country?: string; state?: string }): CityBoundary | undefined {
  return getCityBoundary(city.name, city.country) || getCityBoundary(city.name + (city.state ? ', ' + city.state : ''), city.country);
}

export function boundaryBbox(boundary: CityBoundary | GeoPoint[][] | undefined): [[number, number], [number, number]] | null {
  if (!boundary) return null;
  const rings = Array.isArray(boundary) ? boundary : boundary.rings;
  const outer = rings[0];
  if (!outer?.length) return null;
  let minLat = outer[0].lat, maxLat = outer[0].lat;
  let minLng = outer[0].lng, maxLng = outer[0].lng;
  for (const p of outer) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return [[minLat, minLng], [maxLat, maxLng]];
}

export function polygonCentroid(ring: GeoPoint[]): GeoPoint {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    const cross = pj.lng * pi.lat - pi.lng * pj.lat;
    a += cross;
    x += (pj.lng + pi.lng) * cross;
    y += (pj.lat + pi.lat) * cross;
  }
  if (Math.abs(a) < 1e-12) return ring[0];
  a *= 0.5;
  const factor = 1 / (6 * a);
  return { lat: y * factor, lng: x * factor };
}

function centroidForBoundary(boundary: CityBoundary | GeoPoint[][]): GeoPoint {
  const rings = Array.isArray(boundary) ? boundary : boundary.rings;
  return polygonCentroid(rings[0]);
}

export interface BboxRect {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

function lineIntersection(p1: GeoPoint, p2: GeoPoint, e1: GeoPoint, e2: GeoPoint): GeoPoint {
  const dx1 = p2.lat - p1.lat;
  const dy1 = p2.lng - p1.lng;
  const dx2 = e2.lat - e1.lat;
  const dy2 = e2.lng - e1.lng;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-18) return { ...p2 }; // parallel — bail to the endpoint
  const t = ((e1.lat - p1.lat) * dy2 - (e1.lng - p1.lng) * dx2) / denom;
  return { lat: p1.lat + t * dx1, lng: p1.lng + t * dy1 };
}

/**
 * Sutherland–Hodgman: clip a subject ring (any simple polygon, concave allowed)
 * against a convex rectangle. Used to carve the precise city boundary into its
 * 3×3 neighborhood cells so heat fills, labels, patrol targets, and spawn hints
 * stay inside the real city limits instead of painting the bbox corners that
 * fall into neighboring towns (e.g. Marion north of West Memphis).
 */
export function clipRingToRect(ring: GeoPoint[], rect: BboxRect): GeoPoint[] | null {
  if (!ring || ring.length < 3) return null;
  // Rect edges oriented counter-clockwise (inside = left of each directed edge).
  const edges: [GeoPoint, GeoPoint][] = [
    [{ lat: rect.latMin, lng: rect.lngMin }, { lat: rect.latMin, lng: rect.lngMax }],
    [{ lat: rect.latMin, lng: rect.lngMax }, { lat: rect.latMax, lng: rect.lngMax }],
    [{ lat: rect.latMax, lng: rect.lngMax }, { lat: rect.latMax, lng: rect.lngMin }],
    [{ lat: rect.latMax, lng: rect.lngMin }, { lat: rect.latMin, lng: rect.lngMin }],
  ];

  let output = ring;
  for (const [a, b] of edges) {
    const input = output;
    output = [];
    const inside = (p: GeoPoint) => (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng) >= 0;
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const next = input[(i + 1) % input.length];
      const curIn = inside(cur);
      const nextIn = inside(next);
      if (curIn && nextIn) {
        output.push(next);
      } else if (curIn && !nextIn) {
        output.push(lineIntersection(cur, next, a, b));
      } else if (!curIn && nextIn) {
        output.push(lineIntersection(cur, next, a, b));
        output.push(next);
      }
    }
    if (output.length === 0) return null;
  }

  // Drop near-duplicate consecutive vertices.
  const deduped: GeoPoint[] = [];
  for (const p of output) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.lat - p.lat) > 1e-9 || Math.abs(last.lng - p.lng) > 1e-9) deduped.push(p);
  }
  return deduped.length >= 3 ? deduped : null;
}

/**
 * Clip the boundary's outer ring to a rect. Returns null when nothing overlaps.
 * Note: only the outer ring is clipped — inner rings (holes) are not subtracted,
 * which is fine for our current single-ring boundaries (West Memphis). A future
 * city with real holes would paint heat over the hole area; revisit if needed.
 */
export function clipBoundaryToRect(boundary: GeoPoint[][] | undefined, rect: BboxRect): GeoPoint[] | null {
  if (!boundary || !boundary[0] || boundary[0].length < 3) return null;
  return clipRingToRect(boundary[0], rect);
}

export function clampToBoundary(
  point: GeoPoint,
  boundary: CityBoundary | GeoPoint[][] | undefined,
  maxAttempts = 40,
): GeoPoint {
  if (!boundary || isPointInBoundary(point, boundary)) return point;
  const rings = Array.isArray(boundary) ? boundary : boundary.rings;
  const bbox = boundaryBbox(boundary);
  if (!bbox) return point;
  const [[latMin, lngMin], [latMax, lngMax]] = bbox;
  const marginLat = (latMax - latMin) * 0.02;
  const marginLng = (lngMax - lngMin) * 0.02;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate: GeoPoint = {
      lat: latMin + marginLat + Math.random() * (latMax - latMin - 2 * marginLat),
      lng: lngMin + marginLng + Math.random() * (lngMax - lngMin - 2 * marginLng),
    };
    if (isPointInBoundary(candidate, rings)) return candidate;
  }
  // Fallback: move toward centroid if rejection sampling failed.
  const center = centroidForBoundary(rings);
  for (let i = 2; i <= 20; i++) {
    const t = i / 20;
    const candidate: GeoPoint = { lat: point.lat + (center.lat - point.lat) * t, lng: point.lng + (center.lng - point.lng) * t };
    if (isPointInBoundary(candidate, rings)) return candidate;
  }
  return center;
}
