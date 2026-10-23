// ============================================
// Dispatch HQ — Houston Street & District Data
// ============================================
// Real City of Houston road names + district names so radio traffic in a
// Houston campaign references actual streets and neighborhoods instead of the
// West Memphis defaults. Streets are grouped by patrol zone direction (the
// same nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Downtown unit reports
// from Main St, a West Side unit from Westheimer, etc.
//
// SUBURB RULE (v0.33.x): Houston is a massive annexing municipality, but
// dozens of cities ring and even sit INSIDE its limits (Bellaire, West
// University Place, the Memorial Villages — Bunker Hill, Piney Point, Hedwig,
// Hunters Creek, Hilshire, Spring Valley — plus Sugar Land, Katy, Pasadena,
// Pearland, Baytown, Humble…). Never list those as a place/landmark/zone
// name: they must not read as addressable locations inside the dispatch area.
// (Street NAMES like Bellaire Blvd or the Katy Fwy are fine — the roads run
// through Houston City.) Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real Houston roads). */
export const HOUSTON_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['FM 1960', 'Cypress Creek Pkwy', 'Telge Rd', 'Barker Cypress Rd', 'Tomball Pkwy', 'Antoine Dr', 'Gessner Rd', 'Jones Rd'],
    landmarks: ['the Willowbrook Mall', 'the Champions Golf Club', 'the Cypress Creek Greenway', 'the Spring Branch trail'],
  },
  n: {
    streets: ['North Fwy (I-45)', 'Airline Dr', 'Aldine Bender Rd', 'Eastex Fwy', 'Fulton St', 'Jensen Dr', 'Crosstimbers Rd', 'Little York Rd'],
    landmarks: ['the Northline Commons', 'the Greenspoint district', 'the Lindale Park', 'George Bush Intercontinental Airport'],
  },
  ne: {
    streets: ['Lockwood Dr', 'Uvalde Rd', 'Homestead Rd', 'Wallisville Rd', 'Market St', 'Old Clinton Rd', 'McCarty Rd', 'Crosby Fwy (US-90)'],
    landmarks: ['the Kashmere Gardens', 'the Trinity Gardens', 'the Denver Harbor', 'the Northeast Houston greenway'],
  },
  w: {
    streets: ['Memorial Dr', 'Katy Fwy (I-10)', 'Westheimer Rd', 'Briar Forest Dr', 'Eldridge Pkwy', 'Wilcrest Dr', 'Richmond Ave', 'Bering Dr', 'Woodway Dr'],
    landmarks: ['the Galleria', 'the Energy Corridor', 'Memorial Park', 'the Houston Arboretum', 'the River Oaks Shopping Center', 'the Uptown district'],
  },
  c: {
    streets: ['Main St', 'Milam St', 'Travis St', 'Fannin St', 'Louisiana St', 'McKinney St', 'Walker St', 'Congress St', 'Smith St', 'Dallas St'],
    landmarks: ['Discovery Green', 'Minute Maid Park', 'the Toyota Center', 'Houston City Hall', 'the George R. Brown Convention Center', 'the Buffalo Bayou', 'Market Square'],
  },
  e: {
    streets: ['Harrisburg Blvd', 'Navigation Blvd', 'Canal St', 'Clinton Dr', 'Manchester St', 'Lawndale St', 'Gulf Fwy (I-45)', 'Lockwood Dr'],
    landmarks: ['the Port of Houston', 'the Houston Ship Channel', 'the Fifth Ward', 'the Second Ward', 'Shell Energy Stadium'],
  },
  sw: {
    streets: ['Chimney Rock Rd', 'Bellaire Blvd', 'Beechnut St', 'Bissonnet St', 'Fondren Rd', 'Hillcroft Ave', 'South Post Oak Rd', 'Westpark Dr'],
    landmarks: ['the Meyerland Plaza', 'the Sharpstown Center', 'the Westbury Square', 'the Willowbend', 'the Alief district'],
  },
  s: {
    streets: ['Almeda Rd', 'Scott St', 'Cullen Blvd', 'Martin Luther King Jr Blvd', 'Holmes Rd', 'Airport Blvd', 'Telephone Rd', 'Bellfort St', 'S Main St'],
    landmarks: ['the Texas Medical Center', 'the Astrodome', 'NRG Stadium', 'the University of Houston', 'the Sunnyside district'],
  },
  se: {
    streets: ['Galveston Rd', 'Broadway St', 'Fuqua St', 'Almeda-Genoa Rd', 'Mykawa Rd', 'Beamer Rd', 'Fairmont Pkwy', 'Old Galveston Rd'],
    landmarks: ['the Ellington Field', 'the Johnson Space Center', 'the Sylvan Rodriguez Park', 'the Clear Lake shoreline'],
  },
};

/** Through-roads that always make sense regardless of zone (freeways, the loop). */
export const HOUSTON_THROUGH_STREETS = [
  'the Gulf Fwy (I-45)', 'the Katy Fwy (I-10)', 'the Southwest Fwy (US-59)', 'the Eastex Fwy (US-59)',
  'the 610 Loop', 'the Sam Houston Tollway', 'Westheimer Rd', 'Main St',
];

/** Generic Houston landmarks for when a specific zone has no pool hit. */
export const HOUSTON_CITY_LANDMARKS = [
  'the Texas Medical Center', 'the Galleria', 'Discovery Green', 'Minute Maid Park',
  'the Toyota Center', 'the Astrodome', 'NRG Stadium', 'the Houston Zoo',
  'the Museum of Fine Arts', 'the Buffalo Bayou', 'the Port of Houston',
  'George Bush Intercontinental Airport', 'Hobby Airport',
];

/** All zone names in patrol order (matches patrolZones DIRECTION_NAMES). */
export const HOUSTON_ZONE_NAMES: Record<string, string> = {
  nw: 'the Northwest', n: 'the North Side', ne: 'the Northeast',
  w: 'the West Side', c: 'Downtown', e: 'the East End',
  sw: 'the Southwest', s: 'the South Side', se: 'the Southeast',
};

/** Streets used when no zone matches (through-roads + a central Houston mix). */
export const HOUSTON_FALLBACK_STREETS = [
  ...HOUSTON_THROUGH_STREETS,
  'Main St', 'Westheimer Rd', 'Fannin St', 'Milam St', 'Harrisburg Blvd',
  'Bellaire Blvd', 'FM 1960', 'Airline Dr',
];
