// ============================================
// Dispatch HQ — Chicago Street & District Data
// ============================================
// Real City of Chicago road names + district names so radio traffic in a
// Chicago campaign references actual streets and neighborhoods instead of the
// West Memphis defaults. Streets are grouped by patrol zone direction (the
// same nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Loop unit reports from
// State St, a North Side unit from Clark St, etc.
//
// SUBURB RULE (v0.33.x): Chicago is a single contiguous municipality — no
// carved-out enclaves like LA — but dozens of suburbs ring the city limits
// (Evanston, Skokie, Oak Park, Cicero, Berwyn, Stickney, Harvey, Blue Island,
// Hammond…). Never list those as a place/landmark/zone name: they must not
// read as addressable locations inside the dispatch area. (Street NAMES like
// Cicero Ave are fine — the road itself runs through Chicago City.)
// Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real Chicago roads). */
export const CHICAGO_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['Milwaukee Ave', 'Cicero Ave', 'Higgins Ave', 'Foster Ave', 'Lawrence Ave', 'Narragansett Ave', 'Pulaski Rd', 'Devon Ave'],
    landmarks: ["O'Hare International Airport", 'the Jefferson Park transit hub', 'the Portage Park fieldhouse', 'the Norwood Park historical district'],
  },
  n: {
    streets: ['Lincoln Ave', 'Damen Ave', 'Western Ave', 'Ravenswood Ave', 'Lawrence Ave', 'Montrose Ave', 'Irving Park Rd', 'Elston Ave'],
    landmarks: ['Graceland Cemetery', 'the Riviera Theatre', 'the Davis Theater'],
  },
  ne: {
    streets: ['Broadway', 'Clark St', 'Sheridan Rd', 'Lake Shore Dr', 'Wilson Ave', 'Foster Ave', 'Lawrence Ave', 'Diversey Pkwy'],
    landmarks: ['Wrigley Field', 'the Lincoln Park Zoo', 'the Peggy Notebaert Nature Museum', 'Montrose Harbor', 'the Aragon Ballroom'],
  },
  w: {
    streets: ['Division St', 'Chicago Ave', 'Grand Ave', 'Milwaukee Ave', 'North Ave', 'Augusta Blvd', 'Ogden Ave', 'Kedzie Ave'],
    landmarks: ['the Logan Square monument', 'the Humboldt Park lagoon', 'the 606 trail', 'the Garfield Park Conservatory', 'the historic Wicker Park'],
  },
  c: {
    streets: ['Michigan Ave', 'State St', 'Wacker Dr', 'LaSalle St', 'Franklin St', 'Clark St', 'Adams St', 'Randolph St', 'Madison St'],
    landmarks: ['the Willis Tower', 'Navy Pier', 'Millennium Park', 'the Art Institute of Chicago', 'the Chicago Theatre', 'the Merchandise Mart', 'the Bean'],
  },
  e: {
    streets: ['Lake Shore Dr', 'Michigan Ave', 'Rush St', 'Dearborn St', 'LaSalle St', 'Clark St', 'Division St', 'Oak St'],
    landmarks: ['the John Hancock Center', 'the Magnificent Mile', 'Oak Street Beach', 'the Water Tower', 'the Museum of Contemporary Art'],
  },
  sw: {
    streets: ['Archer Ave', 'Cermak Rd', '26th St', '31st St', 'Western Ave', 'Ashland Ave', 'Kedzie Ave', 'Pulaski Rd'],
    landmarks: ['Midway International Airport', 'the National Museum of Mexican Art', 'the Bridgeport Art Center', 'the McKinley Park lagoon'],
  },
  s: {
    streets: ['King Dr', 'Cottage Grove Ave', 'Garfield Blvd', '47th St', '63rd St', 'Halsted St', 'State St', 'Michigan Ave'],
    landmarks: ['the University of Chicago', 'the Museum of Science and Industry', 'the DuSable Museum of African American History', 'Promontory Point', 'the Bronzeville Walk of Fame'],
  },
  se: {
    streets: ['Stony Island Ave', 'South Shore Dr', '79th St', '87th St', '95th St', 'Cottage Grove Ave', 'Jeffery Blvd', 'Torrence Ave', '100th St', '111th St'],
    landmarks: ['the Pullman National Monument', 'the South Shore Cultural Center', 'Rainbow Beach', 'the Calumet River'],
  },
};

/** Through-roads that always make sense regardless of zone (lakefront, expressways). */
export const CHICAGO_THROUGH_STREETS = [
  'Lake Shore Dr', 'Michigan Ave', 'State St', 'Clark St', 'Halsted St', 'Ashland Ave', 'Western Ave',
  'the Kennedy Expy (I-90/94)', 'the Eisenhower Expy (I-290)', 'the Stevenson Expy (I-55)',
  'the Dan Ryan Expy (I-90/94)', 'the Bishop Ford Fwy (I-94)',
];

/** Generic Chicago landmarks for when a specific zone has no pool hit. */
export const CHICAGO_CITY_LANDMARKS = [
  'the Willis Tower', 'Millennium Park', 'Navy Pier', 'the Art Institute of Chicago',
  'the Chicago Theatre', 'the Bean', 'Wrigley Field', 'the Lincoln Park Zoo',
  'the Museum of Science and Industry', 'the Field Museum', 'the Shedd Aquarium',
  'the Adler Planetarium', 'the Chicago Riverwalk', "O'Hare International Airport",
];

/** All zone names in patrol order (matches patrolZones DIRECTION_NAMES). */
export const CHICAGO_ZONE_NAMES: Record<string, string> = {
  nw: 'the Northwest Side', n: 'the North Side', ne: 'the North Lakefront',
  w: 'the West Side', c: 'Downtown', e: 'the Near North',
  sw: 'the Southwest Side', s: 'the South Side', se: 'the Far Southeast Side',
};

/** Streets used when no zone matches (through-roads + a central Chicago mix). */
export const CHICAGO_FALLBACK_STREETS = [
  ...CHICAGO_THROUGH_STREETS,
  'Michigan Ave', 'State St', 'Clark St', 'Halsted St', 'Western Ave',
  'Milwaukee Ave', 'Lake Shore Dr', 'Cicero Ave',
];
