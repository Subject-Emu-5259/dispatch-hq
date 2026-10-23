// ============================================
// Dispatch HQ — City Traits
// ============================================
// Named gameplay modifiers that make each city feel different to play. A trait
// tweaks spawn weights, response times, travel speed, and reward multipliers
// so city choice is strategy, not just flavor.
//
// Traits compose with weather and random events via the same multiplier
// pipeline — a storm in Paris stacks with the density trait to create
// extreme fire risk.
//
// Data-driven: adding a new city trait = adding one entry to CITY_TRAITS.
// The modifier values are intentionally modest on paper; their combined
// effect (more fires + slower response + faster spawn + better rewards)
// creates a noticeably different play experience within 2 minutes.

export interface CityTrait {
  /** Human-readable name shown in the city picker tooltip. */
  name: string;
  /** One-line description of how this trait changes gameplay. */
  description: string;
  /** Gameplay modifiers applied to the spawn/response/reward pipeline. */
  modifiers: {
    /** Multiplier on structure-fire spawn weight (1.0 = baseline). */
    fireSpawnWeight?: number;
    /** Multiplier on EMS spawn weight. */
    emsSpawnWeight?: number;
    /** Multiplier on police spawn weight. */
    policeSpawnWeight?: number;
    /** Additive modifier on response time in seconds. Positive = slower. */
    responseTimeDelta?: number;
    /** Multiplier on travel time (1.0 = baseline, >1 = slower). */
    travelTimeMultiplier?: number;
    /** Multiplier on spawn rate — missions per interval (1.0 = baseline). */
    spawnRateMultiplier?: number;
    /** Multiplier on credits earned per mission. */
    creditsMultiplier?: number;
    /** Multiplier on XP earned per mission. */
    xpMultiplier?: number;
    /** Extra spawn-weight boosts keyed by mission category. */
    categoryBoosts?: Record<string, number>;
  };
}

/**
 * Per-city trait registry. Keys are the canonical city name as it appears in
 * `cityProgression.ts` (e.g. `'Paris'`, `'London'`). Cities not listed here
 * have no trait — they play at baseline.
 */
export const CITY_TRAITS: Record<string, CityTrait> = {
  // ── Paris — Urban Density ──
  // Paris packs 2.1 million people into 105 km² — the densest city in
  // Europe. Haussmannian buildings, older wiring, narrow streets, and the
  // périphérique congestion create more fires, more EMS calls, and slower
  // response. The reward bonuses compensate: harder city, better pay.
  'Paris': {
    name: 'Urban Density',
    description: 'Dense buildings = more fires, more EMS, slower response — but better rewards.',
    modifiers: {
      fireSpawnWeight: 1.4,
      emsSpawnWeight: 1.3,
      responseTimeDelta: 3,
      travelTimeMultiplier: 1.12,
      spawnRateMultiplier: 1.15,
      creditsMultiplier: 1.1,
      xpMultiplier: 1.05,
    },
  },

  // ── London — Congestion Zone ──
  // Central London's Congestion Charge zone funnels traffic through narrow
  // streets, creating more police calls (traffic incidents, public order)
  // and slower response times. The Tube and double-decker buses add unique
  // EMS scenarios. Reward bonuses offset the congestion penalty.
  'London': {
    name: 'Congestion Zone',
    description: 'Traffic chaos = more police calls, slower response — premium rewards.',
    modifiers: {
      policeSpawnWeight: 1.35,
      emsSpawnWeight: 1.2,
      responseTimeDelta: 4,
      travelTimeMultiplier: 1.15,
      spawnRateMultiplier: 1.1,
      creditsMultiplier: 1.12,
      xpMultiplier: 1.06,
    },
  },

  // ── Berlin — Cold War Grid ──
  // Berlin's modernist rebuild after WWII created a grid-like street layout
  // with wider boulevards and newer buildings. Fewer structure fires (better
  // wiring), faster travel on the grid, but more police calls (protests,
  // border incidents near historical sites). Lower fire risk = lower
  // rewards, but the grid efficiency helps response times.
  'Berlin': {
    name: 'Cold War Grid',
    description: 'Modern grid = fewer fires, faster travel, more police calls.',
    modifiers: {
      fireSpawnWeight: 0.8,
      policeSpawnWeight: 1.25,
      responseTimeDelta: -2,
      travelTimeMultiplier: 0.92,
      spawnRateMultiplier: 1.05,
      creditsMultiplier: 0.95,
      xpMultiplier: 1.02,
    },
  },

  // ── Chicago — Windy City ──
  // Chicago is the fire capital of the US — older buildings, harsh winters
  // (space heaters, chimney fires), and the Windy City's weather patterns
  // create extreme fire risk. The Chicago Fire Department is one of the
  // busiest in the nation. More fires + more EMS = harder city, better pay.
  'Chicago': {
    name: 'Windy City',
    description: 'Fire capital — extreme fire risk, heavy EMS load, premium rewards.',
    modifiers: {
      fireSpawnWeight: 1.5,
      emsSpawnWeight: 1.35,
      responseTimeDelta: 2,
      travelTimeMultiplier: 1.08,
      spawnRateMultiplier: 1.2,
      creditsMultiplier: 1.15,
      xpMultiplier: 1.07,
    },
  },

  // ── Houston — Highway Sprawl ──
  // Houston is the most car-dependent major city in the US — vast distances,
  // highway-centric layout, and extreme heat. Units travel farther between
  // calls, response times are longer, but the sprawl means more diverse
  // incidents (industrial, highway, residential). Better credits for the
  // extra miles.
  'Houston': {
    name: 'Highway Sprawl',
    description: 'Vast distances = longer response, more diverse incidents, better pay.',
    modifiers: {
      fireSpawnWeight: 1.1,
      emsSpawnWeight: 1.15,
      policeSpawnWeight: 1.1,
      responseTimeDelta: 3,
      travelTimeMultiplier: 1.2,
      spawnRateMultiplier: 1.05,
      creditsMultiplier: 1.12,
      xpMultiplier: 1.04,
    },
  },

  // ── New York City — Five Boroughs ──
  // NYC is the densest major city in the US — 8.3 million people across
  // five boroughs, each with its own character. Extreme density means more
  // of everything: fires, EMS, police. The subway adds unique EMS scenarios
  // (underground medical emergencies). Fastest spawn rate in the game.
  'New York City': {
    name: 'Five Boroughs',
    description: 'Maximum density — more of everything, fastest board fill.',
    modifiers: {
      fireSpawnWeight: 1.35,
      emsSpawnWeight: 1.3,
      policeSpawnWeight: 1.2,
      responseTimeDelta: 2,
      travelTimeMultiplier: 1.05,
      spawnRateMultiplier: 1.25,
      creditsMultiplier: 1.1,
      xpMultiplier: 1.05,
    },
  },

  // ── Toronto — The Six ──
  // Toronto is Canada's busiest emergency-services city — Toronto Fire
  // Services, Toronto Paramedic Services, and TPS all run at national-record
  // call volumes. Harsh winters (ice storms, freezing rain) and the Don
  // Valley Parkway / Highway 401 corridor create dangerous multi-vehicle
  // pileups. Older housing stock in Parkdale, Regent Park, and Cabbagetown
  // drives fire risk. The ravine network adds unique EMS scenarios (trail
  // rescues, park emergencies). Premium rewards for the northern grind.
  'Toronto': {
    name: 'The Six',
    description: 'Winter chaos — ice storms, 401 pileups, ravine rescues, premium rewards.',
    modifiers: {
      fireSpawnWeight: 1.25,
      emsSpawnWeight: 1.35,
      policeSpawnWeight: 1.1,
      responseTimeDelta: 2,
      travelTimeMultiplier: 1.1,
      spawnRateMultiplier: 1.15,
      creditsMultiplier: 1.1,
      xpMultiplier: 1.05,
    },
  },

  // ── Sydney — Harbour Chaos ──
  // Sydney's harbour geography creates unique response challenges — units
  // must navigate around the harbour (no direct east-west routes), and the
  // narrow CBD streets choke with tourists and events. Bushfire-urban
  // interface in the eastern suburbs (The Gap, Vaucluse) creates fire risk,
  // while the Harbour Bridge and Tunnel create bottleneck delays. Beach
  // rescues add EMS volume in summer.
  'Sydney': {
    name: 'Harbour Chaos',
    description: 'Harbour geography + bushfire risk + beach rescues — unique challenges.',
    modifiers: {
      fireSpawnWeight: 1.2,
      emsSpawnWeight: 1.3,
      policeSpawnWeight: 1.15,
      responseTimeDelta: 2,
      travelTimeMultiplier: 1.1,
      spawnRateMultiplier: 1.1,
      creditsMultiplier: 1.08,
      xpMultiplier: 1.04,
    },
  },

  // ── Tokyo — Megacity Pulse ──
  // Tokyo's 23 Special Wards are the world's most densely populated urban
  // core — 14 million people on 627 km². The railway-dense network creates
  // unique response patterns: fires in wooden machiya (old townhouse)
  // neighborhoods spread fast, earthquakes trigger mass EMS, and the
  // narrow streets of Yanaka/Asakusa slow heavy apparatus. Better rewards
  // for managing the world's busiest dispatch board.
  'Tokyo': {
    name: 'Megacity Pulse',
    description: 'Dense urban core — earthquakes, wooden houses, narrow streets.',
    modifiers: {
      fireSpawnWeight: 1.35,
      emsSpawnWeight: 1.4,
      policeSpawnWeight: 1.1,
      responseTimeDelta: 3,
      travelTimeMultiplier: 1.12,
      spawnRateMultiplier: 1.2,
      creditsMultiplier: 1.12,
      xpMultiplier: 1.06,
    },
  },

  // ── Los Angeles — Freeway Grid ──
  // LA is defined by its freeways — the 405, the 101, the 10. Traffic
  // congestion slows response, but the grid-like street layout helps
  // once you're off the freeways. More police calls (traffic incidents,
  // pursuit scenarios) and the Hollywood Hills create unique fire risk
  // (wildfire-urban interface). Better rewards for the freeway grind.
  'Los Angeles': {
    name: 'Freeway Grid',
    description: 'Freeway traffic = slow response, more police, wildfire risk.',
    modifiers: {
      fireSpawnWeight: 1.2,
      policeSpawnWeight: 1.25,
      emsSpawnWeight: 1.1,
      responseTimeDelta: 3,
      travelTimeMultiplier: 1.18,
      spawnRateMultiplier: 1.1,
      creditsMultiplier: 1.1,
      xpMultiplier: 1.04,
    },
  },
};

/**
 * Look up the gameplay trait for a city. Returns undefined when the city has
 * no trait (baseline behavior).
 *
 * Accepts the canonical name from `cityProgression.ts` or the first segment
 * of a comma-separated city name (e.g. `'Paris, FR'` → `'Paris'`).
 */
export function getCityTrait(cityName: string | null | undefined): CityTrait | undefined {
  if (!cityName) return undefined;
  const key = cityName.split(',')[0].trim();
  return CITY_TRAITS[key];
}

/** Number of registered city traits (for tests and sanity checks). */
export const TRAIT_COUNT = Object.keys(CITY_TRAITS).length;
