// ============================================
// Dispatch HQ — London Street & District Data
// ============================================
// Real Greater London road names + district names so radio traffic in a London
// campaign references actual streets and neighbourhoods instead of the West
// Memphis defaults. Streets are grouped by patrol zone direction (the same
// nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Central unit reports from
// Oxford St, a South unit from Brixton Rd, etc. The grid spans the whole of
// Greater London (all 32 boroughs + the City), matching the precise boundary.
//
// SUBURB RULE (v0.34.x): London has no inner enclaves, but the region is
// ringed by separate towns just outside the boundary (Watford, St Albans,
// Slough, Windsor, Epsom, Dartford, Guildford, Waltham Cross, Cheshunt…).
// Never list those as a place/landmark/zone name: they must not read as
// addressable locations inside the dispatch area. (Street NAMES like Watford
// Rd or the Uxbridge Rd are fine — the roads run through London.) The City of
// London is NOT excluded — it is central London where dispatch happens.
// Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real London roads). */
export const LONDON_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['Edgware Rd', 'Kilburn High Rd', 'Wembley High Rd', 'Harrow Rd', 'Neasden Ln', 'Sudbury Hill', 'Uxbridge Rd', 'Finchley Rd', 'Staples Corner', 'North Circular (A406)'],
    landmarks: ['Wembley Stadium', 'the Welsh Harp reservoir', 'Harrow School', 'the Kilburn High Rd market', 'the Staples Corner flyover'],
  },
  n: {
    streets: ['High Rd (Tottenham)', 'Green Lanes', 'Wood Green High Rd', 'Church St (Enfield)', 'Chase Side', 'Cockfosters Rd', 'Southgate', 'Bury St', 'Fore St', 'Great Cambridge Rd (A10)'],
    landmarks: ['Alexandra Palace', 'Trent Park', 'Enfield Town', 'the Southgate shopping centre', 'the Tottenham Hotspur Stadium'],
  },
  ne: {
    streets: ['Lea Bridge Rd', 'Hoe St', 'Woodford New Rd', 'Ilford Ln', 'Eastern Ave (A12)', 'Romford Rd', 'Whalebone Ln', 'High St (Romford)', 'Rainham Rd', 'Chadwell Heath High Rd'],
    landmarks: ['Walthamstow Market', 'Romford Market', 'Epping Forest', 'the Ford plant at Dagenham', 'the Redbridge roundabout'],
  },
  w: {
    streets: ['Uxbridge Rd', 'Western Ave (A40)', 'Great West Rd (A4)', 'Chiswick High Rd', 'Goldhawk Rd', 'King St (Hammersmith)', 'Boston Manor Rd', 'Hounslow High St', 'Bath Rd', 'Southall Broadway'],
    landmarks: ['Heathrow Airport', 'Twickenham Stadium', 'Kew Gardens', 'Gunnersbury Park', 'Chiswick House', 'the Osterley Park'],
  },
  c: {
    streets: ['Oxford St', 'Regent St', 'Piccadilly', 'the Strand', 'Fleet St', 'Cheapside', 'Bishopsgate', 'Baker St', 'Marylebone Rd', 'Victoria St', 'Whitehall', 'Pall Mall', 'Shaftesbury Ave', 'High Holborn', 'Kingsway', 'Blackfriars Rd'],
    landmarks: ['Big Ben', 'Buckingham Palace', 'the Shard', "St Paul's Cathedral", 'Trafalgar Square', 'Piccadilly Circus', 'the British Museum', 'the Tower of London', 'Tower Bridge', 'the London Eye', 'Covent Garden', 'King\u2019s Cross St Pancras'],
  },
  e: {
    streets: ['Whitechapel Rd', 'Commercial Rd', 'Mile End Rd', 'Bow Rd', 'Roman Rd', 'Stratford High St', 'Barking Rd', 'Green St (Upton Park)', 'East India Dock Rd', 'Canning Town'],
    landmarks: ['the Olympic Park', 'Westfield Stratford', 'Canary Wharf', 'the Museum of London Docklands', 'the Tower Hamlets Cemetery Park'],
  },
  sw: {
    streets: ['Wandsworth High St', 'Putney High St', 'Upper Richmond Rd', 'Roehampton Ln', 'Kingston Rd', 'London Rd (Morden)', 'Coombe Ln', 'Malden Rd', 'Clapham Common West Side', 'Tooting High St'],
    landmarks: ['the Wimbledon tennis grounds', 'Richmond Park', 'Hampton Court Palace', 'Battersea Park', 'Wimbledon Common', 'the Tooting Bec lido'],
  },
  s: {
    streets: ['Brixton Rd', 'Camberwell New Rd', 'Walworth Rd', 'Old Kent Rd', 'Peckham High St', 'Rye Ln', 'London Rd (Norbury)', 'High St (Croydon)', 'Purley Way', 'Streatham High Rd'],
    landmarks: ['the Crystal Palace', 'Brixton Market', 'the Oval', 'Dulwich Park', 'Croydon town centre', 'Brockwell Park'],
  },
  se: {
    streets: ['Lewisham High St', 'Deptford High St', 'Greenwich High Rd', 'Woolwich Rd', 'Eltham High St', 'Sidcup High Rd', 'Bexleyheath Broadway', 'Shooters Hill', 'Blackheath Rd', 'Plumstead High St'],
    landmarks: ['the O2', 'the Royal Observatory', 'the Cutty Sark', 'the Thames Barrier', 'Greenwich Park', 'Eltham Palace'],
  },
};

/** Streets that make sense in any zone (bridges, the circulars, arterials). */
export const LONDON_THROUGH_STREETS = [
  'Westminster Bridge', 'Tower Bridge', 'London Bridge', 'Waterloo Bridge', 'Vauxhall Bridge', 'Chelsea Bridge',
  'the North Circular (A406)', 'the South Circular (A205)', 'the M25', 'the Embankment', 'the Thames riverside road',
];

/** Generic London landmarks for when a specific zone has no pool hit. */
export const LONDON_CITY_LANDMARKS = [
  'the Thames', 'the London Eye', 'Big Ben', 'Tower Bridge', 'the Shard', 'the British Museum',
  'Trafalgar Square', "St Paul's Cathedral", 'the Houses of Parliament', 'Buckingham Palace', 'the Tate Modern',
];

/** Real London district names keyed by zone id. */
export const LONDON_ZONE_NAMES: Record<string, string> = {
  nw: 'Harrow', n: 'Enfield', ne: 'Walthamstow',
  w: 'Hounslow', c: 'Westminster', e: 'Stratford',
  sw: 'Wimbledon', s: 'Brixton', se: 'Greenwich',
};

/** Streets used when no zone matches (through-roads + a central mix). */
export const LONDON_FALLBACK_STREETS = [
  ...LONDON_THROUGH_STREETS,
  'Oxford St', 'Regent St', 'Piccadilly', 'the Strand', 'Baker St', 'Whitechapel Rd', 'Brixton Rd', 'Greenwich High Rd',
];
