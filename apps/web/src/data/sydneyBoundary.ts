// ============================================
// Dispatch HQ — Sydney Boundary
// ============================================
// City of Sydney (local government area, New South Wales).
// OSM relation 1251066 (wikidata Q533615), 206 outer ways stitched
// and subsampled to 42 points (every 40th vertex from the stitched ring).
// Sydney is a single LGA — no inner holes.
//
// Registered under 'sydney' / 'sydney-nsw' / 'sydney-australia'.

import type { CityBoundary } from './cityBoundaries';

export const SYDNEY_BOUNDARY: CityBoundary = {
  name: 'Sydney, NSW',
  bounds: [[-33.922501, 151.175204], [-33.855916, 151.231543]],
  rings: [[
    { lat: -33.865833, lng: 151.201154 },
    { lat: -33.856801, lng: 151.205238 },
    { lat: -33.855916, lng: 151.209344 },
    { lat: -33.859362, lng: 151.209960 },
    { lat: -33.859680, lng: 151.212663 },
    { lat: -33.856326, lng: 151.214558 },
    { lat: -33.858635, lng: 151.215903 },
    { lat: -33.863053, lng: 151.219583 },
    { lat: -33.863798, lng: 151.221684 },
    { lat: -33.869218, lng: 151.220518 },
    { lat: -33.859379, lng: 151.230818 },
    { lat: -33.868013, lng: 151.227539 },
    { lat: -33.869924, lng: 151.229910 },
    { lat: -33.873160, lng: 151.230065 },
    { lat: -33.877784, lng: 151.228843 },
    { lat: -33.879944, lng: 151.223227 },
    { lat: -33.883748, lng: 151.222111 },
    { lat: -33.888104, lng: 151.231543 },
    { lat: -33.896066, lng: 151.229740 },
    { lat: -33.898464, lng: 151.227110 },
    { lat: -33.913036, lng: 151.212749 },
    { lat: -33.922501, lng: 151.203940 },
    { lat: -33.919263, lng: 151.180685 },
    { lat: -33.905919, lng: 151.181062 },
    { lat: -33.898929, lng: 151.177818 },
    { lat: -33.895099, lng: 151.180895 },
    { lat: -33.886445, lng: 151.176456 },
    { lat: -33.878938, lng: 151.176199 },
    { lat: -33.875886, lng: 151.175204 },
    { lat: -33.872278, lng: 151.175682 },
    { lat: -33.871429, lng: 151.183841 },
    { lat: -33.875636, lng: 151.189340 },
    { lat: -33.869350, lng: 151.187448 },
    { lat: -33.865393, lng: 151.191628 },
    { lat: -33.862848, lng: 151.193027 },
    { lat: -33.862503, lng: 151.195209 },
    { lat: -33.865125, lng: 151.194175 },
    { lat: -33.868452, lng: 151.196939 },
    { lat: -33.869281, lng: 151.198321 },
    { lat: -33.872596, lng: 151.201690 },
    { lat: -33.868699, lng: 151.201472 },
    { lat: -33.865833, lng: 151.201154 },
  ]],
};
