// ============================================\n// Dispatch HQ — Dallas Street & District Data (STAGED batch)
// ============================================
// Well-known Dallas road names + landmarks for radio dialogue, grouped by
// patrol zone direction (nw/n/ne/w/c/e/sw/s/se). Box-only bounds in v1 (no
// polygon); streets here are name pools for dialogue, not geocoded addresses.
import type { ZoneStreetData } from './cityStreets';

export const DALLAS_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: { streets: ['Harry Hines Blvd', 'Lemmon Ave', 'Mockingbird Ln', 'Inwood Rd'], landmarks: ['Love Field', 'the Medical District'] },
  n: { streets: ['McKinney Ave', 'Lemmon Ave', 'Turtle Creek Blvd', 'Cedar Springs Rd'], landmarks: ['the Katy Trail', 'the Uptown district'] },
  ne: { streets: ['Central Expy', 'Mockingbird Ln', 'Lovers Ln', 'Greenville Ave'], landmarks: ['the SMU campus area', 'White Rock Lake'] },
  w: { streets: ['Commerce St', 'Main St', 'Elm St', 'Houston St'], landmarks: ['Dealey Plaza', 'the West End district'] },
  c: { streets: ['Main St', 'Elm St', 'Commerce St', 'Akard St', 'Field St'], landmarks: ['Reunion Tower', 'Dallas City Hall', 'Klyde Warren Park'] },
  e: { streets: ['Main St', 'Elm St', 'Exposition Ave', 'Parry Ave'], landmarks: ['Fair Park', 'the Deep Ellum district'] },
  sw: { streets: ['Davis St', 'Jefferson Blvd', 'Zang Blvd', 'Illinois Ave'], landmarks: ['the Oak Cliff district', 'the Bishop Arts district'] },
  s: { streets: ['Illinois Ave', 'Ledbetter Dr', 'Lancaster Rd', 'Bonnie View Rd'], landmarks: ['the Southern Dallas district', 'the zoo area'] },
  se: { streets: ['Buckner Blvd', 'Lake June Rd', 'Elam Rd', 'Masters Dr'], landmarks: ['the Pleasant Grove district', 'the lake area'] },
};

export const DALLAS_THROUGH_STREETS = ['Central Expy', 'Mockingbird Ln', 'Lemmon Ave', 'Harry Hines Blvd', 'Main St', 'Elm St'];
export const DALLAS_CITY_LANDMARKS = ['Reunion Tower', 'Dealey Plaza', 'the American Airlines Center', 'Dallas City Hall', 'Klyde Warren Park', 'Fair Park'];
export const DALLAS_ZONE_NAMES: Record<string, string> = { nw: 'Northwest', n: 'Uptown', ne: 'Northeast', w: 'West End', c: 'Downtown', e: 'Deep Ellum', sw: 'Oak Cliff', s: 'South Dallas', se: 'Southeast' };
export const DALLAS_FALLBACK_STREETS = ['Main St', 'Elm St', 'Commerce St', 'McKinney Ave', 'Lemmon Ave', 'Mockingbird Ln'];
