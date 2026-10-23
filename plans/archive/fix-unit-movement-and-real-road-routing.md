# Fix unit movement + real road routing (GPS follows best route)

## Summary
Units creep imperceptibly when dispatched (speed-unit bug + 1Hz tick), and the "road path" is a fake zigzag, not actual streets. Fix the motion math, speed up the render tick, and replace the fake path with real OSRM driving routes so units visibly follow roads to the scene.

## Root causes (diagnosed)
1. **Speed-unit mismatch.** `UnitConfig.speed` is defined as **meters/second** (`shared/types/unit.ts:18`, values ~13.9 m/s ≈ 50 km/h), but `MissionCard.handleDispatch` (`MissionCard.tsx:80`) and the game loop (`App.tsx:231,260`) treat `unit.speed` as **km/h** and divide by `111 * 3600`. Net effect: units crawl at ~3.9 m/s (~14 km/h) instead of 13.9 m/s, and a 1km trip takes ~260s instead of ~72s. ETA is also ~3.6× too long.
2. **Tick rate too coarse for visible motion.** Position updates happen only on the 1000ms game loop (`App.tsx:144`). At ~4 m/s that's ~4m per tick — sub-pixel on a city-zoom map, so it looks frozen.
3. **Fake path, not roads.** `utils/roadPathfinding.ts` generates a seeded zigzag of grid blocks — it does not follow real streets. User wants the marker + route line to follow the actual best driving route.
4. **Route-line thrash.** `MapView.tsx:352-399` removes+re-adds the GeoJSON source/layer on every `units` change. On a faster tick this flickers; should update via `source.setData`.

## Plan

### 1. Fix the speed math (units/ETA) — `MissionCard.tsx`, `App.tsx`
- [ ] In `MissionCard.handleDispatch`: `unit.speed` is m/s. Convert: `speedMs = bestUnit.speed || 13.9`; ETA seconds = `roadPath.totalDistanceKm * 1000 / speedMs` (after routing, see step 3 use OSRM `duration`).
- [ ] In `App.tsx` game loop: replace `speedDegPerSec = speedKmh / (111 * 3600)` with the correct m/s → deg/sec: `speedDegPerSec = (u.speed || 13.9) / 111000` per *tick-second*. Apply scaled by the tick interval (see step 2).
- [ ] Keep ETA in sync with the corrected speed so arrival + ETA display match.

### 2. Split movement onto a fast tick — `App.tsx`
- [ ] Keep mission logic (countdown, progress, completion) on the existing 1000ms interval.
- [ ] Add a separate ~100ms (10Hz) interval (or `requestAnimationFrame`) that only interpolates `en_route` unit positions along their `waypoints` by elapsed time vs ETA, so motion is smooth and visible. Update only `position` (and `waypointIndex`) here.
- [ ] Use `useGameStore.getState()` inside the fast tick (not captured snapshot) so consecutive position writes compose.
- [ ] Guard: skip when paused or `gameScreen !== 'playing'`.

### 3. Replace fake path with real OSRM driving route — new `utils/routing.ts`, `MissionCard.tsx`
- [ ] Create `apps/web/src/utils/routing.ts` exporting `fetchDrivingRoute(start, end): Promise<{ waypoints: GeoPoint[]; distanceKm: number; durationSec: number }>`.
- [ ] Call OSRM public API: `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson`. Parse `routes[0].geometry.coordinates` (flip to `{lat,lng}`), `routes[0].distance` (m), `routes[0].duration` (s).
- [ ] **Fallback** if OSRM fails/unreachable: straight line (start→end) with haversine distance + speed-based duration. Keeps the game playable offline.
- [ ] In `handleDispatch`: make it `async`. Show a brief "routing…" state on the button (optional). After route returns, set `waypoints`, `destination`, `eta = durationSec`, `status: 'en_route'`, and store `routeDistanceKm`.
- [ ] Remove/retire `utils/roadPathfinding.ts` `generateRoadPath` usage (keep `haversineKm` / `getPositionOnPath` — reused for interpolation + fallback).

### 4. Animate marker along the real polyline — `App.tsx` fast tick + `MapView.tsx`
- [ ] In the fast tick, interpolate position by **distance progress**: `progress = (etaTotal - currentEta) / etaTotal`; use `getPositionOnPath(waypoints, progress)` from `roadPathfinding.ts` (already returns a point along the polyline by arc length). Set `position` to that point and derive `waypointIndex` from the nearest segment for the route-line remainder.
- [ ] Arrival: when `currentEta <= 0` OR progress ≥ 1, snap to last waypoint and set `status: 'on_scene'`, clear `waypoints`/`waypointIndex`. Existing mission `in_progress` transition (`App.tsx:154-157`) then fires.
- [ ] In `MapView.tsx` route-line block: instead of remove/re-add source each tick, **`source.setData(geojson)`** in place; add once, update on change. Draw the **full polyline** (remaining waypoints) so the user sees the actual road path with the animated marker on it.

### 5. Verify
- [ ] `pnpm --filter web typecheck` (or `pnpm -F web build`) — no type errors.
- [ ] Run dev server (port 3000), Quick Play → select city → dispatch a mission → confirm: marker visibly travels along roads, route polyline matches streets, ETA counts down and unit arrives at scene, mission goes `in_progress` then completes.
- [ ] Test OSRM fallback: throttle network in devtools → unit still moves (straight-line) without error.

## Risks / decisions
- **OSRM public server** (`router.project-osrm.org`) is a demo, rate-limited and occasionally down. **Decision (confirmed): ship with public OSRM + offline straight-line fallback for now.** Self-hosted OSRM/Valhalla is a future enhancement, not in scope here.
- **Mobile/data cost**: each dispatch = 1 routing request. Fine for demo scale.
- Fast tick (100ms) writing to Zustand triggers a re-render of `Map`/`MapView`'s units effect each tick — the diff-based marker update already only calls `marker.setLngLat` on unchanged-position markers, so cost is low. Confirm no reflow jank at 10Hz.
- Keep the 1000ms loop authoritative for ETA decrement + completion to avoid double-firing completion toasts.

## Files touched
- `apps/web/src/utils/routing.ts` (new)
- `apps/web/src/utils/roadPathfinding.ts` (keep helpers; drop `generateRoadPath` usage)
- `apps/web/src/components/MissionCard.tsx` (async dispatch + speed fix)
- `apps/web/src/stores/gameStore.ts` (add `routeDistanceKm?` optional on Unit via shared type — or reuse existing fields)
- `apps/web/src/components/map/MapView.tsx` (in-place route source.setData; full polyline)
- `apps/web/src/App.tsx` (split ticks, speed fix, progress-based interpolation)
- `packages/shared/src/types/unit.ts` (optional: add `routeDistanceKm?` field for clarity)