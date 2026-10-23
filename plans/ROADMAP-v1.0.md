# Dispatch HQ — Roadmap to v1.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Dispatch HQ from v0.13.0 (feature-complete single-service beta) to v1.0: mission-depth gameplay, live atmosphere, career progression, and true multiplayer — shipped as four coherent releases.

**Current state (v0.17.9):** The v1.0 roadmap below has fully shipped, and the game has run past it — save system v7 (three slots, zero loss), resume-on-reload + account-aware continue, live admin-sync (grants land within 30s), bug-report triage with My Reports, friends + alliance leaderboards, weekly triage digest, guest-upgrade merge with audit log, promo codes + redemption log, alliance invite codes/roles/XP/recruitment board, Redis-clustered unit positions + alliance chat with read receipts and typing indicators, city-aligned zones + street-exact patrol GPS, jail/hospital/fire-marshal pipelines, disasters with aftermath phases, and the full deploy + rollback runbook automated by `scripts/deploy.sh`. Live at https://dispatch-hq.onrender.com.

**Next:** `plans/v0.18.0-release-readiness.md` — depth (L11–20, orphan units, EMS/police content), scale (marker clustering, board virtualization), hardening (CORS, rate limiting), accessibility, and a fresh v0.17.9 audit — the path to the late-October full release.

---

## Release map

| Version | Theme | Headline | Subsystem |
|---|---|---|---|
| **v0.13.1** | Mission Depth | Difficulty tiers, chain missions, spawn pacing | `plans/v0.13.1-mission-depth.md` ✅ shipped |
| **v0.14.0** | Atmosphere & Crisis | Day/night, weather that matters, disaster events, sound | `plans/v0.14.0-atmosphere-and-crisis.md` ✅ shipped |
| **v0.14.1** | Career & Reporting | Rank ladder, shift debrief, mutual-aid credit, push alerts | `plans/v0.14.1-career-and-reporting.md` ✅ shipped |
| **v0.15.0** | Multiplayer & Customization | Live unit movement, alliances, liveries | `plans/v0.15.0-multiplayer-and-customization.md` ✅ shipped |
| **v0.16.0** | Multiplayer & Customization II | Live units, alliances, liveries, station themes (part 2) | `releaseNotes.ts` |
| **v0.17.x** | Persistence & Community | Save v7, resume, live sync, triage, promos, guest merge, Redis clustering | `releaseNotes.ts` |
| **v0.18.0** | Release Readiness | Depth, scale, hardening, accessibility, audit | `plans/v0.18.0-release-readiness.md` |

## Dependency graph

```
v0.13.1 Mission Depth (foundation: Mission type gains tier + chain fields)
   └── v0.14.0 Atmosphere (disasters SPAWN missions via spawn.ts, needs chain/tier for wave logic)
   └── v0.14.1 Career (debrief needs per-mission tier; mutual-aid credit touches Board from 0.13.0)
         └── v0.15.0 Multiplayer (alliances need career XP/ranks for alliance XP; live movement independent)
```

Each release is independently shippable via `scripts/deploy.sh <VER> <files...>`; version bumps in
`serve-combined.ts`, `index.ts`, `releaseNotes.ts` (see `plans/RELEASES.md` runbook).

## Global Constraints (all releases)

- UI: Tailwind CSS dark-first (`bg-gray-950`, `text-white`), lucide-react icons, framer-motion animations.
- Mission spawning goes through `apps/web/src/lib/spawn.ts` `buildMission()` — never ad-hoc mission objects.
- City geometry (bounds/boundary/zones) comes from `@/data/cityBoundaries` + `@/lib/patrol/patrolZones`; missions must stay inside real city limits.
- Server-persisted settings via `apps/web/src/utils/settings.ts` (`DispatchSettings` + `/player/settings` API).
- Shared types/constants live in `packages/shared/src`; unit tests with vitest (`pnpm test`).
- Every release: typecheck `pnpm --filter @dispatch-hq/web exec tsc --noEmit` + `pnpm --filter @dispatch-hq/game-server exec tsc --noEmit`, `pnpm build`, add a `RELEASE_NOTES` entry, bump version in the three places, deploy with `scripts/deploy.sh`.

---

## v0.13.1 — Mission Depth

Full plan: `plans/v0.13.1-mission-depth.md`

1. **Difficulty tiers (Routine / Moderate / Serious / Critical)** — map `difficulty 1–3/4–5/6–8/9–10` to labeled, color-coded tiers on mission cards + Dispatch Board. Implemented as a pure helper (`difficultyTierFor`) in shared, tier badge in `MissionCard.tsx` + `UnifiedDispatchCenter.tsx` board cards.
2. **Chain missions** — formalize the existing Aftermath/escalation into a first-class `chainId` + `chainStage` on `Mission`; a `CHAIN_DEFINITIONS` table in shared (fire → hazmat → rescue, police → traffic → medical, ems → hospital) drives a `nextChainMission()` helper that spawns stage N+1 at the same location when stage N completes. Includes a **chain reward bonus** (+25% credits on stage ≥2) and a "CHAIN 2/3" chip.
3. **Mission pace settings** — replace the hardcoded `MAX_ACTIVE_BASE = 8` / 12s interval in `App.tsx` with server-persisted `missionPace` (Relaxed / Normal / Intense: 20s/12s/6s) + `maxActiveMissions` (capped by level), honoring `MISSION_SPAWN_CONFIG.maxActiveMissions`.
4. **Spawn-cap correctness** — enforce the shared `maxActiveMissions` and surface "City at capacity" in radio chatter instead of silently dropping spawns.

**Key touchpoints:** `packages/shared/src/types/mission.ts`, `packages/shared/src/constants/missions.ts`, `packages/shared/src/constants/missions.test.ts`, `apps/web/src/lib/spawn.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/MissionCard.tsx`, `apps/web/src/components/UnifiedDispatchCenter.tsx`, `apps/web/src/utils/settings.ts`, `apps/web/src/components/SettingsModal.tsx`.

## v0.14.0 — Atmosphere & Crisis

Full plan: `plans/v0.14.0-atmosphere-and-crisis.md`

1. **Day/night cycle** — virtual game clock (accelerated: 1 real minute = 30 game minutes) in the store; map style shifts to a dark night filter, TopBar shows "07:42 · Night"; night spawns `nightModifier: 0.7` (fewer but more serious calls — the config constant already exists).
2. **Weather that matters** — existing `WeatherOverlay` states (storm/fog/heatwave) gain gameplay effects: storms boost water-rescue + traffic accident weights, heatwave boosts medical + wildfire, fog slows response speed. Exposed via `getActiveWeather()` read by `spawn.ts` + App tick.
3. **Sound polish** — synthesized Web Audio cues: siren loop for en-route units, dispatch beeps, chain-complete chime, night-shift ambience, volume sliders per category; `musicEnabled` setting (already server-persisted) actually plays a subtle ambient loop.
4. **Disaster events** — tornado / flash flood / multi-alarm fire / civil unrest: a timed city-wide event that spawns a wave of zone-targeted chain missions (10–15), shows a `DisasterBanner`, and awards a completion bonus + achievement. Triggered by level-scaled random chance with a cooldown; uses `buildMission` with disaster-forced templates.

**Key touchpoints:** `apps/web/src/stores/gameStore.ts`, `apps/web/src/components/RandomEvents.tsx`, `apps/web/src/components/WeatherOverlay.tsx`, `apps/web/src/components/map/MapView.tsx`, `apps/web/src/lib/spawn.ts`, `apps/web/src/App.tsx`, `apps/web/src/utils/sound.ts`, `apps/web/src/utils/settings.ts`.

## v0.14.1 — Career & Reporting

Full plan: `plans/v0.14.1-career-and-reporting.md`

1. **Rank ladder** — Rookie → Officer → Sergeant → Lieutenant → Captain → Chief (per-service titles, e.g. Probationary Firefighter → Fire Chief). Pure `rankForLevel(level, service)` helper in shared; TopBar + MainMenu + ShiftReport show rank instead of "Rank {level}"; rank-up notification + per-rank bonus multiplier on rewards.
2. **End-of-shift debrief** — extend `ShiftReportModal` with an "End Shift" action that produces a full-screen debrief: best response time, units of the shift (per-unit mission counts), zone heat recap (already computed), difficulty-tier mix, and a "copy summary" share button.
3. **Mutual-aid credit** — answering a Mutual Aid request grants a bonus reward (25% of mission reward) + counts toward a `mutualAidAnswered` career stat; leaderboard gains a `mutual_aid` sort key (server route + schema column + migration).
4. **Push notifications (PWA)** — permission-gated browser notifications for critical unassigned calls when the tab is hidden; `pushEnabled` setting; service-worker `showNotification` path.

**Key touchpoints:** `packages/shared/src/constants/career.ts` (new), `apps/web/src/components/TopBar.tsx`, `apps/web/src/components/MainMenu.tsx`, `apps/web/src/components/ShiftReportModal.tsx`, `apps/web/src/stores/gameStore.ts` (`CareerStats`), `apps/web/src/components/UnifiedDispatchCenter.tsx`, `servers/game-server/src/routes/leaderboard.ts`, `servers/game-server/src/db/schema.ts`, `apps/web/src/utils/notify.ts` (new), `apps/web/public/service-worker.js`.

## v0.15.0 — Multiplayer & Customization

Full plan: `plans/v0.15.0-multiplayer-and-customization.md`

1. **Live unit movement** — replace static `nearby_state` with streaming unit positions: clients send throttled `unit_position` updates (validated speed caps server-side), server broadcasts to players whose viewport contains the unit, MapView animates remote units along interpolated waypoints. Foundation for everything else multiplayer.
2. **Alliances** — DB tables `alliances` + `alliance_members`, API routes (create/join/leave/list), alliance tag on WS presence, alliance map visibility (see allied stations/units live), alliance chat channel, shared alliance XP → alliance level perks.
3. **Unit liveries** — per-service paint schemes (e.g. fire: classic red / blacked-out / lime-yellow) selectable in the unit panel, persisted on the unit, rendered on map markers + unit cards.
4. **Station identity** — station naming/renaming + theme presets (Urban / Suburban / County), persisted, rendered in panels + map station markers.

**Key touchpoints:** `packages/shared/src/types/events.ts`, `servers/game-server/src/websocket/wsServer.ts` + `connectionManager.ts`, `servers/game-server/src/db/schema.ts` + new `routes/alliances.ts`, `servers/game-server/src/routes/units.ts`, `apps/web/src/components/map/MapView.tsx`, `apps/web/src/components/UnitPanel.tsx`, `apps/web/src/components/StationDetailModal.tsx`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/stores/gameStore.ts`.

---

## Ideas queued beyond v1.0 (not yet planned — pick any to expand into a plan)

- **Employee fatigue & morale** — long shifts reduce response effectiveness until units/crews rest; ties into the patrol shift clock.
- **Station specialization perks** — station level-ups branch into perks (faster response radius, larger hospital ward, jail cell capacity).
- **CAD scenario expansion** — more per-service caller dialog trees in `CADSystem.tsx` (the `audioWaveform`/triage scaffolding is ready).
- **Multi-city campaign** — a career arc that moves your command between the five launch cities as you rank up.
- **Shift report share card** — generate a shareable PNG summary (canvas) of the debrief for Discord/social.
- **Performance pass** — marker clustering at high mission counts + `maxActiveMissions` enforcement guards the renderer.
- **Accessibility pass** — colorblind-safe crime-heat palette, full keyboard nav for the Dispatch Board, focus rings.
- **Seasonal events** — holiday-themed missions (Fourth of July fireworks fires, Christmas tree fires) with limited-time badges.
