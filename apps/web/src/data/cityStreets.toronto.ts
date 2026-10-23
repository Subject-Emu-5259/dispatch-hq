// ============================================
// Dispatch HQ — Toronto City Streets
// ============================================
// Real Toronto streets, landmarks, and district names for radio dialogue.
// Each zone pool feeds the radio dialogue engine and mission cards.

export interface TorontoZoneData {
  streets: string[];
  landmarks: string[];
  districts: string[];
}

export const TORONTO_STREETS: Record<string, TorontoZoneData> = {
  // ── Downtown Core ──
  downtown: {
    streets: [
      'Yonge St', 'Bay St', 'University Ave', 'Queen St W', 'King St W',
      'Dundas St W', 'Front St', 'Wellington St', 'Adelaide St', 'Richmond St',
      'Queen St E', 'King St E', 'Dundas St E', 'Lombard St', 'Church St',
      'Jarvis St', 'Sherbourne St', 'Parliament St', 'George St', 'Frederick St',
    ],
    landmarks: [
      'CN Tower', 'Rogers Centre', 'Union Station', 'Roy Thomson Hall',
      'Massey Hall', 'St. Lawrence Market', 'Old City Hall', 'Nathan Phillips Square',
      'Hockey Hall of Fame', ' Ripley\'s Aquarium', 'Eaton Centre',
      'St. James Park', 'Flatiron Building', 'Gooderham Building',
    ],
    districts: ['Financial District', 'Entertainment District', 'Old Town', 'The Annex', 'Church-Wellesley'],
  },

  // ── East Toronto ──
  east: {
    streets: [
      'Queen St E', 'King St E', 'Danforth Ave', 'Gerrard St E', 'Broadview Ave',
      'Pape Ave', 'Coxwell Ave', 'Woodbine Ave', 'Victoria Park Ave',
      'Warden Ave', 'Kennedy Park Blvd', 'O\'Connor Dr', 'Cosburn Ave',
      'MCNichols Ave', 'Heath St', 'Monarch Park Ave',
    ],
    landmarks: [
      'Scarborough Bluffs', 'Gibraltar Point', 'Ontario Place',
      'Woodbine Beach', 'Ashbridges Bay', 'Centennial Park',
      'Scarborough Town Centre', 'Cedar Ridge Creative Centre',
    ],
    districts: ['Scarborough', 'East York', 'The Beaches', 'Leslieville', 'Riverdale', 'Danforth Village'],
  },

  // ── West Toronto ──
  west: {
    streets: [
      'Queen St W', 'King St W', 'Dundas St W', 'Bloor St W', 'College St',
      'Queen St W', 'Ossington Ave', 'Dovercourt Rd', 'Dufferin St',
      'Lansdowne Ave', 'Sterling Rd', 'Georgian St', 'Sorauren Ave',
      'Parkdale Blvd', 'Queen St W', 'Jameson Ave', 'Dunn Ave',
    ],
    landmarks: [
      'High Park', 'Parkdale', 'Dundas West', 'Liberty Village',
      'Exhibition Place', 'BMO Field', 'Budweiser Stage',
      'Gladstone Hotel', 'The Drake Hotel', 'Museum of Contemporary Art',
    ],
    districts: ['Parkdale', 'Liberty Village', 'Dundas West', 'Little Portugal', 'Bloordale Village', 'Junction Triangle'],
  },

  // ── North Toronto ──
  north: {
    streets: [
      'Yonge St', 'Bayview Ave', 'Mount Pleasant Rd', 'St. Clair Ave',
      'Eglinton Ave', 'Lawrence Ave', 'Sheppard Ave', 'Finch Ave',
      'Leslie St', 'Don Mills Rd', 'Victoria Park Ave', 'Saginaw Pkwy',
      'Steeles Ave', 'Jane St', 'Keele St', 'Dufferin St',
    ],
    landmarks: [
      'Casa Loma', 'Spadina Museum', 'Coldemort Park', 'Yonge-Dundas Square',
      'North York Centre', 'Mel Lastman Square', 'Bayview Village',
      'Fairview Mall', 'Don Valley', 'Evergreen Brick Works',
    ],
    districts: ['North York', 'Midtown', 'Forest Hill', 'Lawrence Park', 'Leaside', 'Willowdale'],
  },

  // ── Etobicoke ──
  etobicoke: {
    streets: [
      'Bloor St W', 'Lake Shore Blvd W', 'The Queensway', 'Dundas St W',
      'Kipling Ave', 'Islington Ave', 'Royal York Rd', 'Mimico Ave',
      'Lakeshore Blvd W', 'Evans Ave', 'Rexdale Blvd', 'Steeles Ave W',
      'Albion Rd', 'Martin Grove Rd', 'Weston Rd', 'Scarlett Rd',
    ],
    landmarks: [
      'Sherway Gardens', 'Centennial Park', 'Etobicoke Olympic Pool',
      'Montgomery\'s Inn', 'Humber Bay Park', 'Mimico Waterfront',
      'Rexdale Community Hub', 'James Gardens',
    ],
    districts: ['Etobicoke', 'Rexdale', 'Mimico', 'Humber Bay', 'Kingsway'],
  },
};

// Cross-streets for radio dialogue (paired intersections)
export const TORONTO_CROSS_STREETS: [string, string][] = [
  ['Yonge St', 'Bloor St'],
  ['Bay St', 'Queen St'],
  ['University Ave', 'Dundas St'],
  ['Queen St', 'Spadina Ave'],
  ['King St', 'Yonge St'],
  ['Dundas St', 'Spadina Ave'],
  ['Bloor St', 'Yonge St'],
  ['Queen St', 'University Ave'],
  ['Front St', 'Yonge St'],
  ['Danforth Ave', 'Broadview Ave'],
  ['Queen St', 'Parkside Dr'],
  ['Yonge St', 'Eglinton Ave'],
];
