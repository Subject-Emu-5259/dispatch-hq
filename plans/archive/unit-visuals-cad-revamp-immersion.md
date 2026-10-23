# Visible units, GPS visual polish, Unit Card panel, CAD/mission revamp, immersion

**Status:** Mostly implemented and shipped as part of v0.6.0 (August 2, 2026). The live production build at https://dispatch-hq-deandrewharris.zocomputer.io includes the marker rework, flowing route overlay, Unit panel, CAD routing fix, and immersion toasts.

---

## Slice 1 — Make units visible + GPS route line polished

### 1a. Rebuild the unit marker — `file apps/web/src/components/map/MapView.tsx`

- [x] Replace the small emoji div with a clearly-visible marker: bold colored ring, white inner disc, vehicle emoji, and a live callout chip for en_route/on_scene units.
- [x] Add a glowing directional "puck" for en_route units and a steady station dot for available units.
- [x] Ensure `pointer-events:auto` and proper stacking so markers render above route lines and remain clickable.
- [x] Keep diff-based updates: only recreate on status change, use `setLngLat` on position changes, update ETA text in place.

### 1b. Polish the GPS route line — `file apps/web/src/components/map/MapView.tsx`

- [x] Replace faint dashed line with a two-layer traffic-style route: wide soft casing under a bright colored core with a subtle glow.
- [x] Add an animated white dashed overlay that flows toward the destination, implemented by cycling `line-dasharray` paint values.
- [x] Insert a **leading dot** at the unit's current head position on the remaining polyline.
- [x] Update the GeoJSON source in place via `setData` (no recreate, no flicker).

---

## Slice 2 — Units panel revamp — `file apps/web/src/components/UnitPanel.tsx`

- [x] Create `apps/web/src/components/UnitPanel.tsx` — real-time unit cards in the Sidebar Units section:
  - Vehicle icon + name + type, status pill, live ETA countdown, mini route-progress bar, assigned mission name, speed.
  - "Follow on map" behavior via unit click / map click.
  - Recall button while en_route.
  - Grouped by status (Available / En Route / On Scene / Returning).
- [x] Wire `UnitPanel` into `Sidebar.tsx` units section.
- [x] Add a compact Fleet summary header (total / ready / en route / on scene).

---

## Slice 3 — CAD ↔ mission system integration

### 3a. Fix CAD dispatch routing — `file apps/web/src/components/CADSystem.tsx`

- [x] Replace manual road-path generation with `fetchDrivingRoute`; set `waypoints`, `eta`, `etaTotal`, `destination`, `routeDistanceKm`, and `status:'en_route'` so CAD dispatches move identically to sidebar dispatches.
- [x] Make `handleCaddispatch` async; show a "Routing…" disabled state while the route is fetched.
- [x] Remove the old `generateRoadPath` import from CAD.

### 3b. Unify mission state — CAD + Sidebar share `useGameStore`

- [x] CAD Incidents tab already reads from the same mission store; selections from CAD and Sidebar both call `selectMission`, keeping the map and UI in sync.
- [x] Verify no duplicate mission IDs are created between incoming CAD calls and sidebar-spawned missions.

---

## Slice 4 — Immersion / enjoyment features

- [x] **Unit arrival toast** when a unit flips to `on_scene` (implemented in `App.tsx`).
- [x] **Mission failed toast + SFX cue** when `timeRemaining <= 0` for an active undispatched mission, plus `failedMissions` increment.
- [x] **Multi-dispatch** in `MissionCard` — checkbox unit picker satisfies squad requirements (e.g., "2× engine").
- [x] **Follow unit** — clicking a unit card or unit marker flies the map camera to that unit (`MapView.flyTo`).
- [x] **Siren/flair on en_route markers** via pulsing ring + glow from Slice 1.
- [x] **Live ETA in unit cards** from Slice 2.
- [x] **Radio auto-chatter** across dispatched, en_route, on_scene, returning, available, and patrolling states.
- [x] **Post-mission standby** — units hold at the scene for 30 seconds before auto-returning to station.

---

## Slice 5 — Verify

- [x] `pnpm -F @dispatch-hq/web typecheck` passes.
- [x] Production build and service verified at https://dispatch-hq-deandrewharris.zocomputer.io:
  - Quick Play → city → build station → buy unit.
  - Dispatch from Sidebar and from CAD.
  - Units drive along roads with bright flowing GPS line, arrive at scene, mission goes in_progress and completes.
  - Arrival and failure toasts fire.
  - Units tab shows live cards with ETA.

---

## Out of scope (call out, don't build)

- Self-hosted OSRM (stays on public server + straight-line fallback).
- Multiplayer / real chat remains placeholder.
- External sound-effect audio assets; visual cues only.

---

## Completed follow-ups (shipped as v0.6.2, August 2, 2026)

1. **Live simulation-speed slider** — changing Simulation Speed in Settings now restarts the game loop immediately; no pause/resume required.
2. **Real pause overlay** — opening the pause screen freezes the mission/unit tick loop; operations resume after Resume.

## Completed follow-ups (shipped as v0.6.2, August 2, 2026)

4. **Live simulation-speed slider** — changing the speed setting in the settings modal immediately restarts the game loop interval; no pause/resume required.
5. **Pause now pauses the loop** — the main 1Hz mission/unit tick and the patrol/return 1Hz tick stop while the pause overlay is open.

## Completed follow-ups (shipped as v0.6.1, August 2, 2026)

1. **Leading route dot** — added a small pulsing dot at the head of the remaining polyline for en_route units (`MapView` DOM marker).
2. **CAD multi-dispatch** — the Unified Dispatch Center's Dispatch Board now lets you select multiple available units per unassigned mission before dispatching, matching the `MissionCard` unit picker.
3. **Unit marker name callout** — unit markers now display the unit name in a compact badge above the colored puck for faster fleet scanning.

## Files touched

- `apps/web/src/components/map/MapView.tsx` (marker + route visuals)
- `apps/web/src/components/UnitPanel.tsx` (new)
- `apps/web/src/components/Sidebar.tsx` (wire UnitPanel)
- `apps/web/src/components/CADSystem.tsx` (routing fix)
- `apps/web/src/components/MissionCard.tsx` (multi-dispatch unit picker)
- `apps/web/src/App.tsx` (arrival / fail toasts, failedMissions counter)
