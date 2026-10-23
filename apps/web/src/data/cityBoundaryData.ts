// Dispatch HQ — City Boundary Data (lazy-loaded)
// ================================================
// This module is dynamically imported by cityBoundaries.ts so the heavy
// coordinate arrays (~200KB) stay out of the initial bundle.

import type { CityBoundary } from './cityBoundaries';
import { WEST_MEMPHIS_BOUNDARY } from './westMemphisBoundary';
import { MEMPHIS_BOUNDARY } from './memphisBoundary';
import { NASHVILLE_BOUNDARY } from './nashvilleBoundary';
import { LITTLE_ROCK_BOUNDARY } from './littleRockBoundary';
import { NEW_YORK_BOUNDARY } from './newYorkBoundary';
import { LOS_ANGELES_BOUNDARY } from './losAngelesBoundary';
import { CHICAGO_BOUNDARY } from './chicagoBoundary';
import { HOUSTON_BOUNDARY } from './houstonBoundary';
import { LONDON_BOUNDARY } from './londonBoundary';
import { PARIS_BOUNDARY } from './parisBoundary';
import { BERLIN_BOUNDARY } from './berlinBoundary';
import { TORONTO_BOUNDARY } from './torontoBoundary';
import { SYDNEY_BOUNDARY } from './sydneyBoundary';
import { TOKYO_BOUNDARY } from './tokyoBoundary';

export {
  WEST_MEMPHIS_BOUNDARY, MEMPHIS_BOUNDARY, NASHVILLE_BOUNDARY,
  LITTLE_ROCK_BOUNDARY, NEW_YORK_BOUNDARY, LOS_ANGELES_BOUNDARY,
  CHICAGO_BOUNDARY, HOUSTON_BOUNDARY, LONDON_BOUNDARY, PARIS_BOUNDARY,
};

export const NORMALIZED_BOUNDARIES: Record<string, CityBoundary> = {
  'west-memphis-ar': WEST_MEMPHIS_BOUNDARY,
  'west-memphis-arkansas': WEST_MEMPHIS_BOUNDARY,
  'west-memphis-us': WEST_MEMPHIS_BOUNDARY,
  'memphis-tn': MEMPHIS_BOUNDARY,
  'memphis-tennessee': MEMPHIS_BOUNDARY,
  'memphis-us': MEMPHIS_BOUNDARY,
  'nashville-tn': NASHVILLE_BOUNDARY,
  'nashville-tennessee': NASHVILLE_BOUNDARY,
  'nashville-us': NASHVILLE_BOUNDARY,
  'little-rock-ar': LITTLE_ROCK_BOUNDARY,
  'little-rock-arkansas': LITTLE_ROCK_BOUNDARY,
  'little-rock-us': LITTLE_ROCK_BOUNDARY,
  'new-york-city': NEW_YORK_BOUNDARY,
  'new-york': NEW_YORK_BOUNDARY,
  'new-york-us': NEW_YORK_BOUNDARY,
  'los-angeles': LOS_ANGELES_BOUNDARY,
  'los-angeles-us': LOS_ANGELES_BOUNDARY,
  'los-angeles-ca': LOS_ANGELES_BOUNDARY,
  'los-angeles-california': LOS_ANGELES_BOUNDARY,
  'chicago': CHICAGO_BOUNDARY,
  'chicago-us': CHICAGO_BOUNDARY,
  'chicago-il': CHICAGO_BOUNDARY,
  'chicago-illinois': CHICAGO_BOUNDARY,
  'houston': HOUSTON_BOUNDARY,
  'houston-us': HOUSTON_BOUNDARY,
  'houston-tx': HOUSTON_BOUNDARY,
  'houston-texas': HOUSTON_BOUNDARY,
  'london': LONDON_BOUNDARY,
  'london-uk': LONDON_BOUNDARY,
  'london-gb': LONDON_BOUNDARY,
  'london-england': LONDON_BOUNDARY,
  'london-united-kingdom': LONDON_BOUNDARY,
  'paris': PARIS_BOUNDARY,
  'paris-fr': PARIS_BOUNDARY,
  'paris-france': PARIS_BOUNDARY,
  'berlin': BERLIN_BOUNDARY,
  'berlin-de': BERLIN_BOUNDARY,
  'berlin-germany': BERLIN_BOUNDARY,
  'berlin-deutschland': BERLIN_BOUNDARY,

  'toronto': TORONTO_BOUNDARY,
  'toronto-on': TORONTO_BOUNDARY,
  'toronto-ontario': TORONTO_BOUNDARY,
  'toronto-ca': TORONTO_BOUNDARY,
  'toronto-canada': TORONTO_BOUNDARY,

  'sydney': SYDNEY_BOUNDARY,
  'sydney-nsw': SYDNEY_BOUNDARY,
  'sydney-new-south-wales': SYDNEY_BOUNDARY,
  'sydney-australia': SYDNEY_BOUNDARY,
  'sydney-au': SYDNEY_BOUNDARY,

  'tokyo': TOKYO_BOUNDARY,
  'tokyo-jp': TOKYO_BOUNDARY,
  'tokyo-japan': TOKYO_BOUNDARY,
  'tokyo-to': TOKYO_BOUNDARY,
};
