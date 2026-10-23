// ============================================
// Dispatch HQ — City Street Data (city-aware, v0.33.0)
// ============================================
// Real road names from the playable cities so radio traffic references actual
// map streets instead of generic filler. West Memphis is the DEFAULT pool (and
// the only one with data pre-v0.33), so every city without its own data keeps
// the exact v0.32.0 behavior. Cities with data (Los Angeles) swap in their own
// streets/landmarks/zone names. The active pool follows the radio engine's
// city context — setRadioCityContext() calls setCityStreetsContext() — so all
// consumers (radio dialogue, field activities, dispatch board) stay in sync.
// Streets are grouped by patrol zone direction so a unit working Downtown
// reports from Downtown streets, a Southside patrol calls in from Southside
// roads, etc.

export interface ZoneStreetData {
  /** Streets found inside this zone (real city roads). */
  streets: string[];
  /** A few well-known spots in this zone. */
  landmarks: string[];
}

export interface CityStreetPool {
  /** Per-zone street + landmark pools, keyed by the patrol zone id. */
  zoneStreets: Record<string, ZoneStreetData>;
  /** Through-roads that make sense in any zone (bridges, freeways). */
  throughStreets: string[];
  /** Generic city landmarks for when a specific zone has no pool hit. */
  cityLandmarks: string[];
  /** Zone display names (real districts) keyed by zone id. */
  zoneNames: Record<string, string>;
  /** Streets used when no zone matches (through-roads + a central mix). */
  fallbackStreets: string[];
}

export const CITY_NAME = 'West Memphis';

/** Per-zone street + landmark pools, keyed by the patrol zone id
 *  (nw/n/ne/w/c/e/sw/s/se — same ids as patrolZones GRID). */
export const ZONE_STREETS: Record<string, ZoneStreetData> = {
  c: {
    streets: ['Broadway Ave', 'Missouri St', 'Barton Ave', 'Service Rd', 'Civic Center Dr', 'E Broadway', 'S Missouri', 'Elm St'],
    landmarks: ['City Hall', 'the civic center', 'the police station', 'the courthouse plaza'],
  },
  n: {
    streets: ['Ingram Blvd', 'Tyler Ave', 'Goodwin Ave', 'N Missouri', '7th St', '8th St', '10th St', 'North Loop'],
    landmarks: ['Mid-South Community College', 'the Northside shopping center', 'the high school', 'the north gate'],
  },
  ne: {
    streets: ['Thompson St', 'Neely Rd', 'Mound City Rd', '15th St', '16th St', 'Jefferson Ave', 'Interstate 55', 'E Service Rd'],
    landmarks: ['the I-55 interchange', 'the truck stop row', 'the industrial park', 'the grain elevators'],
  },
  e: {
    streets: ['16th St', '18th St', '21st St', 'E Broadway', 'S Service Rd', 'Lakeside Dr', 'Airport Rd', 'Veterans Dr'],
    landmarks: ['the municipal airport', 'the veterans hospital', 'Eastgate plaza', 'the lake'],
  },
  se: {
    streets: ['S Broadway', 'South Loop', 'S 8th St', 'Airport Rd', 'Jones Rd', 'S 18th St', 'Interstate 40', 'Southland Blvd'],
    landmarks: ['Southland Park', 'the outlet mall', 'the I-40 ramp', 'the south levee'],
  },
  s: {
    streets: ['South Broadway', 'Barton Ave S', 'S Service Rd', 'Greenwood Ave', 'Pine St', 'S 10th St', 'Ross Ave'],
    landmarks: ['the south side fire station', 'the community center', 'the softball complex'],
  },
  sw: {
    streets: ['W Broadway', 'S Missouri', 'Frazier Rd', 'S Barton', 'Church St', 'Walnut St', 'S Thompson'],
    landmarks: ['the church district', 'the old water tower', 'the southwest market'],
  },
  w: {
    streets: ['W Broadway', 'Service Rd', 'Willow St', 'Chestnut St', 'Frazier Rd', 'S 7th St', 'River Rd'],
    landmarks: ['the riverfront', 'the levee trail', 'the rail yard', 'the west gate'],
  },
  nw: {
    streets: ['N Broadway', 'W Service Rd', 'Railroad Ave', 'Hickory St', 'N 7th St', 'Depot St'],
    landmarks: ['the railroad depot', 'the freight yard', 'the warehouse district'],
  },
};

/** Streets that always make sense regardless of zone (through-roads, bridges). */
export const THROUGH_STREETS = [
  'Interstate 40', 'Interstate 55', 'Broadway Ave', 'Missouri St',
  'the river bridge', 'the levee road',
];

/** Generic city landmarks for when a specific zone has no pool hit. */
export const CITY_LANDMARKS = [
  'City Hall', 'the civic center', 'the police station', 'the courthouse plaza',
  'the river bridge', 'the levee trail', 'the municipal airport',
  'Mid-South Community College', 'Southland Park', 'the outlet mall',
  'the I-40 interchange', 'the I-55 interchange',
];

/** Streets used when no zone matches (West Memphis fallback — unchanged). */
export const FALLBACK_STREETS = [
  ...THROUGH_STREETS,
  'Broadway Ave', 'Missouri St', 'Barton Ave', 'Service Rd', 'Ingram Blvd', 'Tyler Ave', '7th St', '16th St',
];

export interface ZoneRef {
  id: string;
  name: string;
}

/** All zone names in patrol order (matches patrolZones DIRECTION_NAMES). */
export const ZONE_NAMES: Record<string, string> = {
  nw: 'Northwest District', n: 'Uptown', ne: 'Northeast Heights',
  w: 'Westside', c: 'Downtown', e: 'East End',
  sw: 'Southwest Quarter', s: 'Southside', se: 'Southeast Industrial',
};

// ── Lazy city street data (loaded on first access) ──
// The city-specific street/landmark arrays (~76KB) are in a separate chunk so
// the initial bundle stays lean.  The West Memphis default is always available.

let _cityPools: Record<string, CityStreetPool> | null = null;
let _loadPromise: Promise<Record<string, CityStreetPool>> | null = null;

export async function preloadCityStreetData(): Promise<void> {
  await ensureCityData();
}

async function ensureCityData(): Promise<Record<string, CityStreetPool>> {
  if (_cityPools) return _cityPools;
  if (!_loadPromise) {
    _loadPromise = import('./cityStreetData').then((m) => {
      _cityPools = m.CITY_STREET_POOLS;
      return _cityPools!;
    });
  }
  return _loadPromise;
}

// Synchronous accessor — returns cached data or undefined if not yet loaded.
function getCityDataSync(): Record<string, CityStreetPool> | undefined {
  return _cityPools ?? undefined;
}

// Preload city street data at boot (non-blocking).
void ensureCityData();

// ── City-aware pool resolution (v0.33.0) ────────────────────────────────────

const WM_POOL: CityStreetPool = {
  zoneStreets: ZONE_STREETS,
  throughStreets: THROUGH_STREETS,
  cityLandmarks: CITY_LANDMARKS,
  zoneNames: ZONE_NAMES,
  fallbackStreets: FALLBACK_STREETS,
};

/** The city whose street pools are active — null = default (West Memphis). */
let streetCityContext: string | null = null;

/** Normalize a city name ('Los Angeles, CA' → 'los angeles'). */
function normalizeCityKey(name: string): string {
  return name.split(',')[0].toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Point the street/landmark/zone pools at a city. Called automatically by the
 * radio engine's setRadioCityContext(), so the game never needs to call it
 * directly. Pass null/undefined to reset to the default (West Memphis) pools.
 */
export function setCityStreetsContext(cityName: string | null | undefined): void {
  streetCityContext = cityName ? normalizeCityKey(cityName) : null;
}

function streetPoolFor(cityName?: string | null): CityStreetPool {
  const key = cityName ? normalizeCityKey(cityName) : streetCityContext;
  const data = getCityDataSync();
  if (key && data?.[key]) return data[key];
  return WM_POOL;
}

export function streetsForZone(zoneId: string | null, cityName?: string | null): string[] {
  const pool = streetPoolFor(cityName);
  if (zoneId && pool.zoneStreets[zoneId]) return [...pool.zoneStreets[zoneId].streets, ...pool.throughStreets];
  return [...pool.fallbackStreets];
}

export function landmarksForZone(zoneId: string | null, cityName?: string | null): string[] {
  const pool = streetPoolFor(cityName);
  if (zoneId && pool.zoneStreets[zoneId]) return [...pool.zoneStreets[zoneId].landmarks, ...pool.cityLandmarks];
  return [...pool.cityLandmarks];
}

export function zoneNameForId(zoneId: string | null, cityName?: string | null): string {
  const pool = streetPoolFor(cityName);
  return zoneId ? pool.zoneNames[zoneId] ?? zoneId : 'the city';
}

/** Pick a random element (shared with the engine's random helper). */
export function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Two different streets from a zone for intersection-style callouts. */
export function crossStreetsForZone(zoneId: string | null, cityName?: string | null): [string, string] {
  const pool = streetsForZone(zoneId, cityName);
  const a = rand(pool);
  let b = rand(pool);
  let guard = 0;
  while (b === a && guard++ < 8) b = rand(pool);
  return [a, b];
}
