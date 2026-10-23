// ============================================
// Dispatch HQ — LA Street & District Data
// ============================================
// Real City of Los Angeles road names + district names so radio traffic in an
// LA campaign references actual streets and neighborhoods instead of the West
// Memphis defaults. Streets are grouped by patrol zone direction (the same
// nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Downtown unit reports from
// Figueroa, a Valley unit from Ventura Blvd, etc.
//
// ENCLAVE RULE (v0.33.0): LA's precise boundary carves SIX inner rings out of
// the municipality (Culver City, Beverly Hills/West Hollywood, San Fernando,
// and three small pockets). Never list those — or any adjacent non-LA city
// (Santa Monica, Burbank, Glendale, Inglewood, Pasadena, Compton, Long
// Beach) — as a place/landmark/zone name: they must not read as addressable
// locations inside the dispatch area. (Street NAMES like Santa Monica Blvd
// are fine — the road itself runs through LA City.)
// Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real LA City roads). */
export const LOS_ANGELES_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['Ventura Blvd', 'Reseda Blvd', 'Topanga Canyon Blvd', 'Van Nuys Blvd', 'Sherman Way', 'Roscoe Blvd', 'Sepulveda Blvd', 'Winnetka Ave'],
    landmarks: ['the Van Nuys Civic Center', 'Pierce College', 'the Sepulveda Basin', 'the Sherman Oaks Galleria'],
  },
  n: {
    streets: ['Laurel Canyon Blvd', 'Cahuenga Blvd', 'Lankershim Blvd', 'Coldwater Canyon Ave', 'Barham Blvd', 'Mulholland Dr', 'Franklin Ave'],
    landmarks: ['the Hollywood Bowl', 'the Griffith Observatory', 'Runyon Canyon', 'Universal City'],
  },
  ne: {
    streets: ['Foothill Blvd', 'San Fernando Rd', 'Paxton St', 'Hubbard St', 'Maclay St', 'Pierce St', 'Bledsoe St', 'Sunland Blvd'],
    landmarks: ['Sun Valley Park', 'the Hansen Dam', 'the Los Angeles Zoo', 'the Autry Museum'],
  },
  w: {
    streets: ['Wilshire Blvd', 'Santa Monica Blvd', 'Olympic Blvd', 'Sepulveda Blvd', 'Westwood Blvd', 'Pico Blvd', 'Venice Blvd', 'Lincoln Blvd', 'Barrington Ave'],
    landmarks: ['the Getty Center', 'UCLA', 'Venice Beach', 'the Century City towers', 'Westwood Village'],
  },
  c: {
    streets: ['Wilshire Blvd', 'Figueroa St', 'Flower St', 'Spring St', 'Broadway', 'Main St', 'Alameda St', 'Temple St', 'Grand Ave'],
    landmarks: ['Los Angeles City Hall', 'Union Station', 'the Crypto.com Arena', 'the Music Center', 'Olvera Street', 'the Bradbury Building', 'Grand Park'],
  },
  e: {
    streets: ['Cesar Chavez Ave', 'Boyle Ave', 'Hollenbeck Ave', 'Soto St', 'Fresno St', 'Logan St', 'Valley Blvd', 'Mission Rd'],
    landmarks: ['Dodger Stadium', 'Mariachi Plaza', 'the Arts District', 'the Little Tokyo Galleria', 'El Pueblo de Los Ángeles'],
  },
  sw: {
    streets: ['Century Blvd', 'La Cienega Blvd', 'Aviation Blvd', 'Lincoln Blvd', 'Manchester Ave', 'Imperial Hwy', 'Sepulveda Blvd'],
    landmarks: ['LAX', 'Dockweiler Beach', 'Playa del Rey', 'the Loyola Marymount campus'],
  },
  s: {
    streets: ['Crenshaw Blvd', 'Vermont Ave', 'Figueroa St', 'Martin Luther King Jr Blvd', 'Manchester Ave', 'Florence Ave', 'Slauson Ave', 'Western Ave', 'Normandie Ave'],
    landmarks: ['the Los Angeles Memorial Coliseum', 'the Natural History Museum', 'Watts Towers', 'the USC campus', 'Exposition Park', 'the historic Crenshaw district'],
  },
  se: {
    streets: ['Gaffey St', 'Pacific Ave', 'Anaheim St', 'Avalon Blvd', 'Wilmington Blvd', 'Henry Ford Ave', 'Alameda St', 'Broadway'],
    landmarks: ['the Port of Los Angeles', 'the Korean Bell of Friendship', 'the Cabrillo Marine Aquarium', 'the Wilmington waterfront'],
  },
};

/** Through-roads that always make sense regardless of zone (freeways, boulevards). */
export const LOS_ANGELES_THROUGH_STREETS = [
  'Wilshire Blvd', 'Sunset Blvd', 'Santa Monica Blvd', 'Figueroa St',
  'the Hollywood Fwy (US-101)', 'the Santa Monica Fwy (I-10)', 'the Harbor Fwy (I-110)',
  'the San Diego Fwy (I-405)', 'the Golden State Fwy (I-5)',
];

/** Generic LA landmarks for when a specific zone has no pool hit. */
export const LOS_ANGELES_CITY_LANDMARKS = [
  'Los Angeles City Hall', 'Union Station', 'the Griffith Observatory', 'Dodger Stadium',
  'the Los Angeles Memorial Coliseum', 'the Crypto.com Arena', 'LAX', 'the Hollywood Walk of Fame',
  'the Hollywood Bowl', 'Venice Beach', 'the Port of Los Angeles', 'Olvera Street',
  'the Music Center', 'the Getty Center', 'UCLA', 'the USC campus', 'Watts Towers',
];

/** All zone names in patrol order (matches patrolZones DIRECTION_NAMES). */
export const LOS_ANGELES_ZONE_NAMES: Record<string, string> = {
  nw: 'the San Fernando Valley', n: 'the Hollywood Hills', ne: 'the northeast Valley',
  w: 'the Westside', c: 'Downtown', e: 'East LA',
  sw: 'the LAX corridor', s: 'South LA', se: 'the Harbor',
};

/** Streets used when no zone matches (through-roads + a central LA mix). */
export const LOS_ANGELES_FALLBACK_STREETS = [
  ...LOS_ANGELES_THROUGH_STREETS,
  'Wilshire Blvd', 'Figueroa St', 'Sunset Blvd', 'Santa Monica Blvd',
  'Ventura Blvd', 'Crenshaw Blvd', 'Laurel Canyon Blvd', 'Foothill Blvd',
];
