// ============================================
// Dispatch HQ — Berlin Street & District Data
// ============================================
// Real State of Berlin road names + district names so radio traffic in a
// Berlin campaign references actual streets and neighbourhoods instead of
// the West Memphis defaults. Streets are grouped by patrol zone direction
// (the same nw/n/ne/w/c/e/sw/s/se grid as patrolZones) so a Central unit
// reports from Unter den Linden, a South unit from Hermannplatz, etc. The
// grid spans the whole State of Berlin (all 12 boroughs inside the city
// limits), matching the precise boundary — Potsdam, Bernau, and other
// Brandenburg municipalities sit outside the ring.
//
// SUBURB RULE (v0.35.x): Berlin is ringed by Brandenburg towns — Potsdam,
// Falkensee, Bernau, Oranienburg, Königs Wusterhausen… Never list those
// as a place/landmark/zone name: they must not read as addressable
// locations inside the dispatch area. Street NAMES that pass through the
// city (Straße des 17. Juni, Bundesallee, Karl-Marx-Allee) are fine — the
// roads run through Berlin — and are exempted explicitly in
// cityStreets.test.ts. Enforced by cityStreets.test.ts.

import type { ZoneStreetData } from './cityStreets';

/** Per-zone street pools (real Berlin roads). */
export const BERLIN_ZONE_STREETS: Record<string, ZoneStreetData> = {
  nw: {
    streets: ['Kaiserdamm', 'Bismarckstraße', 'Wilmersdorfer Straße', 'Brandenburgische Straße', 'Kurfürstendamm', 'Bundesallee', 'Holsteinische Straße', 'Lehrter Straße', 'Siemensdamm', 'Sömmeringstraße'],
    landmarks: ['the Kaiser Wilhelm Memorial Church', 'the Kurfürstendamm', 'the Schloss Charlottenburg gardens', 'the_iceland park', 'the Tech Museum'],
  },
  n: {
    streets: ['Schönhauser Allee', 'Eberswalder Straße', 'Greifswalder Straße', 'Schloßstraße', 'Wollankstraße', 'Prenzlauer Berg Straße', 'Kollwitzstraße', 'Hochstraße', 'Bötzowstraße'],
    landmarks: ['the Mauerpark', 'the Berlin Wall Memorial', 'the Kulturbrauerei', 'the Volkspark Friedrichshain', 'the Prenzlauer Berg'],
  },
  ne: {
    streets: ['Marienburger Allee', 'Hohen Schönhauser Straße', 'Rigasche Straße', 'Frankfurter Allee', 'Landsberger Allee', 'Hausburgstraße', 'Rummelsburger Straße', 'Karl-Liebknecht-Straße'],
    landmarks: ['the Tierpark Berlin', 'the East Side Gallery', 'the Stasi Museum', 'the Weberwiese', 'the Volkspark Lichtenberg'],
  },
  w: {
    streets: ['Straße des 17. Juni', 'Tiergartenstraße', 'Budapester Straße', 'Landwehrkanal', 'Klingelhöferstraße', 'Bendlerstraße', 'John-Foster-Dulles-Allee', 'Claire-Waldoff-Steig'],
    landmarks: ['the Brandenburger Tor', 'the Reichstag', 'the Tiergarten', 'the Holocaust Memorial', 'the Memorial to Murdered Jews of Europe'],
  },
  c: {
    streets: ['Unter den Linden', 'Friedrichstraße', 'Karl-Liebknecht-Straße', 'Leipziger Straße', 'Wilhelmstraße', 'Markgrafenstraße', 'Mauerstraße', 'Behrenstraße', 'Jägerstraße', 'Pariser Platz', 'Glinkastraße'],
    landmarks: ['the Brandenburger Tor', 'Museum Island', 'the Berliner Dom', 'the Fernsehturm', 'the Nikolaiviertel', 'the Hackescher Markt', 'the Gendarmenmarkt'],
  },
  e: {
    streets: ['Karl-Marx-Allee', 'Frankfurter Straße', 'Boxhagener Straße', 'Grünauer Straße', 'Forster Straße', 'Kopenicker Straße', 'Admiralstraße', 'Lichtenauer Straße'],
    landmarks: ['the East Side Gallery', 'the RAW Gelände', 'the Treptower Park', 'the Spree riverbanks', 'the Schillingbrücke'],
  },
  sw: {
    streets: ['Hermannstraße', 'Bergmannstraße', 'Karl-Marx-Straße', 'Gneisenaustraße', 'Bassengestraße', 'Mehringdamm', 'Arndtstraße', 'Chamissoplatz'],
    landmarks: ['the Mehringplatz', 'the Tempelhofer Feld', 'the Hallesches Tor', 'the Bergmannkiez', 'the Viktoriapark'],
  },
  s: {
    streets: ['Tempelhofer Damm', 'Friedrichstraße', 'Mariusenstraße', 'Hermannplatz', 'Gradestraße', 'Britzer Damm', 'Rudower Straße', 'Karl-Marx-Straße'],
    landmarks: ['the Tempelhof Airport', 'the Neukölln Culture Center', 'the Volkspark Britz', 'the Rudower Chaussee', 'the Britzer Garten'],
  },
  se: {
    streets: ['Sonnenallee', 'Wendenstraße', 'Köpenicker Straße', 'Altglienicker Straße', 'Forster Damm', 'Adlershofer Straße', 'An der Schillingbrücke'],
    landmarks: ['the Köpenick Old Town', 'the Müggelsee', 'the Spree', 'the Treptower Park', 'the Schöneweide Culture Factory'],
  },
};

/** Streets that make sense in any zone (the Stadtbahn, the grands boulevards, the ring). */
export const BERLIN_THROUGH_STREETS = [
  'the Ringbahn', 'Unter den Linden', 'Karl-Marx-Allee', 'Bundesallee', 'Bismarckstraße',
  'the Stadtbahn', 'the Spree', 'the Landwehrkanal',
];

/** Generic Berlin landmarks for when a specific zone has no pool hit. */
export const BERLIN_CITY_LANDMARKS = [
  'the Spree', 'the Brandenburger Tor', 'the Fernsehturm', 'Museum Island', 'the Reichstag',
  'the East Side Gallery', 'the Tempelhofer Feld', 'the Tiergarten', 'the Kaiser Wilhelm Memorial Church', 'the Berlin Wall Memorial',
];

/** Real Berlin district names keyed by zone id. */
export const BERLIN_ZONE_NAMES: Record<string, string> = {
  nw: 'Charlottenburg', n: 'Prenzlauer Berg', ne: 'Lichtenberg',
  w: 'the Tiergarten', c: 'Mitte', e: 'Friedrichshain',
  sw: 'Neukölln', s: 'Tempelhof', se: 'Köpenick',
};

/** Streets used when no zone matches (through-roads + a central mix). */
export const BERLIN_FALLBACK_STREETS = [
  ...BERLIN_THROUGH_STREETS,
  'Friedrichstraße', 'Unter den Linden', 'Karl-Marx-Allee', 'Kurfürstendamm', 'Bundesallee', 'Karl-Marx-Straße',
];
