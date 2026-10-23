// ============================================
// Dispatch HQ — City Progression (v0.21.0)
// ============================================
// Level-gated city access. West Memphis is the starter city; the rest of the
// roster unlocks as your commander ranks up. "Relocate Command" (Pause menu)
// moves your whole fleet to any city you've unlocked — the mid-campaign city
// switching arc from the release-readiness roadmap.

export interface CityAccess {
  /** Minimum commander level required to relocate to this city. */
  minLevel: number;
  /** One-line flavor shown under the city name in the picker. */
  tagline?: string;
}

export const CITY_ACCESS: Record<string, CityAccess> = {
  'West Memphis, AR': { minLevel: 1, tagline: 'Starter city — the Delta gateway.' },
  'Memphis, TN': { minLevel: 3, tagline: 'The Bluff City — your first big jump.' },
  'Nashville, TN': { minLevel: 4, tagline: 'Music City — fire, EMS, and the Metro PD.' },
  'Little Rock, AR': { minLevel: 5, tagline: 'The Rock — Capital City command.' },
  'New York City': { minLevel: 6, tagline: 'Five boroughs of five-alarm chaos.' },
  'Los Angeles': { minLevel: 8, tagline: 'Freeways, fires, and gridlock.' },
  'Chicago': { minLevel: 10, tagline: 'The Windy City never sleeps.' },
  'Houston': { minLevel: 12, tagline: 'Everything is bigger in Texas.' },
  'London': { minLevel: 14, tagline: 'The Met, the Brigade, and the Thames.' },
  'Paris': { minLevel: 16, tagline: 'Ville lumière — secours de Paris.' },
  'Berlin': { minLevel: 18, tagline: 'Hauptstadt: Feuerwehr, Polizei, Rettung.' },
  'Toronto': { minLevel: 19, tagline: 'The Six. The 911. The 24-hour shift.' },
  'Sydney': { minLevel: 20, tagline: 'Harbour City — dispatch down under.' },
  'Tokyo': { minLevel: 20, tagline: 'The ultimate command — 23 wards of pressure.' },
};

export function cityUnlockLevel(cityName: string): number {
  return CITY_ACCESS[cityName]?.minLevel ?? 1;
}

export function isCityUnlocked(cityName: string, level: number): boolean {
  return level >= cityUnlockLevel(cityName);
}

export function lockedUntilLabel(cityName: string): string | null {
  const lvl = cityUnlockLevel(cityName);
  return lvl > 1 ? `Requires Level ${lvl}` : null;
}

// ── Relocation cost (v0.21.1) ──
// Moving your command is priced on fleet size: a bigger operation costs more
// to uproot, so early relocations are cheap and late-game moves are a real
// economy decision.
export const RELOCATE_BASE_COST = 5000;
export const RELOCATE_PER_STATION = 2000;
export const RELOCATE_PER_UNIT = 1500;

/** Cost (credits) to relocate a fleet of `stations` stations and `units` units. */
export function relocateCost(stationCount: number, unitCount: number): number {
  return RELOCATE_BASE_COST + stationCount * RELOCATE_PER_STATION + unitCount * RELOCATE_PER_UNIT;
}
