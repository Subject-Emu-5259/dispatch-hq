// ============================================\n// Dispatch HQ — Atlanta Street & District Data (STAGED batch)
// ============================================
// Well-known Atlanta road names + landmarks for radio dialogue, grouped by
// patrol zone direction (nw/n/ne/w/c/e/sw/s/se). Box-only bounds in v1 (no
// polygon); streets here are name pools for dialogue, not geocoded addresses.
import type { ZoneStreetData } from './cityStreets';

export const ATLANTA_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: { streets: ['Northside Dr', 'Marietta St', 'Howell Mill Rd', 'Defoor Ave'], landmarks: ['the Georgia Tech campus area', 'the Westside district'] },
  n: { streets: ['Peachtree St', 'Spring St', 'West Peachtree St', 'North Ave'], landmarks: ['the Midtown district', 'the Fox Theatre'] },
  ne: { streets: ['Ponce de Leon Ave', 'Peachtree St', 'North Ave', 'Boulevard NE'], landmarks: ['Piedmont Park', 'the Poncey-Highland district'] },
  w: { streets: ['Marietta St', 'Northside Dr', 'Donald Lee Hollowell Pkwy', 'Simpson Rd'], landmarks: ['the Westside district', 'the Vine City district'] },
  c: { streets: ['Peachtree St', 'Marietta St', 'Mitchell St', 'Spring St', 'Edgewood Ave'], landmarks: ['Centennial Olympic Park', 'the Georgia Aquarium', 'the State Capitol'] },
  e: { streets: ['Edgewood Ave', 'Auburn Ave', 'Decatur St', 'Memorial Dr'], landmarks: ['the Sweet Auburn district', 'the Old Fourth Ward'] },
  sw: { streets: ['Cascade Rd', 'Campbellton Rd', 'Lee St', 'Whitehall St'], landmarks: ['the Cascade Heights district', 'the Castleberry Hill district'] },
  s: { streets: ['Metropolitan Pkwy', 'Cleveland Ave', 'Sylvan Rd', 'Langford Pkwy'], landmarks: ['the South Atlanta district', 'the airport corridor'] },
  se: { streets: ['Memorial Dr', 'Moreland Ave', 'Boulevard SE', 'Glenwood Ave'], landmarks: ['the East Atlanta district', 'the Grant Park district'] },
};

export const ATLANTA_THROUGH_STREETS = ['Peachtree St', 'Northside Dr', 'Ponce de Leon Ave', 'Memorial Dr', 'Marietta St', 'Cascade Rd'];
export const ATLANTA_CITY_LANDMARKS = ['Centennial Olympic Park', 'the Georgia Aquarium', 'the State Capitol', 'the Fox Theatre', 'Piedmont Park', 'Mercedes-Benz Stadium'];
export const ATLANTA_ZONE_NAMES: Record<string, string> = { nw: 'Northwest', n: 'Midtown', ne: 'Northeast', w: 'Westside', c: 'Downtown', e: 'Eastside', sw: 'Southwest', s: 'South Atlanta', se: 'Southeast' };
export const ATLANTA_FALLBACK_STREETS = ['Peachtree St', 'Marietta St', 'Edgewood Ave', 'North Ave', 'Spring St', 'Memorial Dr'];
