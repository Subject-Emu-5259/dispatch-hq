// ============================================\n// Dispatch HQ — St. Louis Street & District Data (STAGED batch)
// ============================================
// Well-known St. Louis road names + landmarks for radio dialogue, grouped
// by patrol zone direction (the same nw/n/ne/w/c/e/sw/s/se grid as
// patrolZones). No polygon ships with this city in v1 (box-only bounds);
// streets here are name pools for dialogue, not geocoded addresses.
import type { ZoneStreetData } from './cityStreets';

export const ST_LOUIS_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: { streets: ['Natural Bridge Ave', 'Kingshighway Blvd', 'Delmar Blvd', 'Page Blvd'], landmarks: ['Forest Park', 'the Missouri History Museum'] },
  n: { streets: ['Broadway', 'N Florissant Ave', 'Riverview Blvd', 'Hall St'], landmarks: ['the Mississippi riverfront', 'the North Riverfront Park'] },
  ne: { streets: ['Broadway', 'Cass Ave', 'N 14th St', 'Carr St'], landmarks: ['the Old North neighborhood', 'the riverfront trail'] },
  w: { streets: ['Delmar Blvd', 'Olive St', 'Lindell Blvd', 'Forest Park Ave'], landmarks: ['Forest Park', 'the Saint Louis Art Museum', 'the Missouri Botanical Garden'] },
  c: { streets: ['Market St', 'Olive St', 'Tucker Blvd', 'Broadway', 'Washington Ave'], landmarks: ['the Gateway Arch', 'Busch Stadium', 'City Hall', 'Union Station'] },
  e: { streets: ['Broadway', 'Chouteau Ave', 'Lumiere Pl', 'Cole St'], landmarks: ['the riverfront', 'the Gateway Arch grounds'] },
  sw: { streets: ['Gravois Ave', 'Chippewa St', 'Grand Blvd', 'Arsenal St'], landmarks: ['the Missouri Botanical Garden', 'Tower Grove Park'] },
  s: { streets: ['Grand Blvd', 'Gravois Ave', 'Loughborough Ave', 'Virginia Ave'], landmarks: ['Tower Grove Park', 'the South Grand district'] },
  se: { streets: ['Broadway', 'Cherokee St', 'Jefferson Ave', 'Chippewa St'], landmarks: ['the Cherokee Street district', 'the riverfront'] },
};

export const ST_LOUIS_THROUGH_STREETS = ['Kingshighway Blvd', 'Grand Blvd', 'Gravois Ave', 'Delmar Blvd', 'Market St', 'Broadway'];
export const ST_LOUIS_CITY_LANDMARKS = ['the Gateway Arch', 'Busch Stadium', 'Forest Park', 'Union Station', 'the Missouri Botanical Garden', 'City Hall'];
export const ST_LOUIS_ZONE_NAMES: Record<string, string> = { nw: 'Northwest', n: 'Northside', ne: 'Riverfront North', w: 'Central West End', c: 'Downtown', e: 'Riverfront', sw: 'Southwest', s: 'Southside', se: 'Southeast' };
export const ST_LOUIS_FALLBACK_STREETS = ['Market St', 'Olive St', 'Grand Blvd', 'Broadway', 'Delmar Blvd', 'Gravois Ave'];
