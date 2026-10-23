// ============================================
// Dispatch HQ — Sydney City Streets
// ============================================
// Real Sydney streets, landmarks, and district names for radio dialogue.
// Each zone pool feeds the radio dialogue engine and mission cards.

export interface SydneyZoneData {
  streets: string[];
  landmarks: string[];
  districts: string[];
}

export const SYDNEY_STREETS: Record<string, SydneyZoneData> = {
  // ── CBD / Inner City ──
  downtown: {
    streets: [
      'George St', 'Pitt St', 'Castlereagh St', 'Elizabeth St', 'Bathurst St',
      'Druitt St', 'Park St', 'Market St', 'Clarence St', 'Kent St',
      'Church St', 'Bridge St', 'Macquarie St', 'Phillip St', 'Spring St',
      'Berry St', 'Mount St', 'West St', 'Wynyard St', 'Erskine St',
    ],
    landmarks: [
      'Sydney Tower Eye', 'Queen Victoria Building', 'Town Hall',
      'St Andrew\'s Cathedral', 'Circular Quay', 'The Rocks',
      'Museum of Sydney', 'State Library of NSW', 'Wynyard Station',
      'Martin Place', 'GPO', 'Queen Victoria Building',
    ],
    districts: ['CBD', 'The Rocks', 'Circular Quay', 'Barangaroo', 'Wynyard'],
  },

  // ── Inner West ──
  inner_west: {
    streets: [
      'Parramatta Rd', 'City Rd', 'King St', 'Enmore Rd', 'Stanmore Rd',
      'Newtown St', 'Illawarra Rd', 'Marrickville Rd', 'Victoria Rd',
      'Balmain Rd', 'Rozelle St', 'Dalmar St', 'Johnston St', 'Herbert St',
    ],
    landmarks: [
      'Newtown', 'Enmore Theatre', 'Maritime Museum',
      'Glebe Markets', 'Balmain East Ferry', 'Rozelle Bay',
      'Dulwich Hill', 'Summer Hill', 'Leichhardt',
    ],
    districts: ['Newtown', 'Marrickville', 'Glebe', 'Balmain', 'Rozelle', 'Leichhardt'],
  },

  // ── Eastern Suburbs ──
  east: {
    streets: [
      'Bondi Rd', 'Bronte Rd', 'Glenmore Rd', 'New South Head Rd',
      'Old South Head Rd', 'Ocean Ave', 'Darling Point Rd', 'McLean Rd',
      'Vaucluse Rd', 'Military Rd', 'Newtown St', 'Paddington St',
      'Oxford St', 'Stanley St', 'Anzac Pde',
    ],
    landmarks: [
      'Bondi Beach', 'Coogee Beach', 'Bronte Beach', 'Tamarama Beach',
      'Clovelly Beach', 'The Gap', 'Macquarie Lighthouse',
      'Centennial Park', 'Sydney Cricket Ground', 'Royal Randwick',
      'Queen Victoria Building', 'Museum of Sydney',
    ],
    districts: ['Bondi', 'Coogee', 'Paddington', 'Surry Hills', 'Darlinghurst', 'Vaucluse'],
  },

  // ── North Shore ──
  north: {
    streets: [
      'Military Rd', 'Pacific Hwy', 'Middle Head Rd', 'Avenue Rd',
      'Spit Bridge Rd', 'Manly Rd', 'Condamine St', 'Campbell Ave',
      'Burnt Bridge Creek Deviation', 'Wentworth Rd', 'Birkley Rd',
      'Belgrave St', 'Cliff Rd', 'Fishers Rd',
    ],
    landmarks: [
      'Sydney Harbour Bridge', 'Taronga Zoo', 'The Spit Bridge',
      'Manly Ferry', 'Balmoral Beach', 'Cremorne Point',
      'Mosman Bay', 'North Head', 'Manly Beach', 'Shelly Beach',
    ],
    districts: ['North Sydney', 'Mosman', 'Cremorne', 'Manly', 'Neutral Bay', 'Kirribilli'],
  },

  // ── West / Parramatta ──
  west: {
    streets: [
      'Parramatta Rd', 'Church St', 'George St', 'Macquarie St',
      'Victoria Rd', 'James Ruse Dr', 'M4 Western Motorway',
      'Oxford St', 'Cumberland St', 'Bank St', 'Harris St',
      'River Rd', 'Kissing Point Rd', 'Devlin St',
    ],
    landmarks: [
      'Parramatta Park', 'Old Government House', 'Parramatta Ferry',
      'Riverside Theatre', 'Rosehill Gardens', 'Harris Park',
      'Westmead Hospital', 'Parramatta Stadium', 'Epping',
    ],
    districts: ['Parramatta', 'Westmead', 'Harris Park', 'Epping', 'Rydalmere', 'Rosehill'],
  },
};

// Cross-streets for radio dialogue (paired intersections)
export const SYDNEY_CROSS_STREETS: [string, string][] = [
  ['George St', 'Bathurst St'],
  ['Pitt St', 'Market St'],
  ['George St', 'Park St'],
  ['Elizabeth St', 'Liverpool St'],
  ['Castlereagh St', 'Goulburn St'],
  ['Bondi Rd', 'Glenmore Rd'],
  ['Military Rd', 'Middle Head Rd'],
  ['Parramatta Rd', 'Church St'],
  ['Oxford St', 'Flinders St'],
  ['George St', 'Druitt St'],
];
