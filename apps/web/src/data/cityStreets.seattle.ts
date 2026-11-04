// ============================================\n// Dispatch HQ — Seattle Street & District Data (STAGED batch)
// ============================================
// Well-known Seattle road names + landmarks for radio dialogue, grouped by
// patrol zone direction (nw/n/ne/w/c/e/sw/s/se). Box-only bounds in v1 (no
// polygon); streets here are name pools for dialogue, not geocoded addresses.
import type { ZoneStreetData } from './cityStreets';

export const SEATTLE_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: { streets: ['Aurora Ave', 'Greenwood Ave', 'Phinney Ave', '85th St'], landmarks: ['the Ballard district', 'the Greenwood district'] },
  n: { streets: ['Aurora Ave', 'Leary Way', 'Market St', '24th Ave NW'], landmarks: ['the Ballard Locks', 'the Fremont district'] },
  ne: { streets: ['Roosevelt Way', 'University Way', '45th St', 'Sand Point Way'], landmarks: ['the University District', 'Green Lake Park'] },
  w: { streets: ['1st Ave', 'Alaskan Way', 'Western Ave', 'Elliott Ave'], landmarks: ['the waterfront', 'Pike Place Market'] },
  c: { streets: ['Pike St', 'Pine St', '1st Ave', '5th Ave', 'Denny Way'], landmarks: ['Pike Place Market', 'the Space Needle', 'Seattle Center'] },
  e: { streets: ['Broadway', 'Capitol Way', 'Madison St', 'Pike St'], landmarks: ['Capitol Hill', 'Volunteer Park'] },
  sw: { streets: ['California Ave', 'Fauntleroy Way', 'Admiral Way', 'Alaska St'], landmarks: ['the West Seattle district', 'Alki Beach'] },
  s: { streets: ['Rainier Ave', 'Beacon Ave', 'Martin Luther King Jr Way', 'Othello St'], landmarks: ['the Beacon Hill district', 'the Rainier Valley district'] },
  se: { streets: ['Rainier Ave', 'Martin Luther King Jr Way', 'Henderson St', 'Seward Park Ave'], landmarks: ['Seward Park', 'the Columbia City district'] },
};

export const SEATTLE_THROUGH_STREETS = ['Aurora Ave', 'Rainier Ave', '1st Ave', '5th Ave', 'Pike St', 'Broadway'];
export const SEATTLE_CITY_LANDMARKS = ['the Space Needle', 'Pike Place Market', 'Seattle Center', 'Pioneer Square', 'Kerry Park', 'the waterfront'];
export const SEATTLE_ZONE_NAMES: Record<string, string> = { nw: 'Northwest', n: 'North Seattle', ne: 'Northeast', w: 'Waterfront', c: 'Downtown', e: 'Capitol Hill', sw: 'West Seattle', s: 'South Seattle', se: 'Southeast' };
export const SEATTLE_FALLBACK_STREETS = ['Pike St', 'Pine St', '1st Ave', '5th Ave', 'Aurora Ave', 'Rainier Ave'];
