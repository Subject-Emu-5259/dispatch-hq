// ============================================
// Dispatch HQ — Toronto Boundary
// ============================================
// City of Toronto (single-tier municipality, Ontario).
// OSM relation 324211 (wikidata Q172), 78 outer ways stitched
// and Douglas-Peucker simplified to 31 points (eps=0.003).
// Toronto is a single-tier municipality — no inner holes.
//
// Registered under 'toronto' / 'toronto-on' / 'toronto-ontario'.

import type { CityBoundary } from './cityBoundaries';

export const TORONTO_BOUNDARY: CityBoundary = {
  name: 'Toronto, ON',
  bounds: [[43.580522, -79.637993], [43.855443, -79.113219]],
  rings: [[
    { lat: 43.793075, lng: -79.113219 },
    { lat: 43.757913, lng: -79.149916 },
    { lat: 43.745291, lng: -79.188167 },
    { lat: 43.715376, lng: -79.221853 },
    { lat: 43.707866, lng: -79.223428 },
    { lat: 43.698421, lng: -79.244049 },
    { lat: 43.671215, lng: -79.275846 },
    { lat: 43.648439, lng: -79.317088 },
    { lat: 43.616994, lng: -79.320551 },
    { lat: 43.610384, lng: -79.347626 },
    { lat: 43.609240, lng: -79.394248 },
    { lat: 43.625149, lng: -79.408089 },
    { lat: 43.635453, lng: -79.454351 },
    { lat: 43.632719, lng: -79.466629 },
    { lat: 43.621780, lng: -79.467889 },
    { lat: 43.585956, lng: -79.505779 },
    { lat: 43.586983, lng: -79.527701 },
    { lat: 43.580522, lng: -79.543582 },
    { lat: 43.594933, lng: -79.548699 },
    { lat: 43.609163, lng: -79.567150 },
    { lat: 43.627842, lng: -79.563899 },
    { lat: 43.628873, lng: -79.585457 },
    { lat: 43.642491, lng: -79.588303 },
    { lat: 43.646406, lng: -79.608724 },
    { lat: 43.664601, lng: -79.588816 },
    { lat: 43.750495, lng: -79.637993 },
    { lat: 43.855443, lng: -79.170215 },
    { lat: 43.814204, lng: -79.151836 },
    { lat: 43.806778, lng: -79.133923 },
    { lat: 43.800712, lng: -79.135241 },
    { lat: 43.794802, lng: -79.115294 },
    { lat: 43.793075, lng: -79.113219 }
  ]],
};
