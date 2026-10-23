import { describe, it, expect, beforeAll } from 'vitest';
import { isPointInBoundary, getCityBoundary, preloadBoundaryData } from './cityBoundaries';

beforeAll(async () => {
  await preloadBoundaryData();
});

describe('cityBoundaries — Los Angeles (v0.32.0)', () => {
  let la: ReturnType<typeof getCityBoundary>;
  let laUs: ReturnType<typeof getCityBoundary>;
  let laCa: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    la = getCityBoundary('Los Angeles');
    laUs = getCityBoundary('Los Angeles', 'US');
    laCa = getCityBoundary('Los Angeles, California', 'US');
  });

  it('resolves the precise LA boundary under every key form', () => {
    expect(la?.name).toBe('Los Angeles, CA');
    expect(laUs).toBeDefined();
    expect(laCa).toBeDefined();
    expect(la === laUs && laUs === laCa).toBe(true);
  });

  it('contains real LA City neighborhoods', () => {
    // Downtown, Hollywood, the Valley, South LA, the Harbor (San Pedro).
    expect(isPointInBoundary({ lat: 34.0522, lng: -118.2437 }, la)).toBe(true);   // DTLA
    expect(isPointInBoundary({ lat: 34.1016, lng: -118.3267 }, la)).toBe(true);   // Hollywood
    expect(isPointInBoundary({ lat: 34.1984, lng: -118.4473 }, la)).toBe(true);   // Van Nuys (Valley)
    expect(isPointInBoundary({ lat: 33.9828, lng: -118.3053 }, la)).toBe(true);   // Vermont-Slauson (South LA)
    expect(isPointInBoundary({ lat: 33.7363, lng: -118.2920 }, la)).toBe(true);   // San Pedro (Harbor)
  });

  it('excludes the six carved-out enclave cities', () => {
    expect(isPointInBoundary({ lat: 34.0736, lng: -118.4004 }, la)).toBe(false);  // Beverly Hills
    expect(isPointInBoundary({ lat: 34.0900, lng: -118.3700 }, la)).toBe(false);  // West Hollywood
    expect(isPointInBoundary({ lat: 34.0211, lng: -118.3965 }, la)).toBe(false);  // Culver City
    expect(isPointInBoundary({ lat: 34.2820, lng: -118.4390 }, la)).toBe(false);  // San Fernando
  });

  it('excludes neighboring non-LA cities just outside the ring', () => {
    expect(isPointInBoundary({ lat: 34.0195, lng: -118.4912 }, la)).toBe(false);  // Santa Monica
    expect(isPointInBoundary({ lat: 34.1808, lng: -118.3090 }, la)).toBe(false);  // Burbank
    expect(isPointInBoundary({ lat: 34.1367, lng: -118.2553 }, la)).toBe(false);  // Glendale
    expect(isPointInBoundary({ lat: 33.9027, lng: -118.2650 }, la)).toBe(false);  // Inglewood
  });
});

describe('cityBoundaries — Chicago (v0.33.x)', () => {
  let chi: ReturnType<typeof getCityBoundary>;
  let chiUs: ReturnType<typeof getCityBoundary>;
  let chiIl: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    chi = getCityBoundary('Chicago');
    chiUs = getCityBoundary('Chicago', 'US');
    chiIl = getCityBoundary('Chicago, Illinois', 'US');
  });

  it('resolves the precise Chicago boundary under every key form', () => {
    expect(chi?.name).toBe('Chicago, IL');
    expect(chiUs).toBeDefined();
    expect(chiIl).toBeDefined();
    expect(chi === chiUs && chiUs === chiIl).toBe(true);
  });

  it('contains real Chicago neighborhoods', () => {
    expect(isPointInBoundary({ lat: 41.8826, lng: -87.6233 }, chi)).toBe(true);   // the Loop
    expect(isPointInBoundary({ lat: 41.9663, lng: -87.6576 }, chi)).toBe(true);   // Uptown
    expect(isPointInBoundary({ lat: 41.7943, lng: -87.5902 }, chi)).toBe(true);   // Hyde Park
    expect(isPointInBoundary({ lat: 41.8870, lng: -87.7600 }, chi)).toBe(true);   // Austin (west side)
    expect(isPointInBoundary({ lat: 41.9740, lng: -87.9070 }, chi)).toBe(true);   // O'Hare (in city limits)
    expect(isPointInBoundary({ lat: 41.6900, lng: -87.6100 }, chi)).toBe(true);   // Pullman (far southeast)
  });

  it('excludes the three carved-out enclave pockets', () => {
    expect(isPointInBoundary({ lat: 41.9639, lng: -87.8273 }, chi)).toBe(false);  // Norridge
    expect(isPointInBoundary({ lat: 41.9675, lng: -87.8067 }, chi)).toBe(false);  // Harwood Heights
    expect(isPointInBoundary({ lat: 41.6950, lng: -87.6930 }, chi)).toBe(false);  // far South Side pocket
    expect(isPointInBoundary({ lat: 41.9818, lng: -87.8294 }, chi)).toBe(false);  // O'Hare-area pocket
  });

  it('excludes ring suburbs just outside the city limits', () => {
    expect(isPointInBoundary({ lat: 42.0451, lng: -87.6877 }, chi)).toBe(false);  // Evanston
    expect(isPointInBoundary({ lat: 42.0334, lng: -87.7400 }, chi)).toBe(false);  // Skokie
    expect(isPointInBoundary({ lat: 41.8850, lng: -87.7945 }, chi)).toBe(false);  // Oak Park
    expect(isPointInBoundary({ lat: 41.8456, lng: -87.7540 }, chi)).toBe(false);  // Cicero
    expect(isPointInBoundary({ lat: 41.6100, lng: -87.6468 }, chi)).toBe(false);  // Harvey
  });
});

describe('cityBoundaries — Houston (v0.33.x)', () => {
  let hou: ReturnType<typeof getCityBoundary>;
  let houUs: ReturnType<typeof getCityBoundary>;
  let houTx: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    hou = getCityBoundary('Houston');
    houUs = getCityBoundary('Houston', 'US');
    houTx = getCityBoundary('Houston, Texas', 'US');
  });

  it('resolves the precise Houston boundary under every key form', () => {
    expect(hou?.name).toBe('Houston, TX');
    expect(houUs).toBeDefined();
    expect(houTx).toBeDefined();
    expect(hou === houUs && houUs === houTx).toBe(true);
  });

  it('contains real Houston neighborhoods', () => {
    expect(isPointInBoundary({ lat: 29.7572, lng: -95.3701 }, hou)).toBe(true);   // Downtown
    expect(isPointInBoundary({ lat: 29.7385, lng: -95.4610 }, hou)).toBe(true);   // Uptown / the Galleria
    expect(isPointInBoundary({ lat: 29.8018, lng: -95.3977 }, hou)).toBe(true);   // the Heights
    expect(isPointInBoundary({ lat: 29.6452, lng: -95.2790 }, hou)).toBe(true);   // Hobby Airport
    expect(isPointInBoundary({ lat: 29.9902, lng: -95.3368 }, hou)).toBe(true);   // Bush IAH
    expect(isPointInBoundary({ lat: 29.7090, lng: -95.4020 }, hou)).toBe(true);   // Texas Medical Center
    expect(isPointInBoundary({ lat: 29.7650, lng: -95.6400 }, hou)).toBe(true);   // Energy Corridor
  });

  it('excludes the carved-out enclave cities and pockets', () => {
    expect(isPointInBoundary({ lat: 29.7062, lng: -95.4584 }, hou)).toBe(false);  // Bellaire
    expect(isPointInBoundary({ lat: 29.7190, lng: -95.4340 }, hou)).toBe(false);  // West University Place
    expect(isPointInBoundary({ lat: 29.7070, lng: -95.4365 }, hou)).toBe(false);  // Southside Place
    expect(isPointInBoundary({ lat: 29.7589, lng: -95.5172 }, hou)).toBe(false);  // Piney Point Village
    expect(isPointInBoundary({ lat: 29.7670, lng: -95.5350 }, hou)).toBe(false);  // Bunker Hill Village
    expect(isPointInBoundary({ lat: 29.7780, lng: -95.5130 }, hou)).toBe(false);  // Hedwig Village
    expect(isPointInBoundary({ lat: 29.8486, lng: -95.5589 }, hou)).toBe(false);  // Spring Branch pocket
    expect(isPointInBoundary({ lat: 29.7560, lng: -95.2369 }, hou)).toBe(false);  // port-side pocket
  });

  it('excludes ring suburbs just outside the city limits', () => {
    expect(isPointInBoundary({ lat: 29.6910, lng: -95.2090 }, hou)).toBe(false);  // Pasadena
    expect(isPointInBoundary({ lat: 29.7350, lng: -94.9770 }, hou)).toBe(false);  // Baytown
    expect(isPointInBoundary({ lat: 29.7860, lng: -95.8230 }, hou)).toBe(false);  // Katy
    expect(isPointInBoundary({ lat: 29.6190, lng: -95.6350 }, hou)).toBe(false);  // Sugar Land
    expect(isPointInBoundary({ lat: 29.5630, lng: -95.2860 }, hou)).toBe(false);  // Pearland
    expect(isPointInBoundary({ lat: 29.9980, lng: -95.2620 }, hou)).toBe(false);  // Humble
    expect(isPointInBoundary({ lat: 29.6190, lng: -95.5380 }, hou)).toBe(false);  // Missouri City
  });
});

describe('cityBoundaries — London (v0.34.x)', () => {
  let lon: ReturnType<typeof getCityBoundary>;
  let lonUk: ReturnType<typeof getCityBoundary>;
  let lonGb: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    lon = getCityBoundary('London');
    lonUk = getCityBoundary('London', 'GB');
    lonGb = getCityBoundary('London, UK', 'GB');
  });

  it('resolves the precise Greater London boundary under every key form', () => {
    expect(lon?.name).toBe('London, UK');
    expect(lonUk).toBeDefined();
    expect(lonGb).toBeDefined();
    expect(lon === lonUk && lonUk === lonGb).toBe(true);
  });

  it('contains real London landmarks and boroughs', () => {
    expect(isPointInBoundary({ lat: 51.5007, lng: -0.1246 }, lon)).toBe(true);   // Westminster / Big Ben
    expect(isPointInBoundary({ lat: 51.5155, lng: -0.0922 }, lon)).toBe(true);   // the City of London (inside, not carved out)
    expect(isPointInBoundary({ lat: 51.5425, lng: -0.1404 }, lon)).toBe(true);   // Camden
    expect(isPointInBoundary({ lat: 51.4834, lng: -0.0060 }, lon)).toBe(true);   // Greenwich
    expect(isPointInBoundary({ lat: 51.3762, lng: -0.0982 }, lon)).toBe(true);   // Croydon
    expect(isPointInBoundary({ lat: 51.4700, lng: -0.4543 }, lon)).toBe(true);   // Heathrow (Hillingdon)
    expect(isPointInBoundary({ lat: 51.6538, lng: -0.0806 }, lon)).toBe(true);   // Enfield (north edge)
    expect(isPointInBoundary({ lat: 51.5810, lng: 0.2166 }, lon)).toBe(true);    // Havering (far east)
    expect(isPointInBoundary({ lat: 51.4060, lng: 0.0147 }, lon)).toBe(true);    // Bromley (south)
  });

  it('excludes towns just outside Greater London', () => {
    expect(isPointInBoundary({ lat: 51.6565, lng: -0.3903 }, lon)).toBe(false);  // Watford
    expect(isPointInBoundary({ lat: 51.7527, lng: -0.3393 }, lon)).toBe(false);  // St Albans
    expect(isPointInBoundary({ lat: 51.5105, lng: -0.5950 }, lon)).toBe(false);  // Slough
    expect(isPointInBoundary({ lat: 51.4817, lng: -0.6136 }, lon)).toBe(false);  // Windsor
    expect(isPointInBoundary({ lat: 51.3306, lng: -0.2665 }, lon)).toBe(false);  // Epsom
    expect(isPointInBoundary({ lat: 51.4442, lng: 0.2160 }, lon)).toBe(false);   // Dartford
    expect(isPointInBoundary({ lat: 51.2362, lng: -0.5704 }, lon)).toBe(false);  // Guildford
    expect(isPointInBoundary({ lat: 51.4543, lng: -0.9781 }, lon)).toBe(false);  // Reading
  });
});

describe('cityBoundaries — Paris (v0.34.x)', () => {
  let par: ReturnType<typeof getCityBoundary>;
  let parFr: ReturnType<typeof getCityBoundary>;
  let parF: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    par = getCityBoundary('Paris');
    parFr = getCityBoundary('Paris', 'FR');
    parF = getCityBoundary('Paris, France', 'FR');
  });

  it('resolves the precise City of Paris boundary under every key form', () => {
    expect(par?.name).toBe('Paris, FR');
    expect(parFr).toBeDefined();
    expect(parF).toBeDefined();
    expect(par === parFr && parFr === parF).toBe(true);
  });

  it('contains real Paris landmarks and arrondissements', () => {
    expect(isPointInBoundary({ lat: 48.8584, lng: 2.2945 }, par)).toBe(true);   // the Eiffel Tower (7e)
    expect(isPointInBoundary({ lat: 48.8606, lng: 2.3376 }, par)).toBe(true);   // the Louvre (1e)
    expect(isPointInBoundary({ lat: 48.8530, lng: 2.3499 }, par)).toBe(true);   // Notre-Dame (4e)
    expect(isPointInBoundary({ lat: 48.8867, lng: 2.3431 }, par)).toBe(true);   // Sacré-Cœur / Montmartre (18e)
    expect(isPointInBoundary({ lat: 48.8532, lng: 2.3690 }, par)).toBe(true);   // the Bastille (11e)
    expect(isPointInBoundary({ lat: 48.8670, lng: 2.2500 }, par)).toBe(true);   // Bois de Boulogne (16e — inside)
    expect(isPointInBoundary({ lat: 48.8290, lng: 2.4400 }, par)).toBe(true);   // Bois de Vincennes (12e — inside)
    expect(isPointInBoundary({ lat: 48.8462, lng: 2.3462 }, par)).toBe(true);   // the Panthéon (5e)
  });

  it('excludes the ring suburbs just outside the périphérique', () => {
    expect(isPointInBoundary({ lat: 48.8352, lng: 2.2400 }, par)).toBe(false);  // Boulogne-Billancourt
    expect(isPointInBoundary({ lat: 48.8845, lng: 2.2680 }, par)).toBe(false);  // Neuilly-sur-Seine
    expect(isPointInBoundary({ lat: 48.8937, lng: 2.2870 }, par)).toBe(false);  // Levallois-Perret
    expect(isPointInBoundary({ lat: 48.9362, lng: 2.3574 }, par)).toBe(false);  // Saint-Denis
    expect(isPointInBoundary({ lat: 48.8611, lng: 2.4436 }, par)).toBe(false);  // Montreuil
    expect(isPointInBoundary({ lat: 48.8478, lng: 2.4393 }, par)).toBe(false);  // Vincennes
    expect(isPointInBoundary({ lat: 48.8124, lng: 2.3850 }, par)).toBe(false);  // Ivry-sur-Seine
    expect(isPointInBoundary({ lat: 48.8240, lng: 2.2740 }, par)).toBe(false);  // Issy-les-Moulineaux
    expect(isPointInBoundary({ lat: 48.8049, lng: 2.1204 }, par)).toBe(false);  // Versailles
    expect(isPointInBoundary({ lat: 48.8919, lng: 2.2390 }, par)).toBe(false);  // La Défense (Puteaux)
  });
});

describe('cityBoundaries — Berlin (v0.35.x)', () => {
  let ber: ReturnType<typeof getCityBoundary>;
  let berDe: ReturnType<typeof getCityBoundary>;
  let berGer: ReturnType<typeof getCityBoundary>;
  beforeAll(() => {
    ber = getCityBoundary('Berlin');
    berDe = getCityBoundary('Berlin', 'DE');
    berGer = getCityBoundary('Berlin, Germany', 'DE');
  });

  it('resolves the precise State of Berlin boundary under every key form', () => {
    expect(ber?.name).toBe('Berlin, DE');
    expect(berDe).toBeDefined();
    expect(berGer).toBeDefined();
    expect(ber === berDe && berDe === berGer).toBe(true);
  });

  it('contains real Berlin landmarks and boroughs', () => {
    expect(isPointInBoundary({ lat: 52.5219, lng: 13.4132 }, ber)).toBe(true);  // Alexanderplatz (Mitte)
    expect(isPointInBoundary({ lat: 52.5163, lng: 13.3777 }, ber)).toBe(true);  // Brandenburger Tor (Mitte)
    expect(isPointInBoundary({ lat: 52.5027, lng: 13.3415 }, ber)).toBe(true);  // Kurfürstendamm (Charlottenburg)
    expect(isPointInBoundary({ lat: 52.4681, lng: 13.3890 }, ber)).toBe(true);  // Tempelhof
    expect(isPointInBoundary({ lat: 52.5347, lng: 13.1953 }, ber)).toBe(true);  // Spandau
    expect(isPointInBoundary({ lat: 52.4214, lng: 13.5763 }, ber)).toBe(true);  // Köpenick
    expect(isPointInBoundary({ lat: 52.5678, lng: 13.4029 }, ber)).toBe(true);  // Pankow
    expect(isPointInBoundary({ lat: 52.4811, lng: 13.4353 }, ber)).toBe(true);  // Neukölln
  });

  it('excludes the ring towns just outside the city limits', () => {
    expect(isPointInBoundary({ lat: 52.3906, lng: 13.0645 }, ber)).toBe(false);  // Potsdam
    expect(isPointInBoundary({ lat: 52.6775, lng: 13.5841 }, ber)).toBe(false);  // Bernau
    expect(isPointInBoundary({ lat: 52.7546, lng: 13.2366 }, ber)).toBe(false);  // Oranienburg
    expect(isPointInBoundary({ lat: 52.3006, lng: 13.6328 }, ber)).toBe(false);  // Königs Wusterhausen
    expect(isPointInBoundary({ lat: 52.4116, lng: 12.5317 }, ber)).toBe(false);  // Brandenburg an der Havel
    expect(isPointInBoundary({ lat: 52.4233, lng: 13.7522 }, ber)).toBe(false);  // Erkner
    expect(isPointInBoundary({ lat: 52.5619, lng: 13.0917 }, ber)).toBe(false);  // Falkensee
    expect(isPointInBoundary({ lat: 52.3789, lng: 12.9333 }, ber)).toBe(false);  // Werder (Havel)
  });
});
