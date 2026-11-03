// ============================================
// Dispatch HQ — Adopt-a-City (Batch 3b)
// ============================================
// Feature 20: a player-searched city (the geocode fallback path — a city
// with no boundary file and no roster entry, played via ±0.05° estimated
// bounds) used to be a one-off visit. Adopting it makes it a persistent
// home base: it joins the player's atlas, tracks its own local
// progression (missions cleared there → local level), and survives
// save/load round-trips in the save blob.
//
// Deliberately NOT a boundary-file feature: there is no boundary file
// that isn't already playable, and live missions come from spawn logic,
// Live missions come from spawn.ts, not a separate generator module. Adoption is persistence + progression
// for searched cities, nothing more.

export interface AdoptedCity {
  name: string;
  lat: number;
  lng: number;
  /** ISO date of adoption. */
  adoptedAt: string;
  /** ISO date of the last mission cleared in this city. */
  lastPlayedAt: string;
  /** Missions cleared while based in this city. */
  missionsCompleted: number;
  /** Local level: 1 + one per 25 missions cleared here. */
  localLevel: number;
}

/** How many adopted home bases one commander keeps. Oldest-played drops first. */
export const MAX_ADOPTED_CITIES = 24;
/** Missions cleared per local level. */
export const ADOPTED_CITY_MISSIONS_PER_LEVEL = 25;

export function adoptedCityLevel(missionsCompleted: number): number {
  return 1 + Math.floor(Math.max(0, missionsCompleted) / ADOPTED_CITY_MISSIONS_PER_LEVEL);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** True when `cityName` is already adopted (name match, case-insensitive). */
export function isAdopted(list: readonly AdoptedCity[], cityName: string): boolean {
  const n = normalizeName(cityName);
  return list.some((c) => normalizeName(c.name) === n);
}

/**
 * Adopt a searched city. Roster cities are NOT adopted here — they are
 * already permanent; adoption is for searched cities only, and the
 * caller decides that (CitySelectionScreen passes searched picks).
 * Re-adopting refreshes lastPlayedAt without resetting progression.
 * At capacity the least-recently-played base is retired to make room.
 */
export function adoptCity(
  list: readonly AdoptedCity[],
  city: { name: string; lat: number; lng: number },
  nowIso: string = new Date().toISOString(),
): AdoptedCity[] {
  const existing = list.find((c) => normalizeName(c.name) === normalizeName(city.name));
  if (existing) {
    return list.map((c) => (c === existing ? { ...c, lastPlayedAt: nowIso } : c));
  }
  const entry: AdoptedCity = {
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    adoptedAt: nowIso,
    lastPlayedAt: nowIso,
    missionsCompleted: 0,
    localLevel: 1,
  };
  let next = [...list, entry];
  if (next.length > MAX_ADOPTED_CITIES) {
    const sorted = [...next].sort((a, b) => (a.lastPlayedAt < b.lastPlayedAt ? -1 : 1));
    const drop = new Set(sorted.slice(0, next.length - MAX_ADOPTED_CITIES).map((c) => c.name));
    next = next.filter((c) => !drop.has(c.name));
  }
  return next;
}

/**
 * Record one mission cleared in `cityName`. Unknown cities are ignored
 * (only adopted bases track progression) — the caller adopts on search
 * select, so a clear in a never-adopted city is a data error, not a
 * silent auto-adopt.
 */
export function recordAdoptedCityMission(
  list: readonly AdoptedCity[],
  cityName: string,
  nowIso: string = new Date().toISOString(),
): AdoptedCity[] {
  return list.map((c) => {
    if (normalizeName(c.name) !== normalizeName(cityName)) return c;
    const missionsCompleted = c.missionsCompleted + 1;
    return { ...c, missionsCompleted, localLevel: adoptedCityLevel(missionsCompleted), lastPlayedAt: nowIso };
  });
}

export function adoptedCityProgress(list: readonly AdoptedCity[], cityName: string): AdoptedCity | null {
  return list.find((c) => normalizeName(c.name) === normalizeName(cityName)) ?? null;
}

/**
 * Save-blob round-trip: adopted cities must survive JSON stringify/parse
 * byte-identically (same fields, same values). parseAdoptedCities drops
 * malformed rows instead of crashing a load.
 */
export function parseAdoptedCities(value: unknown): AdoptedCity[] {
  if (!Array.isArray(value)) return [];
  const out: AdoptedCity[] = [];
  for (const row of value) {
    const r = row as Record<string, unknown>;
    if (typeof r?.name !== 'string' || typeof r?.lat !== 'number' || typeof r?.lng !== 'number') continue;
    out.push({
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      adoptedAt: typeof r.adoptedAt === 'string' ? r.adoptedAt : '',
      lastPlayedAt: typeof r.lastPlayedAt === 'string' ? r.lastPlayedAt : '',
      missionsCompleted: typeof r.missionsCompleted === 'number' ? r.missionsCompleted : 0,
      localLevel: typeof r.localLevel === 'number' ? r.localLevel : 1,
    });
  }
  return out;
}
