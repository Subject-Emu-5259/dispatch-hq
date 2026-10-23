// ============================================
// Dispatch HQ — Points of Interest (POIs)
// ============================================
// The city's real places: schools, parks, libraries, gas stations, government
// buildings, banks, malls, churches, stadiums, and everyday commercial spots.
// POIs are PLAYER-PLACED (v0.22.12): the commander picks a type and clicks the
// map to build each landmark for a credit cost. Placed POIs live in the save
// (gameStore.placedPois) and are strictly inside the city boundary (build
// clamps them). Missions anchor to placed POIs — a call's location,
// description, and radio traffic reference the place, so the city feels like
// named, tangible spots instead of random map dots.

import type { GeoPoint } from '@dispatch-hq/shared';

export type PoiType =
  | 'school' | 'park' | 'library' | 'gas_station' | 'government' | 'bank'
  | 'mall' | 'church' | 'stadium' | 'restaurant' | 'supermarket' | 'gym';

export interface Poi {
  id: string;
  type: PoiType;
  name: string;
  position: GeoPoint;
  /** Coarse spawn-bucket tags, aligned with MissionTemplate.poiTypes. */
  buckets: string[];
}

export interface PoiTypeMeta {
  label: string;
  icon: string;
  buckets: string[];
  /** Marker border color (muted so POIs never out-shout live calls). */
  color: string;
}

export const POI_TYPE_META: Record<PoiType, PoiTypeMeta> = {
  school:      { label: 'School',           icon: '🏫', buckets: ['school', 'residential', 'public'],              color: '#38BDF8' },
  park:        { label: 'Park',             icon: '🌳', buckets: ['park', 'public', 'residential'],                color: '#4ADE80' },
  library:     { label: 'Library',          icon: '📚', buckets: ['public', 'commercial'],                         color: '#FBBF24' },
  gas_station: { label: 'Gas Station',      icon: '⛽', buckets: ['road', 'commercial', 'retail'],                  color: '#F87171' },
  government:  { label: 'Government Bldg',  icon: '🏛️', buckets: ['public', 'commercial', 'high_rise'],            color: '#A78BFA' },
  bank:        { label: 'Bank',             icon: '🏦', buckets: ['bank', 'commercial', 'retail'],                 color: '#34D399' },
  mall:        { label: 'Shopping Mall',    icon: '🛍️', buckets: ['commercial', 'retail', 'parking'],              color: '#F472B6' },
  church:      { label: 'Church',           icon: '⛪', buckets: ['public', 'residential'],                         color: '#E2E8F0' },
  stadium:     { label: 'Stadium',          icon: '🏟️', buckets: ['public', 'park', 'commercial'],                 color: '#FB923C' },
  restaurant:  { label: 'Restaurant',       icon: '🍽️', buckets: ['commercial', 'retail', 'road'],                 color: '#FDE047' },
  supermarket: { label: 'Supermarket',      icon: '🛒', buckets: ['commercial', 'retail', 'parking'],               color: '#2DD4BF' },
  gym:         { label: 'Gym',              icon: '🏋️', buckets: ['commercial', 'residential'],                    color: '#60A5FA' },
};

export const POI_TYPES = Object.keys(POI_TYPE_META) as PoiType[];

/** Credit cost to build a landmark POI (v0.22.12 — player-placed). */
export const POI_BUILD_COST = 750;

// Hospital build cost lives with the hospital (see lib/hospital).
export { HOSPITAL_BUILD_COST } from '@/lib/hospital';

/** Per-type name pools; each is picked for a new placement. First-pool
 *  entries are city-flavored (`${city} High School`), so every city's placed
 *  landmarks feel local. */
const NAME_POOLS: Record<PoiType, ((city: string) => string)[]> = {
  school:      [(c) => `${c.split(',')[0]} High School`, (c) => `${c.split(',')[0]} Elementary School`, () => 'Northside Middle School', () => 'Central Academy'],
  park:        [() => 'Riverside Park', () => 'Maplewood Park', () => 'Heritage Park', () => 'Sunset Park'],
  library:     [(c) => `${c.split(',')[0]} Public Library`, () => 'Maple Grove Library', () => 'Carver Community Library'],
  gas_station: [() => 'Shell Station', () => 'Exxon Station', () => 'Chevron Station', () => 'Circle K', () => '7-Eleven', () => 'BP Station'],
  government:  [() => 'City Hall', () => 'County Courthouse', () => 'Municipal Building'],
  bank:        [() => 'First National Bank', () => 'City Trust Bank', () => 'Merchants Bank'],
  mall:        [() => 'Rivertown Mall', () => 'Market Square', () => 'Crossroads Plaza'],
  church:      [() => 'Grace Community Church', () => 'St. Mary’s Church', () => 'Calvary Chapel'],
  stadium:     [() => 'Memorial Stadium', () => 'Civic Arena', () => 'Veterans Field'],
  restaurant:  [() => 'Broadway Diner', () => 'Riverfront Grill', () => 'The Corner Café'],
  supermarket: [() => 'Fresh Market', () => 'Family Grocer', () => 'Harvest Foods'],
  gym:         [() => 'IronWorks Gym', () => 'FitLife Center', () => 'Peak Performance Gym'],
};

/**
 * Build a player-placed POI. The name comes from the per-city pool (walked by
 * `ordinal` so a second school never collides with the first) and the id is
 * unique per placement. The caller clamps the position to the city boundary
 * before committing (see BuildPoiModal).
 */
export function makePoi(
  type: PoiType,
  position: GeoPoint,
  city: { name: string } | null | undefined,
  ordinal = 0,
): Poi {
  const pool = NAME_POOLS[type];
  const base = pool[Math.floor(Math.random() * pool.length)](city?.name ?? 'City');
  const name = ordinal > 0 ? `${base} ${ordinal + 1}` : base;
  const slug = (city?.name ?? 'city').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    id: `poi_${slug}_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    name,
    position,
    buckets: POI_TYPE_META[type].buckets,
  };
}

export function poiById(pois: Poi[], id: string | null | undefined): Poi | null {
  if (!id) return null;
  return pois.find((p) => p.id === id) ?? null;
}

/**
 * POI bucket tags that give a place its IDENTITY (vs generic area tags like
 * 'residential'/'commercial'/'public'). When a mission's poiTypes carry one of
 * these, it anchors to THAT kind of place first — the robbery to the bank, the
 * school emergency to the school, the high-rise fire to the government tower —
 * instead of grabbing the nearest generic building that merely shares a broad
 * area tag.
 */
const IDENTITY_POI_TAGS = new Set(['school', 'bank', 'park', 'high_rise']);

/**
 * Choose a POI to anchor a mission to. ONLY POIs whose spawn buckets match the
 * template's poiTypes are ever candidates — nearest within `maxKm`. A call
 * whose incident has no suitable landmark stays street-level (v0.22.x fix: the
 * old any-POI fallback anchored a "Container Fire" to a church or a school
 * disturbance to a gas station — a wrong place is worse than no place). Among
 * matching candidates, POIs that share an IDENTITY tag with the call (school,
 * bank, park, high-rise) win over generic-tag matches. Pure road/highway calls
 * never anchor — they belong on the asphalt. Only PLACED POIs are ever
 * considered (v0.22.12 — no auto-generated POIs).
 */
export function findAnchorPoi(
  pois: Poi[],
  location: GeoPoint,
  poiTypes: string[],
  maxKm = 2,
): Poi | null {
  if (pois.length === 0) return null;
  const roadOnly = poiTypes.length > 0 &&
    poiTypes.every((t) => ['road', 'highway', 'intersection', 'parking'].includes(t));
  if (roadOnly) return null;
  const matching = pois.filter((p) => p.buckets.some((b) => poiTypes.includes(b)));
  if (matching.length === 0) return null;
  const identity = matching.filter((p) =>
    p.buckets.some((b) => IDENTITY_POI_TAGS.has(b) && poiTypes.includes(b)),
  );
  const pool = identity.length > 0 ? identity : matching;
  let best: Poi | null = null;
  let bestKm = maxKm;
  for (const p of pool) {
    const dLat = (p.position.lat - location.lat) * 111;
    const dLng = (p.position.lng - location.lng) * 111 * Math.cos((location.lat * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    if (d <= bestKm) {
      best = p;
      bestKm = d;
    }
  }
  return best;
}

/** Human label for a POI (icon + name), used in toasts/radio when anchored. */
export function poiLabel(poi: Poi | null | undefined): string {
  if (!poi) return '';
  return `${poi.name} (${POI_TYPE_META[poi.type].label})`;
}
