// Dispatch HQ — City Street Data (lazy-loaded)
// ================================================
// This module is dynamically imported by cityStreets.ts so the heavy
// street/landmark arrays (~76KB) stay out of the initial bundle.

import { LOS_ANGELES_ZONE_STREETS, LOS_ANGELES_THROUGH_STREETS, LOS_ANGELES_CITY_LANDMARKS, LOS_ANGELES_ZONE_NAMES, LOS_ANGELES_FALLBACK_STREETS } from './cityStreets.losAngeles';
import { CHICAGO_ZONE_STREETS, CHICAGO_THROUGH_STREETS, CHICAGO_CITY_LANDMARKS, CHICAGO_ZONE_NAMES, CHICAGO_FALLBACK_STREETS } from './cityStreets.chicago';
import { HOUSTON_ZONE_STREETS, HOUSTON_THROUGH_STREETS, HOUSTON_CITY_LANDMARKS, HOUSTON_ZONE_NAMES, HOUSTON_FALLBACK_STREETS } from './cityStreets.houston';
import { LONDON_ZONE_STREETS, LONDON_THROUGH_STREETS, LONDON_CITY_LANDMARKS, LONDON_ZONE_NAMES, LONDON_FALLBACK_STREETS } from './cityStreets.london';
import { PARIS_ZONE_STREETS, PARIS_THROUGH_STREETS, PARIS_CITY_LANDMARKS, PARIS_ZONE_NAMES, PARIS_FALLBACK_STREETS } from './cityStreets.paris';
import { BERLIN_ZONE_STREETS, BERLIN_THROUGH_STREETS, BERLIN_CITY_LANDMARKS, BERLIN_ZONE_NAMES, BERLIN_FALLBACK_STREETS } from './cityStreets.berlin';
import { TORONTO_STREETS } from './cityStreets.toronto';
import { SYDNEY_STREETS } from './cityStreets.sydney';
import { TOKYO_STREETS } from './cityStreets.tokyo';
import { ST_LOUIS_ZONE_STREETS, ST_LOUIS_THROUGH_STREETS, ST_LOUIS_CITY_LANDMARKS, ST_LOUIS_ZONE_NAMES, ST_LOUIS_FALLBACK_STREETS } from './cityStreets.stLouis';
import { DALLAS_ZONE_STREETS, DALLAS_THROUGH_STREETS, DALLAS_CITY_LANDMARKS, DALLAS_ZONE_NAMES, DALLAS_FALLBACK_STREETS } from './cityStreets.dallas';
import { ATLANTA_ZONE_STREETS, ATLANTA_THROUGH_STREETS, ATLANTA_CITY_LANDMARKS, ATLANTA_ZONE_NAMES, ATLANTA_FALLBACK_STREETS } from './cityStreets.atlanta';
import { SEATTLE_ZONE_STREETS, SEATTLE_THROUGH_STREETS, SEATTLE_CITY_LANDMARKS, SEATTLE_ZONE_NAMES, SEATTLE_FALLBACK_STREETS } from './cityStreets.seattle';

import type { CityStreetPool } from './cityStreets';

// West Memphis default pool (inline — small, always needed).
const WM_ZONE_STREETS: Record<string, { streets: string[]; landmarks: string[] }> = {
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

const WM_THROUGH_STREETS = [
  'Interstate 40', 'Interstate 55', 'Broadway Ave', 'Missouri St',
  'the river bridge', 'the levee road',
];

const WM_CITY_LANDMARKS = [
  'City Hall', 'the civic center', 'the police station', 'the courthouse plaza',
  'the river bridge', 'the levee trail', 'the municipal airport',
  'Mid-South Community College', 'Southland Park', 'the outlet mall',
  'the I-40 interchange', 'the I-55 interchange',
];

const WM_ZONE_NAMES: Record<string, string> = {
  nw: 'Northwest District', n: 'Uptown', ne: 'Northeast Heights',
  w: 'Westside', c: 'Downtown', e: 'East End',
  sw: 'Southwest Quarter', s: 'Southside', se: 'Southeast Industrial',
};

const WM_FALLBACK_STREETS = [
  ...WM_THROUGH_STREETS,
  'Broadway Ave', 'Missouri St', 'Barton Ave', 'Service Rd', 'Ingram Blvd', 'Tyler Ave', '7th St', '16th St',
];

export const CITY_STREET_POOLS: Record<string, CityStreetPool> = {
  'west memphis': {
    zoneStreets: WM_ZONE_STREETS,
    throughStreets: WM_THROUGH_STREETS,
    cityLandmarks: WM_CITY_LANDMARKS,
    zoneNames: WM_ZONE_NAMES,
    fallbackStreets: WM_FALLBACK_STREETS,
  },
  'los angeles': {
    zoneStreets: LOS_ANGELES_ZONE_STREETS,
    throughStreets: LOS_ANGELES_THROUGH_STREETS,
    cityLandmarks: LOS_ANGELES_CITY_LANDMARKS,
    zoneNames: LOS_ANGELES_ZONE_NAMES,
    fallbackStreets: LOS_ANGELES_FALLBACK_STREETS,
  },
  'chicago': {
    zoneStreets: CHICAGO_ZONE_STREETS,
    throughStreets: CHICAGO_THROUGH_STREETS,
    cityLandmarks: CHICAGO_CITY_LANDMARKS,
    zoneNames: CHICAGO_ZONE_NAMES,
    fallbackStreets: CHICAGO_FALLBACK_STREETS,
  },
  'houston': {
    zoneStreets: HOUSTON_ZONE_STREETS,
    throughStreets: HOUSTON_THROUGH_STREETS,
    cityLandmarks: HOUSTON_CITY_LANDMARKS,
    zoneNames: HOUSTON_ZONE_NAMES,
    fallbackStreets: HOUSTON_FALLBACK_STREETS,
  },
  'london': {
    zoneStreets: LONDON_ZONE_STREETS,
    throughStreets: LONDON_THROUGH_STREETS,
    cityLandmarks: LONDON_CITY_LANDMARKS,
    zoneNames: LONDON_ZONE_NAMES,
    fallbackStreets: LONDON_FALLBACK_STREETS,
  },
  'paris': {
    zoneStreets: PARIS_ZONE_STREETS,
    throughStreets: PARIS_THROUGH_STREETS,
    cityLandmarks: PARIS_CITY_LANDMARKS,
    zoneNames: PARIS_ZONE_NAMES,
    fallbackStreets: PARIS_FALLBACK_STREETS,
  },
  'berlin': {
    zoneStreets: BERLIN_ZONE_STREETS,
    throughStreets: BERLIN_THROUGH_STREETS,
    cityLandmarks: BERLIN_CITY_LANDMARKS,
    zoneNames: BERLIN_ZONE_NAMES,
    fallbackStreets: BERLIN_FALLBACK_STREETS,
  },
  'toronto': {
    zoneStreets: Object.fromEntries(
      Object.entries(TORONTO_STREETS).map(([k, v]: [string, { streets: string[]; landmarks: string[] }]) => [k, { streets: v.streets, landmarks: v.landmarks }])
    ),
    throughStreets: ['Yonge St', 'University Ave', 'Dufferin St', 'Don Valley Parkway', 'Gardiner Expressway'],
    cityLandmarks: ['CN Tower', 'Union Station', 'Rogers Centre', 'Nathan Phillips Square', 'Casa Loma', 'St. Lawrence Market'],
    zoneNames: Object.fromEntries(
      Object.entries(TORONTO_STREETS).map(([k, v]: [string, { districts: string[] }]) => [k, v.districts[0] ?? k])
    ),
    fallbackStreets: ['Yonge St', 'Bay St', 'Queen St', 'King St', 'Dundas St', 'Bloor St', 'University Ave', 'Front St'],
  },
  'sydney': {
    zoneStreets: Object.fromEntries(
      Object.entries(SYDNEY_STREETS).map(([k, v]: [string, { streets: string[]; landmarks: string[] }]) => [k, { streets: v.streets, landmarks: v.landmarks }])
    ),
    throughStreets: ['George St', 'Parramatta Rd', 'Military Rd', 'Pitt St', 'Anzac Pde'],
    cityLandmarks: ['Sydney Tower Eye', 'Queen Victoria Building', 'Circular Quay', 'The Rocks', 'Sydney Harbour Bridge', 'Bondi Beach'],
    zoneNames: Object.fromEntries(
      Object.entries(SYDNEY_STREETS).map(([k, v]: [string, { districts: string[] }]) => [k, v.districts[0] ?? k])
    ),
    fallbackStreets: ['George St', 'Pitt St', 'Castlereagh St', 'Elizabeth St', 'Market St', 'Bathurst St', 'Druitt St', 'Park St'],
  },
  'tokyo': {
    zoneStreets: Object.fromEntries(
      Object.entries(TOKYO_STREETS).map(([k, v]: [string, { streets: string[]; landmarks: string[] }]) => [k, { streets: v.streets, landmarks: v.landmarks }])
    ),
    throughStreets: ['Shinjuku-dōri', 'Meiji-dōri', 'Yasukuni-dōri', 'Aoyama-dōri', 'Harumi-dōri'],
    cityLandmarks: ['Tokyo Station', 'Shibuya Crossing', 'Shinjuku Station', 'Sensō-ji', 'Tokyo Tower', 'Imperial Palace'],
    zoneNames: Object.fromEntries(
      Object.entries(TOKYO_STREETS).map(([k, v]: [string, { districts: string[] }]) => [k, v.districts[0] ?? k])
    ),
    fallbackStreets: ['Chūō-dōri', 'Shinjuku-dōri', 'Meiji-dōri', 'Ginza-dōri', 'Harumi-dōri', 'Yasukuni-dōri', 'Aoyama-dōri', 'Roppongi-dōri'],
  },
  // Staged batch: four new US cities (box-only bounds, no polygon yet).
  'st. louis': {
    zoneStreets: ST_LOUIS_ZONE_STREETS,
    throughStreets: ST_LOUIS_THROUGH_STREETS,
    cityLandmarks: ST_LOUIS_CITY_LANDMARKS,
    zoneNames: ST_LOUIS_ZONE_NAMES,
    fallbackStreets: ST_LOUIS_FALLBACK_STREETS,
  },
  'dallas': {
    zoneStreets: DALLAS_ZONE_STREETS,
    throughStreets: DALLAS_THROUGH_STREETS,
    cityLandmarks: DALLAS_CITY_LANDMARKS,
    zoneNames: DALLAS_ZONE_NAMES,
    fallbackStreets: DALLAS_FALLBACK_STREETS,
  },
  'atlanta': {
    zoneStreets: ATLANTA_ZONE_STREETS,
    throughStreets: ATLANTA_THROUGH_STREETS,
    cityLandmarks: ATLANTA_CITY_LANDMARKS,
    zoneNames: ATLANTA_ZONE_NAMES,
    fallbackStreets: ATLANTA_FALLBACK_STREETS,
  },
  'seattle': {
    zoneStreets: SEATTLE_ZONE_STREETS,
    throughStreets: SEATTLE_THROUGH_STREETS,
    cityLandmarks: SEATTLE_CITY_LANDMARKS,
    zoneNames: SEATTLE_ZONE_NAMES,
    fallbackStreets: SEATTLE_FALLBACK_STREETS,
  },
};
