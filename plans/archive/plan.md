# Plan: Build Dispatch HQ — Emergency Dispatch Simulation Game

## TL;DR
Build **Dispatch HQ**, a modern browser-based emergency dispatch simulation game. MVP: Fire service only, single-player, full visual design (cards, dark mode, animations), onboarding flow, worldwide map. TypeScript full-stack.

**Current Status**: All Phase 1 source code (~30 files) is written and stored in memory (`/memories/session/files/`). A setup script is ready at `setup-script.sh`. **Next step: Execute the setup script to scaffold the workspace, then write remaining source files to disk, install deps, and start the dev server.**

---

## Immediate Next Step: Execute Phase 1 Setup

### Step 1: Run the setup script
The complete setup script at `/memories/session/files/setup-script.sh` contains all project scaffolding. It will create:
- Root monorepo config (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`)
- `packages/shared/` — all types (station, unit, mission, player, events) and constants (stations, units, missions, economy)
- `apps/web/` — React app config, Tailwind, PostCSS, Vite, HTML, CSS, main.tsx entry
- `apps/web/src/components/` — MapView, Sidebar, MissionCard, BuildStationModal (NOTE: these are inline in the setup script as heredocs; also need to write from memory files)

### Step 2: Write remaining source files to disk
After the setup script runs, manually write these files that were created in memory but are NOT fully in the setup script:
- `apps/web/src/App.tsx` — main app component (from `web-App.tsx`)
- `apps/web/src/stores/gameStore.ts` — Zustand store (from `web-gameStore.ts`)
- `packages/game-engine/` — engine files (from `engine-*`)
- `servers/game-server/` — server files (from `server-*`)
- `infra/docker/docker-compose.yml` — Docker config (from `docker-compose.yml`)

### Step 3: Install dependencies
```bash
cd "/Users/deandrewharris/Games Projects/dispatch-hq"
pnpm install
```

### Step 4: Start dev server
```bash
cd apps/web
pnpm dev
```

### Step 5: Verify
- Open `http://localhost:3000`
- Map loads centered on NYC
- Sidebar shows with "Build Fire Station" button
- Demo missions appear every 8 seconds
- Mission cards show countdown timer
- Click map when build modal open places station
- Dark mode toggle works
- Map style selector works

---

### Phase 2: Station Building + Unit System (Week 2-3)
**Goal**: Players can build fire stations and purchase fire trucks

**Steps**:
1. Create station building UI (modal/panel)
2. Implement station types: Fire Station (only for MVP)
3. Add credit economy (start with 10,000 credits)
4. Create unit purchasing system (fire trucks)
5. Define unit types: Engine, Ladder, Rescue, Battalion Chief
6. Add unit stats: speed, capacity, training level
7. Create station detail view (shows housed units)
8. Implement station upgrade system (Level 1-5)
9. Add PostgreSQL schema for players, stations, units
10. Create Drizzle ORM schema
11. Build REST API: POST /stations, GET /stations, POST /units
12. Add WebSocket connection + auth (JWT)
13. Real-time station/unit state sync

**Key Files**:
- `apps/web/src/components/station/BuildStationModal.tsx`
- `apps/web/src/components/station/StationDetail.tsx`
- `apps/web/src/components/station/UnitPurchasePanel.tsx`
- `packages/shared/src/types/unit.ts`
- `packages/shared/src/constants/units.ts`
- `servers/game-server/src/api/stations.ts`
- `servers/game-server/src/db/schema.ts`

**Verification**: Build a fire station, buy an engine, see it on the map and in station detail

---

### Phase 3: Mission System + Dispatch Loop (Week 3-5)
**Goal**: Core gameplay loop — missions appear, player dispatches units, earns credits

**Steps**:
1. Define 12 fire mission templates:
   - Bin fire, Container fire, Burning car, Room fire, Garage fire
   - Gas leak, Warehouse fire, Factory fire, Wildfire
   - Vehicle accident, Building collapse, High-rise fire
2. Create mission spawning engine (BullMQ worker)
3. Implement spawn rules: urban density, POI-based placement
4. Create mission cards (card-based UI)
5. Implement mission state machine (Generated → Active → Dispatching → OnScene → Complete)
6. Build dispatch interface (select units, send to mission)
7. Implement unit movement along roads (OSRM routing)
8. Add real-time unit position updates via WebSocket
9. Mission completion logic (all units arrive → timer → rewards)
10. Credit/XP reward system
11. Mission expiration timer
12. Add mission map markers with pulse animation

**Key Files**:
- `apps/web/src/components/mission/MissionCard.tsx` — card-based mission display
- `apps/web/src/components/mission/MissionDetail.tsx` — full mission view
- `apps/web/src/components/dispatch/DispatchPanel.tsx` — unit selection + dispatch
- `packages/shared/src/types/mission.ts`
- `packages/shared/src/constants/missions.ts` — 12 fire mission templates
- `packages/game-engine/src/systems/MissionSystem.ts`
- `packages/game-engine/src/systems/SpawnSystem.ts`
- `servers/mission-worker/src/spawner.ts`

**Verification**: See missions appear on map, dispatch units, watch them drive to scene, complete mission, earn credits

---

### Phase 4: Full Visual Design + Cards (Week 5-6)
**Goal**: Polished, beautiful UI matching brand identity

**Steps**:
1. Implement full card-based UI for missions, stations, units
2. Color-coded service system (red for fire)
3. Dark mode + light mode with smooth toggle
4. Add Framer Motion animations:
   - Mission card slide-in
   - Unit dispatch trail animation
   - Mission complete particle burst
   - Credit fly-up animation
   - Button hover/tap effects
   - Card tap ripple effects
5. Implement responsive layout (mobile-first)
6. Create bottom navigation bar (mobile)
7. Add sidebar panel (desktop)
8. Implement card filtering (by mission type, urgency)
9. Add mission urgency indicators (pulse, color shift)
10. Create loading states and skeleton screens
11. Add toast notifications for game events
12. Implement dark map style for dark mode

**Key Files**:
- `apps/web/src/components/ui/Card.tsx` — base card component
- `apps/web/src/components/ui/Button.tsx` — animated button
- `apps/web/src/components/ui/Toast.tsx` — notification toasts
- `apps/web/src/components/layout/BottomNav.tsx` — mobile nav
- `apps/web/src/components/layout/Sidebar.tsx` — desktop sidebar
- `apps/web/src/styles/themes.ts` — dark/light theme config

**Verification**: Beautiful card-based UI, dark mode works, animations smooth on mobile and desktop

---

### Phase 5: Onboarding + Tutorial (Week 6-7)
**Goal**: New players guided through first experience

**Steps**:
1. Create onboarding flow (5 steps):
   - Welcome screen
   - Build first fire station
   - Purchase first fire truck
   - Dispatch to first mission
   - Mission complete celebration
2. Implement guided tutorial overlay (highlight elements)
3. Add contextual tooltips ("?" buttons throughout)
4. Create progression system (Level 1-10 for MVP)
5. Level-up rewards and celebrations
6. Smart suggestions system ("Build an ambulance station!")
7. Tutorial completion tracking (stored in player profile)

**Key Files**:
- `apps/web/src/components/onboarding/OnboardingFlow.tsx`
- `apps/web/src/components/onboarding/TutorialStep.tsx`
- `apps/web/src/components/onboarding/Tooltip.tsx`
- `apps/web/src/components/progression/LevelUpCelebration.tsx`

**Verification**: New player goes through tutorial, builds station, buys truck, dispatches, completes mission, levels up

---

### Phase 6: Polish + Launch Prep (Week 7-8)
**Goal**: Production-ready MVP

**Steps**:
1. Performance optimization (lazy loading, code splitting)
2. Service worker for offline map tile caching
3. Error handling and graceful degradation
4. Add sound effects (siren, dispatch, mission complete)
5. Implement player profile/stats dashboard
6. Add leaderboard (global XP ranking)
7. SEO and meta tags
8. Deploy to staging environment
9. Load testing (target: 1000 concurrent users)
10. Bug fixes and polish
11. Create landing page / marketing site
12. App store preparation (PWA manifest)

**Verification**: Deployed, performant, handles load, ready for beta testers

---

## Decisions Made
- **TypeScript full-stack** — consistent language across entire codebase
- **Fire service only** for MVP — focused, manageable scope
- **Single-player first** — no alliances in v1, add in v2
- **Worldwide map** — OpenStreetMap, no geographic restrictions
- **Full visual design from day one** — cards, dark mode, animations
- **Onboarding included** — critical for retention
- **Authoritative server** — prevents cheating, validates all actions

## Future Phases (Post-MVP)
- Phase 7: Police + EMS services
- Phase 8: Alliance system
- Phase 9: Events and seasonal content
- Phase 10: Mobile apps (React Native)
- Phase 11: Monetization (premium, coins)
- Phase 12: Advanced missions (wildfire, water rescue, airport)


## Tech Stack
React + TypeScript + Vite + Tailwind + shadcn/ui + Framer Motion + MapLibre GL JS + Node.js (Bun) + Hono + PostgreSQL/PostGIS + Redis + BullMQ + Cloudflare

## MVP Scope (All Confirmed)
- ✅ Map + Station Building (worldwide)
- ✅ Fire Service Only (10-15 mission types)
- ✅ Single-Player MVP (no alliances yet)
- ✅ Full Visual Design (cards, dark mode, animations)
- ✅ Onboarding Flow (guided tutorial)
- ✅ Worldwide from Day 1

## Implementation Phases
- Phase 1: Project Setup + Map Core
- Phase 2: Station Building + Unit System
- Phase 3: Mission System + Dispatch Loop
- Phase 4: Full Visual Design + Cards
- Phase 5: Onboarding + Tutorial
- Phase 6: Polish + Launch Prep

See detailed plan below.
