// ============================================\n// Dispatch HQ — Built-in POI registry (STAGED batch)
// ============================================
// The spawn pipeline anchors calls to POIs via findAnchorPoi(placedPois).
// Player-placed POIs are the only anchors that exist today, so a fresh city
// has zero anchorable POIs. This registry is the seam for built-in POIs:
// entries are REAL places with REAL coordinates, sourced from an OSM /
// Nominatim export at build time — never invented. The registry ships EMPTY
// on purpose: until a verified export is added, anchoring behaves exactly
// as before (placed POIs only). registerBuiltInPois exists for the harness
// and for a future verified data file; builtInPoisForCity is what buildMission
// merges (placed POIs first — player intent wins).
import type { GeoPoint } from '@dispatch-hq/shared';

export interface BuiltInPoi {
  name: string;
  type: string;
  position: GeoPoint;
  buckets: string[];
}

const REGISTRY = new Map<string, BuiltInPoi[]>();

export function registerBuiltInPois(cityName: string, pois: BuiltInPoi[]): void {
  REGISTRY.set(cityName, pois);
}

export function builtInPoisForCity(cityName: string): BuiltInPoi[] {
  return REGISTRY.get(cityName) ?? [];
}

/** Clear the registry (harness use). */
export function clearBuiltInPois(): void {
  REGISTRY.clear();
}
