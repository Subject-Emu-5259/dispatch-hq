import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  streetsForZone,
  landmarksForZone,
  zoneNameForId,
  crossStreetsForZone,
  setCityStreetsContext,
  preloadCityStreetData,
  THROUGH_STREETS,
  CITY_LANDMARKS,
  ZONE_STREETS,
  ZONE_NAMES,
} from './cityStreets';
import {
  LOS_ANGELES_ZONE_STREETS,
  LOS_ANGELES_THROUGH_STREETS,
  LOS_ANGELES_CITY_LANDMARKS,
  LOS_ANGELES_ZONE_NAMES,
} from './cityStreets.losAngeles';
import {
  CHICAGO_ZONE_STREETS,
  CHICAGO_THROUGH_STREETS,
  CHICAGO_CITY_LANDMARKS,
  CHICAGO_ZONE_NAMES,
} from './cityStreets.chicago';
import {
  HOUSTON_ZONE_STREETS,
  HOUSTON_THROUGH_STREETS,
  HOUSTON_CITY_LANDMARKS,
  HOUSTON_ZONE_NAMES,
} from './cityStreets.houston';
import {
  LONDON_ZONE_STREETS,
  LONDON_THROUGH_STREETS,
  LONDON_CITY_LANDMARKS,
  LONDON_ZONE_NAMES,
} from './cityStreets.london';
import {
  PARIS_ZONE_STREETS,
  PARIS_THROUGH_STREETS,
  PARIS_CITY_LANDMARKS,
  PARIS_ZONE_NAMES,
} from './cityStreets.paris';
import {
  BERLIN_ZONE_STREETS,
  BERLIN_THROUGH_STREETS,
  BERLIN_CITY_LANDMARKS,
  BERLIN_ZONE_NAMES,
} from './cityStreets.berlin';

// Preload lazy city street data before tests run.
beforeAll(async () => {
  await preloadCityStreetData();
});

// Reset the module context between tests so no test leaks a city into another.
beforeEach(() => {
  setCityStreetsContext(null);
});

describe('cityStreets — default (West Memphis) pool is unchanged', () => {
  it('returns the exact pre-v0.33 West Memphis streets/landmarks/zone names', () => {
    expect(streetsForZone('c')).toEqual([...ZONE_STREETS.c.streets, ...THROUGH_STREETS]);
    expect(streetsForZone(null)).toEqual([...THROUGH_STREETS, 'Broadway Ave', 'Missouri St', 'Barton Ave', 'Service Rd', 'Ingram Blvd', 'Tyler Ave', '7th St', '16th St']);
    expect(landmarksForZone('c')).toEqual([...ZONE_STREETS.c.landmarks, ...CITY_LANDMARKS]);
    expect(zoneNameForId('c')).toBe(ZONE_NAMES.c);
    expect(zoneNameForId('nw')).toBe(ZONE_NAMES.nw);
    expect(zoneNameForId(null)).toBe('the city');
  });

  it('unknown cities fall back to West Memphis', () => {
    expect(streetsForZone('c', 'Somewhere Else')).toEqual([...ZONE_STREETS.c.streets, ...THROUGH_STREETS]);
    expect(zoneNameForId('c', 'Somewhere Else')).toBe(ZONE_NAMES.c);
  });
});

describe('cityStreets — Los Angeles pool', () => {
  it('serves real LA streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'Los Angeles')).toContain('Wilshire Blvd');
    expect(streetsForZone('c', 'Los Angeles')).toContain('Figueroa St');
    expect(streetsForZone('w', 'Los Angeles')).toContain('Santa Monica Blvd');
    expect(streetsForZone('nw', 'Los Angeles')).toContain('Ventura Blvd');
    expect(streetsForZone('s', 'Los Angeles')).toContain('Crenshaw Blvd');
  });

  it('names LA districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'Los Angeles')).toBe('Downtown');
    expect(zoneNameForId('w', 'Los Angeles')).toBe('the Westside');
    expect(zoneNameForId('nw', 'Los Angeles')).toBe('the San Fernando Valley');
    expect(zoneNameForId('s', 'Los Angeles')).toBe('South LA');
    expect(zoneNameForId('se', 'Los Angeles')).toBe('the Harbor');
  });

  it('lands LA landmarks for zone + city fallback pools', () => {
    const central = landmarksForZone('c', 'Los Angeles');
    expect(central).toContain('Union Station');
    expect(central).toContain('Los Angeles City Hall');
    expect(central).toContain('the Crypto.com Arena');
    const generic = landmarksForZone(null, 'Los Angeles');
    expect(generic).toEqual(LOS_ANGELES_CITY_LANDMARKS);
    expect(generic).toContain('the Griffith Observatory');
  });

  it('freeway/through streets come along for LA', () => {
    const any = streetsForZone('c', 'Los Angeles');
    for (const freeway of ['the Hollywood Fwy (US-101)', 'the San Diego Fwy (I-405)']) {
      expect(any).toContain(freeway);
    }
  });

  it('cross streets pick two distinct LA roads', () => {
    const [a, b] = crossStreetsForZone('c', 'Los Angeles');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'Los Angeles')).toContain(a);
    expect(streetsForZone('c', 'Los Angeles')).toContain(b);
  });
});

describe('cityStreets — Chicago pool', () => {
  it('serves real Chicago streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'Chicago')).toContain('State St');
    expect(streetsForZone('c', 'Chicago')).toContain('Michigan Ave');
    expect(streetsForZone('n', 'Chicago')).toContain('Clark St');
    expect(streetsForZone('nw', 'Chicago')).toContain('Milwaukee Ave');
    expect(streetsForZone('s', 'Chicago')).toContain('King Dr');
    expect(streetsForZone('se', 'Chicago')).toContain('Stony Island Ave');
  });

  it('names Chicago districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'Chicago')).toBe('Downtown');
    expect(zoneNameForId('w', 'Chicago')).toBe('the West Side');
    expect(zoneNameForId('n', 'Chicago')).toBe('the North Side');
    expect(zoneNameForId('s', 'Chicago')).toBe('the South Side');
    expect(zoneNameForId('se', 'Chicago')).toBe('the Far Southeast Side');
  });

  it('lands Chicago landmarks for zone + city fallback pools', () => {
    const loop = landmarksForZone('c', 'Chicago');
    expect(loop).toContain('the Willis Tower');
    expect(loop).toContain('Navy Pier');
    expect(loop).toContain('the Bean');
    const generic = landmarksForZone(null, 'Chicago');
    expect(generic).toEqual(CHICAGO_CITY_LANDMARKS);
    expect(generic).toContain('Wrigley Field');
    expect(generic).toContain('the Field Museum');
  });

  it('expressway/through streets come along for Chicago', () => {
    const any = streetsForZone('c', 'Chicago');
    for (const expy of ['the Kennedy Expy (I-90/94)', 'the Dan Ryan Expy (I-90/94)', 'Lake Shore Dr']) {
      expect(any).toContain(expy);
    }
  });

  it('cross streets pick two distinct Chicago roads', () => {
    const [a, b] = crossStreetsForZone('c', 'Chicago');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'Chicago')).toContain(a);
    expect(streetsForZone('c', 'Chicago')).toContain(b);
  });

  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('Chicago');
    expect(streetsForZone('c')).toContain('State St');
    expect(streetsForZone('c')).not.toContain('Broadway Ave');
    expect(zoneNameForId('w')).toBe('the West Side');
    setCityStreetsContext(null);
  });
});

describe('cityStreets — Chicago suburb rule', () => {
  // Chicago is contiguous (no LA-style enclaves) but ringed by suburbs that
  // must never read as addressable dispatch locations. Street NAMES that pass
  // through the city (Cicero Ave) are fine; place names are not.
  const PLACE_SUBURBS = ['Evanston', 'Skokie', 'Niles', 'Oak Park', 'Cicero', 'Berwyn', 'Stickney', 'Harvey', 'Blue Island', 'Hammond', 'Gary', 'Naperville', 'Schaumburg'];
  // Streets would never legitimately be these; keep the street check tight.
  const STREET_SUBURBS = ['Evanston', 'Skokie', 'Oak Park', 'Berwyn', 'Hammond'];

  it('no Chicago street pool names a suburb as a street', () => {
    for (const [zoneId, data] of Object.entries(CHICAGO_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const suburb of STREET_SUBURBS) {
          expect(s, `${zoneId} contains suburb name "${suburb}"`).not.toContain(suburb);
        }
      }
    }
    for (const t of CHICAGO_THROUGH_STREETS) {
      for (const suburb of STREET_SUBURBS) {
        expect(t).not.toContain(suburb);
      }
    }
  });

  it('no Chicago landmark or zone name names a suburb', () => {
    const places = [
      ...Object.values(CHICAGO_ZONE_NAMES),
      ...CHICAGO_CITY_LANDMARKS,
      ...Object.values(CHICAGO_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const suburb of PLACE_SUBURBS) {
        expect(place, `"${place}" names suburb "${suburb}"`).not.toContain(suburb);
      }
    }
  });

  it('every Chicago zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(CHICAGO_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(CHICAGO_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('cityStreets — Houston pool', () => {
  it('serves real Houston streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'Houston')).toContain('Main St');
    expect(streetsForZone('c', 'Houston')).toContain('Fannin St');
    expect(streetsForZone('w', 'Houston')).toContain('Westheimer Rd');
    expect(streetsForZone('nw', 'Houston')).toContain('FM 1960');
    expect(streetsForZone('s', 'Houston')).toContain('Almeda Rd');
    expect(streetsForZone('se', 'Houston')).toContain('Galveston Rd');
  });

  it('names Houston districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'Houston')).toBe('Downtown');
    expect(zoneNameForId('w', 'Houston')).toBe('the West Side');
    expect(zoneNameForId('e', 'Houston')).toBe('the East End');
    expect(zoneNameForId('s', 'Houston')).toBe('the South Side');
    expect(zoneNameForId('nw', 'Houston')).toBe('the Northwest');
  });

  it('lands Houston landmarks for zone + city fallback pools', () => {
    const downtown = landmarksForZone('c', 'Houston');
    expect(downtown).toContain('Minute Maid Park');
    expect(downtown).toContain('Discovery Green');
    const generic = landmarksForZone(null, 'Houston');
    expect(generic).toEqual(HOUSTON_CITY_LANDMARKS);
    expect(generic).toContain('the Texas Medical Center');
    expect(generic).toContain('the Galleria');
  });

  it('freeway/loop through streets come along for Houston', () => {
    const any = streetsForZone('c', 'Houston');
    for (const fwy of ['the 610 Loop', 'the Sam Houston Tollway', 'the Gulf Fwy (I-45)']) {
      expect(any).toContain(fwy);
    }
  });

  it('cross streets pick two distinct Houston roads', () => {
    const [a, b] = crossStreetsForZone('c', 'Houston');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'Houston')).toContain(a);
    expect(streetsForZone('c', 'Houston')).toContain(b);
  });

  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('Houston');
    expect(streetsForZone('c')).toContain('Main St');
    expect(streetsForZone('c')).not.toContain('Broadway Ave');
    expect(zoneNameForId('w')).toBe('the West Side');
    setCityStreetsContext(null);
  });
});

describe('cityStreets — Houston suburb rule', () => {
  // Houston is a huge annexing municipality but dozens of cities ring it and
  // even sit inside its limits (Bellaire, West University Place, the Memorial
  // Villages, Sugar Land, Katy, Pasadena…). They must never read as
  // addressable dispatch locations. Street NAMES that pass through the city
  // (Bellaire Blvd, the Katy Fwy, Galveston Rd, Tomball Pkwy) are fine.
  const PLACE_SUBURBS = ['Sugar Land', 'Katy', 'Humble', 'Pasadena', 'Baytown', 'Pearland', 'Missouri City', 'League City', 'The Woodlands', 'Galveston', 'Bellaire', 'West University', 'Southside Place', 'Hedwig', 'Bunker Hill', 'Piney Point', 'Hunters Creek', 'Hilshire', 'Spring Valley', 'Jersey Village', 'Tomball', 'Cypress', 'La Porte', 'Deer Park', 'Friendswood', 'Webster', 'Stafford', 'Conroe'];
  // Streets would never legitimately be these; keep the street check tight.
  const STREET_SUBURBS = ['Pasadena', 'Humble', 'Baytown', 'Sugar Land', 'Pearland', 'Conroe'];

  it('no Houston street pool names a suburb as a street', () => {
    for (const [zoneId, data] of Object.entries(HOUSTON_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const suburb of STREET_SUBURBS) {
          expect(s, `${zoneId} contains suburb name "${suburb}"`).not.toContain(suburb);
        }
      }
    }
    for (const t of HOUSTON_THROUGH_STREETS) {
      for (const suburb of STREET_SUBURBS) {
        expect(t).not.toContain(suburb);
      }
    }
  });

  it('no Houston landmark or zone name names a suburb', () => {
    const places = [
      ...Object.values(HOUSTON_ZONE_NAMES),
      ...HOUSTON_CITY_LANDMARKS,
      ...Object.values(HOUSTON_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const suburb of PLACE_SUBURBS) {
        // "the Cypress Creek Greenway" names the real creek/waterway that runs
        // through northwest Houston — allowed, same as LA's "San Fernando
        // Valley" carve-out. Any other Cypress reference is not.
        if (place.includes(suburb) && !(suburb === 'Cypress' && place.includes('Cypress Creek'))) {
          throw new Error(`"${place}" names suburb "${suburb}"`);
        }
      }
    }
  });

  it('every Houston zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(HOUSTON_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(HOUSTON_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('cityStreets — London pool', () => {
  it('serves real London streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'London')).toContain('Oxford St');
    expect(streetsForZone('c', 'London')).toContain('Fleet St');
    expect(streetsForZone('w', 'London')).toContain('Uxbridge Rd');
    expect(streetsForZone('e', 'London')).toContain('Whitechapel Rd');
    expect(streetsForZone('s', 'London')).toContain('Brixton Rd');
    expect(streetsForZone('se', 'London')).toContain('Greenwich High Rd');
  });

  it('names London districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'London')).toBe('Westminster');
    expect(zoneNameForId('w', 'London')).toBe('Hounslow');
    expect(zoneNameForId('e', 'London')).toBe('Stratford');
    expect(zoneNameForId('s', 'London')).toBe('Brixton');
    expect(zoneNameForId('se', 'London')).toBe('Greenwich');
  });

  it('lands London landmarks for zone + city fallback pools', () => {
    const central = landmarksForZone('c', 'London');
    expect(central).toContain('Big Ben');
    expect(central).toContain('the Shard');
    expect(central).toContain('Buckingham Palace');
    const generic = landmarksForZone(null, 'London');
    expect(generic).toEqual(LONDON_CITY_LANDMARKS);
    expect(generic).toContain('the Thames');
    expect(generic).toContain('Tower Bridge');
  });

  it('the Thames bridges come along for London', () => {
    const any = streetsForZone('c', 'London');
    for (const br of ['Westminster Bridge', 'Tower Bridge', 'London Bridge', 'Waterloo Bridge']) {
      expect(any).toContain(br);
    }
  });

  it('cross streets pick two distinct London roads', () => {
    const [a, b] = crossStreetsForZone('c', 'London');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'London')).toContain(a);
    expect(streetsForZone('c', 'London')).toContain(b);
  });

  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('London');
    expect(streetsForZone('c')).toContain('Oxford St');
    expect(streetsForZone('c')).not.toContain('Broadway Ave');
    expect(zoneNameForId('w')).toBe('Hounslow');
    setCityStreetsContext(null);
  });
});

describe('cityStreets — London suburb rule', () => {
  // London has no inner enclaves, but Greater London is ringed by separate
  // towns just outside the boundary (Watford, St Albans, Slough, Windsor,
  // Epsom, Dartford, Guildford…). They must never read as addressable
  // dispatch locations. Street NAMES that pass through the city (Watford Rd,
  // Uxbridge Rd, London Rd) are fine — the roads run through London.
  const PLACE_SUBURBS = ['Watford', 'St Albans', 'Slough', 'Windsor', 'Epsom', 'Dartford', 'Guildford', 'Reading', 'Gravesend', 'Sevenoaks', 'Waltham Cross', 'Cheshunt', 'Hemel Hempstead', 'Welwyn', 'Reigate', 'Crawley', 'Basingstoke'];
  // Streets would never legitimately be these; keep the street check tight.
  const STREET_SUBURBS = ['Watford', 'Slough', 'Dartford', 'Epsom'];

  it('no London street pool names a suburb as a street', () => {
    for (const [zoneId, data] of Object.entries(LONDON_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const suburb of STREET_SUBURBS) {
          expect(s, `${zoneId} contains suburb name "${suburb}"`).not.toContain(suburb);
        }
      }
    }
    for (const t of LONDON_THROUGH_STREETS) {
      for (const suburb of STREET_SUBURBS) {
        expect(t).not.toContain(suburb);
      }
    }
  });

  it('no London landmark or zone name names a suburb', () => {
    const places = [
      ...Object.values(LONDON_ZONE_NAMES),
      ...LONDON_CITY_LANDMARKS,
      ...Object.values(LONDON_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const suburb of PLACE_SUBURBS) {
        // "Watford Rd"-style references never appear in the place pools — only
        // street pools, which the STREET_SUBURBS check above allows.
        expect(place, `"${place}" names suburb "${suburb}"`).not.toContain(suburb);
      }
    }
  });

  it('every London zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(LONDON_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(LONDON_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('cityStreets — Paris pool', () => {
  it('serves real Paris streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'Paris')).toContain('Rue de Rivoli');
    expect(streetsForZone('c', 'Paris')).toContain('Boulevard de Sébastopol');
    expect(streetsForZone('w', 'Paris')).toContain('Avenue des Champs-Élysées');
    expect(streetsForZone('n', 'Paris')).toContain('Rue Lepic');
    expect(streetsForZone('s', 'Paris')).toContain('Avenue des Gobelins');
    expect(streetsForZone('se', 'Paris')).toContain('Rue de Bercy');
  });

  it('names Paris districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'Paris')).toBe('the Marais');
    expect(zoneNameForId('w', 'Paris')).toBe('the Champs-Élysées');
    expect(zoneNameForId('e', 'Paris')).toBe('the Bastille');
    expect(zoneNameForId('s', 'Paris')).toBe('the Gobelins');
    expect(zoneNameForId('nw', 'Paris')).toBe('Passy');
  });

  it('lands Paris landmarks for zone + city fallback pools', () => {
    const central = landmarksForZone('c', 'Paris');
    expect(central).toContain('the Louvre');
    expect(central).toContain('Notre-Dame');
    expect(central).toContain('the Pompidou Centre');
    const generic = landmarksForZone(null, 'Paris');
    expect(generic).toEqual(PARIS_CITY_LANDMARKS);
    expect(generic).toContain('the Eiffel Tower');
    expect(generic).toContain('the Arc de Triomphe');
  });

  it('the ring road and Seine bridges come along for Paris', () => {
    const any = streetsForZone('c', 'Paris');
    for (const road of ['the Boulevard Périphérique', 'Pont Neuf', 'Pont Alexandre III', 'Pont des Arts']) {
      expect(any).toContain(road);
    }
  });

  it('cross streets pick two distinct Paris roads', () => {
    const [a, b] = crossStreetsForZone('c', 'Paris');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'Paris')).toContain(a);
    expect(streetsForZone('c', 'Paris')).toContain(b);
  });

  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('Paris');
    expect(streetsForZone('c')).toContain('Rue de Rivoli');
    expect(streetsForZone('c')).not.toContain('Broadway Ave');
    expect(zoneNameForId('w')).toBe('the Champs-Élysées');
    setCityStreetsContext(null);
  });
});

describe('cityStreets — Paris suburb rule', () => {
  // Paris proper is ringed by the banlieue (Boulogne-Billancourt, Neuilly,
  // Levallois, Saint-Denis, Montreuil, Ivry, Versailles, La Défense…). They
  // must never read as addressable dispatch locations. Carve-outs: the Bois
  // de Boulogne and Bois de Vincennes are PARIS parks inside the boundary
  // (16e/12e), the Porte de Versailles is a Paris gate/quarter (15e), and
  // pass-through street names like Rue de Charenton are real roads running
  // through the city.
  const PLACE_SUBURBS = ['Boulogne', 'Neuilly', 'Levallois', 'Clichy', 'Saint-Ouen', 'Saint-Denis', 'Aubervilliers', 'Pantin', 'Bobigny', 'Montreuil', 'Vincennes', 'Charenton', 'Ivry', 'Montrouge', 'Vanves', 'Issy', 'Meudon', 'Sèvres', 'Puteaux', 'Courbevoie', 'Nanterre', 'Versailles', 'Argenteuil', 'Créteil', 'Bagnolet', 'Malakoff', 'Saint-Maur', 'Vitry', 'Saint-Mandé', 'Joinville'];
  const PLACE_CARVEOUTS = ['the Bois de Boulogne', 'the Bois de Vincennes', 'the Porte de Versailles'];
  // Streets would never legitimately be these; keep the street check tight.
  const STREET_SUBURBS = ['Neuilly', 'Boulogne', 'Vincennes', 'Charenton', 'Sèvres', 'Versailles', 'Montreuil', 'Ivry', 'Saint-Denis'];
  const STREET_CARVEOUTS = ['Rue de Charenton'];

  it('no Paris street pool names a suburb as a street', () => {
    for (const [zoneId, data] of Object.entries(PARIS_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const suburb of STREET_SUBURBS) {
          if (STREET_CARVEOUTS.includes(s)) continue;
          expect(s, `${zoneId} contains suburb name "${suburb}"`).not.toContain(suburb);
        }
      }
    }
    for (const t of PARIS_THROUGH_STREETS) {
      for (const suburb of STREET_SUBURBS) {
        expect(t).not.toContain(suburb);
      }
    }
  });

  it('no Paris landmark or zone name names a suburb', () => {
    const places = [
      ...Object.values(PARIS_ZONE_NAMES),
      ...PARIS_CITY_LANDMARKS,
      ...Object.values(PARIS_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const suburb of PLACE_SUBURBS) {
        if (PLACE_CARVEOUTS.includes(place)) continue;
        expect(place, `"${place}" names suburb "${suburb}"`).not.toContain(suburb);
      }
    }
  });

  it('every Paris zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(PARIS_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(PARIS_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('cityStreets — Berlin pool', () => {
  it('serves real Berlin streets per zone (explicit city arg)', () => {
    expect(streetsForZone('c', 'Berlin')).toContain('Unter den Linden');
    expect(streetsForZone('c', 'Berlin')).toContain('Friedrichstraße');
    expect(streetsForZone('w', 'Berlin')).toContain('Straße des 17. Juni');
    expect(streetsForZone('nw', 'Berlin')).toContain('Kurfürstendamm');
    expect(streetsForZone('n', 'Berlin')).toContain('Schönhauser Allee');
    expect(streetsForZone('sw', 'Berlin')).toContain('Hermannstraße');
  });

  it('names Berlin districts, not generic sectors', () => {
    expect(zoneNameForId('c', 'Berlin')).toBe('Mitte');
    expect(zoneNameForId('w', 'Berlin')).toBe('the Tiergarten');
    expect(zoneNameForId('nw', 'Berlin')).toBe('Charlottenburg');
    expect(zoneNameForId('e', 'Berlin')).toBe('Friedrichshain');
    expect(zoneNameForId('se', 'Berlin')).toBe('Köpenick');
  });

  it('lands Berlin landmarks for zone + city fallback pools', () => {
    const central = landmarksForZone('c', 'Berlin');
    expect(central).toContain('the Brandenburger Tor');
    expect(central).toContain('Museum Island');
    expect(central).toContain('the Fernsehturm');
    const generic = landmarksForZone(null, 'Berlin');
    expect(generic).toEqual(BERLIN_CITY_LANDMARKS);
    expect(generic).toContain('the Spree');
    expect(generic).toContain('the Reichstag');
  });

  it('the Stadtbahn and major thoroughfares come along for Berlin', () => {
    const any = streetsForZone('c', 'Berlin');
    for (const road of ['the Ringbahn', 'Unter den Linden', 'Karl-Marx-Allee', 'the Stadtbahn']) {
      expect(any).toContain(road);
    }
  });

  it('cross streets pick two distinct Berlin roads', () => {
    const [a, b] = crossStreetsForZone('c', 'Berlin');
    expect(a).not.toBe(b);
    expect(streetsForZone('c', 'Berlin')).toContain(a);
    expect(streetsForZone('c', 'Berlin')).toContain(b);
  });

  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('Berlin');
    expect(streetsForZone('c')).toContain('Unter den Linden');
    expect(streetsForZone('c')).not.toContain('Wilshire Blvd');
    expect(zoneNameForId('nw')).toBe('Charlottenburg');
    setCityStreetsContext(null);
  });
});

describe('cityStreets — Berlin suburb rule', () => {
  // Berlin is ringed by Brandenburg towns (Potsdam, Falkensee, Bernau,
  // Oranienburg, Königs Wusterhausen…). They must never read as addressable
  // dispatch locations. Street NAMES that pass through the city (Karl-Marx-
  // Allee, Bundesallee) are real roads running through Berlin and are exempted.
  const PLACE_SUBURBS = ['Potsdam', 'Falkensee', 'Bernau', 'Oranienburg', 'Königs Wusterhausen', 'Brandenburg', 'Erkner', 'Werder', 'Strausberg', 'Fürstenwalde', 'Ludwigsfelde', 'Teltow', 'Werder', 'Wittenberge', 'Senftenberg'];
  const STREET_SUBURBS = ['Potsdam', 'Falkensee', 'Bernau', 'Oranienburg', 'Königs Wusterhausen'];
  const PLACE_CARVEOUTS = ['the Brandenburger Tor'];
  const STREET_CARVEOUTS: string[] = [];

  it('no Berlin street pool names a suburb as a street', () => {
    for (const [zoneId, data] of Object.entries(BERLIN_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const suburb of STREET_SUBURBS) {
          if (STREET_CARVEOUTS.includes(s)) continue;
          expect(s, `${zoneId} contains suburb name "${suburb}"`).not.toContain(suburb);
        }
      }
    }
    for (const t of BERLIN_THROUGH_STREETS) {
      for (const suburb of STREET_SUBURBS) {
        expect(t).not.toContain(suburb);
      }
    }
  });

  it('no Berlin landmark or zone name names a suburb', () => {
    const places = [
      ...Object.values(BERLIN_ZONE_NAMES),
      ...BERLIN_CITY_LANDMARKS,
      ...Object.values(BERLIN_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const suburb of PLACE_SUBURBS) {
        if (PLACE_CARVEOUTS.includes(place)) continue;
        expect(place, `"${place}" names suburb "${suburb}"`).not.toContain(suburb);
      }
    }
  });

  it('every Berlin zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(BERLIN_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(BERLIN_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('cityStreets — active context follows the selected city', () => {
  it('setCityStreetsContext switches the pool used by the arg-less helpers', () => {
    setCityStreetsContext('Los Angeles');
    expect(streetsForZone('c')).toContain('Wilshire Blvd');
    expect(streetsForZone('c')).not.toContain('Broadway Ave');
    expect(zoneNameForId('nw')).toBe('the San Fernando Valley');
  });

  it('accepts city names with a state/country suffix', () => {
    setCityStreetsContext('Los Angeles, CA');
    expect(streetsForZone('c')).toContain('Figueroa St');
    setCityStreetsContext('Los Angeles, United States');
    expect(zoneNameForId('s')).toBe('South LA');
  });

  it('resets to the default pool on null', () => {
    setCityStreetsContext('Los Angeles');
    setCityStreetsContext(null);
    expect(streetsForZone('c')).toContain('Broadway Ave');
    expect(zoneNameForId('nw')).toBe(ZONE_NAMES.nw);
  });
});

describe('cityStreets — LA enclave rule', () => {
  // The six inner rings carve Culver City, Beverly Hills/West Hollywood, San
  // Fernando, and three small pockets out of LA — plus adjacent non-LA cities
  // must never read as addressable dispatch locations. Street NAMES that pass
  // through LA (San Fernando Rd, Santa Monica Blvd) are fine — roads exist in
  // LA City; PLACE names (landmarks, zone names) are not.
  const PLACE_ENCLAVES = ['Beverly Hills', 'West Hollywood', 'Culver City', 'San Fernando'];
  // Street names would never legitimately be these; keep the street check tight.
  const STREET_ENCLAVES = ['Beverly Hills', 'West Hollywood', 'Culver City'];
  const ADJACENT_CITIES = ['Santa Monica', 'Burbank', 'Glendale', 'Inglewood', 'Pasadena', 'Compton', 'Long Beach'];

  it('no LA street pool names a carved-out enclave as a street', () => {
    for (const [zoneId, data] of Object.entries(LOS_ANGELES_ZONE_STREETS)) {
      for (const s of data.streets) {
        for (const enclave of STREET_ENCLAVES) {
          expect(s, `${zoneId} contains enclave name "${enclave}"`).not.toContain(enclave);
        }
      }
    }
    for (const t of LOS_ANGELES_THROUGH_STREETS) {
      for (const enclave of STREET_ENCLAVES) {
        expect(t).not.toContain(enclave);
      }
    }
  });

  it('no LA landmark or zone name names a carved-out enclave', () => {
    const places = [
      ...Object.values(LOS_ANGELES_ZONE_NAMES),
      ...LOS_ANGELES_CITY_LANDMARKS,
      ...Object.values(LOS_ANGELES_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const enclave of PLACE_ENCLAVES) {
        // "the San Fernando Valley" is the real region name (almost entirely LA
        // City) — allowed. Any other reference to the enclave city is not.
        if (place.includes(enclave) && !place.includes(`${enclave} Valley`)) {
          throw new Error(`"${place}" names enclave "${enclave}"`);
        }
      }
    }
  });

  it('no LA landmark or zone name names an adjacent non-LA city', () => {
    const places = [
      ...Object.values(LOS_ANGELES_ZONE_NAMES),
      ...LOS_ANGELES_CITY_LANDMARKS,
      ...Object.values(LOS_ANGELES_ZONE_STREETS).flatMap((d) => d.landmarks),
    ];
    for (const place of places) {
      for (const adjacent of ADJACENT_CITIES) {
        expect(place, `"${place}" names adjacent city "${adjacent}"`).not.toContain(adjacent);
      }
    }
  });

  it('every LA zone has street + landmark coverage', () => {
    const zoneIds = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
    for (const z of zoneIds) {
      expect(LOS_ANGELES_ZONE_STREETS[z].streets.length).toBeGreaterThanOrEqual(4);
      expect(LOS_ANGELES_ZONE_STREETS[z].landmarks.length).toBeGreaterThanOrEqual(2);
    }
  });
});
