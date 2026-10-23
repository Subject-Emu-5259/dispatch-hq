#!/usr/bin/env bash
# ============================================================
# prewarm-map.sh — fill the on-origin tile cache for the launch cities
#
# The game serves map tiles from its OWN origin (/tiles/*, see
# servers/game-server/src/routes/mapData.ts). This script downloads the tiles
# covering each city's real-limits bounding box at zooms 8..15 ONCE, through
# the game's own endpoint, so the cache is warm from day one and players never
# wait on (or depend on) the upstream tile provider.
#
# Usage (run ON the instance, as the service user):
#   scripts/prewarm-map.sh              # origin defaults to localhost:3001
#   PREWARM_ORIGIN=https://<public-url> scripts/prewarm-map.sh   # from outside
#   PREWARM_ZOOM_MIN=8 PREWARM_ZOOM_MAX=14 scripts/prewarm-map.sh
#
# Cache dir is the service's DHQ_CACHE_DIR (default /tmp/dhq-cache) — this
# script only needs the origin, it doesn't touch the cache dir itself.
set -euo pipefail

ORIGIN="${PREWARM_ORIGIN:-http://localhost:3001}"
ZMIN="${PREWARM_ZOOM_MIN:-8}"
ZMAX="${PREWARM_ZOOM_MAX:-15}"

# minLat minLng maxLat maxLng — kept in sync with the boundary files in
# apps/web/src/data/{westMemphis,memphis,nashville,littleRock,newYork,losAngeles,chicago,houston,london,paris}Boundary.ts.
CITIES=(
  "west_memphis 35.087552 -90.293716 35.208654 -90.115427"
  "memphis     34.994374 -90.308366 35.263108 -89.637089"
  "nashville   35.967785 -87.054766 36.405496 -86.515588"
  "little_rock 34.625807 -92.521494 34.821607 -92.150768"
  "new_york    40.476578 -74.258843 40.917630 -73.700233"
  "los_angeles 33.659541 -118.668170 34.337306 -118.155298"
  "chicago     41.644587 -87.940088 42.023053 -87.524124"
  "houston     29.537071 -95.909742 30.110351 -95.012053"
  "london      51.286800 -0.510400 51.691900 0.334000"
  "paris       48.815576 2.224169 48.902156 2.469758"
  "berlin      52.338800 13.088400 52.675500 13.761200"
  "toronto     43.580522 -79.637993 43.855443 -79.113219"
  "sydney      -33.922501 151.175204 -33.855916 151.231543"
  "tokyo       35.540420 139.563410 35.817490 139.911775"
)

if ! curl -sS -m 10 -o /dev/null "$ORIGIN/health"; then
  echo "error: $ORIGIN/health is not reachable (is the game server running?)" >&2
  exit 1
fi

TMP_LIST="$(mktemp)"
trap 'rm -f "$TMP_LIST"' EXIT

for entry in "${CITIES[@]}"; do
  read -r name minlat minlng maxlat maxlng <<< "$entry"
  for ((z = ZMIN; z <= ZMAX; z++)); do
    read -r x0 y0 x1 y1 < <(awk -v z="$z" \
      -v minlat="$minlat" -v minlng="$minlng" \
      -v maxlat="$maxlat" -v maxlng="$maxlng" '
      function xtile(lon) { return int((lon + 180) / 360 * xf) }
      function ytile(lat) {
        r = lat * pi / 180
        return int((1 - log((1 + sin(r)) / cos(r)) / pi) / 2 * xf)
      }
      BEGIN {
        pi = atan2(0, -1)
        xf = 2 ^ z
        x0 = xtile(minlng); x1 = xtile(maxlng)
        y0 = ytile(maxlat); y1 = ytile(minlat)
        if (x0 > x1) { t = x0; x0 = x1; x1 = t }
        if (y0 > y1) { t = y0; y0 = y1; y1 = t }
        if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0
        if (x1 > xf - 1) x1 = xf - 1; if (y1 > xf - 1) y1 = xf - 1
        print x0, y0, x1, y1
      }')
    for ((x = x0; x <= x1; x++)); do
      for ((y = y0; y <= y1; y++)); do
        echo "$ORIGIN/tiles/$z/$x/$y.png"
      done
    done
  done
done | sort -u > "$TMP_LIST"

total="$(wc -l < "$TMP_LIST" | tr -d ' ')"
echo "Prewarming $total tiles (z$ZMIN..z$ZMAX) via $ORIGIN ..."

# 8 concurrent downloads; --retry covers the odd flaky tile; 502/404s are
# counted below so a partial failure is visible without aborting the run.
cat "$TMP_LIST" | xargs -P 8 -I{} \
  curl -sS -o /dev/null --retry 3 --retry-delay 1 -w '%{http_code}\n' {} \
  | sort | uniq -c | sort -rn

echo "Prewarm complete. (Expect mostly 200; any 502/404 count = tiles the origin could not fetch.)"
