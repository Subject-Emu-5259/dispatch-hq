# 🚒 Dispatch HQ — Comprehensive Audit v0.4.0-alpha

**Date:** 2026-07-31  
**URL:** https://dispatch-hq-deandrewharris.zocomputer.io  
**Version:** 0.4.0-alpha (RELEASES.md stuck on 0.1.0)  
**Status:** Alpha — playable core loop, not public-ready

---

## 1. TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, Tailwind CSS 3.4, Zustand 5, Framer Motion 12 |
| Map | MapLibre GL JS 4, react-map-gl 7 |
| Backend | Hono 4 (Bun), WebSocket (ws), Drizzle ORM |
| Database | PostgreSQL 16 |
| Shared Types | packages/shared (Unit, Mission, Station, Player, Events) |
| Game Engine | packages/game-engine (MissionSystem, SpawnSystem) |
| Testing | Vitest (frontend + backend + game-engine) |

---

## 2. WHAT WORKS — CORE GAME LOOP ✅

| Feature | Status | Notes |
|---|---|---|
| Loading screen | ✅ | Animated logo, progress bar, tips, v0.4.0-alpha tag |
| Auth: Guest Play | ✅ | JWT issued, persists to game |
| Auth: Login/Register | ✅ | Has UI, routes exist |
| City selection | ✅ | Los Angeles, New York, Chicago |
| Service selection | ✅ | Fire 🚒, Police 🚔, EMS 🏥 |
| Main game map | ✅ | MapLibre dark/light/satellite styles |
| Build station | ✅ | Modal + map location picker, 5,000cr cost |
| Recruit units | ✅ | Fire Engine, Ladder Truck, etc. from station panel |
| Unit panel | ✅ | Fleet cards grouped by status, ETA countdown bar, route progress |
| Mission spawning | ✅ | Dynamically generates 6+ missions from templates |
| Dispatch to mission | ✅ | Assign unit → mission, ETA countdown, progress tracking |
| Mission completion/failure | ✅ | Progress 0-100, time remaining, rewards |
| Unit return to station | ✅ | Status goes: dispatched → en_route → on_scene → returning → available |
| 6-button rail | ✅ | Dispatch Assistant, Tactical View, Radio Comms, CAD, Map Style, Recenter |
| BottomBar | ✅ | Credits, XP, Level, active missions badge |
| Stress Meter | ✅ | Visual bar, levels, tips at thresholds |
| Fog of War | ✅ | Toggle, map zones (explored/unexplored/RX) |
| Onboarding tutorial | ✅ | 6-step overlay, skippable |
| Toast notifications | ✅ | Multi-type (success/error/warning/emergency), auto-dismiss, progress bar |
| Bug Report modal | ✅ | Category picker, description field, submit |
| Dark/Light toggle | ⚠️ | Boolean flips but CSS variables don't switch |
| Map style switching | ✅ | Dark / Light / Satellite dropdown |
| CAD System | ✅ | Incoming Calls, Dispatch Board, Radio Comms, Unit Roster, CAD tabs |
| AI Dispatch Assistant | ✅ | Responds to context, gives recommendations |
| Radio Comms | ✅ | Unit-to-unit messaging, broadcast mode |
| WebSocket backend | ✅ | Real-time state sync, auth, ping/pong |
| REST API | ✅ | /api/auth, /api/player, /api/stations, /api/units, /api/missions |
| Health endpoint | ✅ | /health returns status + version |
| OSRM routing | ✅ | Road-following with Manhattan fallback |
| Units stay at station | ✅ | Unless dispatched |
| PostgreSQL persistence | ✅ | Stations, units, missions, players |

---

## 3. MISSING — CRITICAL FOR PUBLIC READINESS 🔴

| # | Gap | Severity | Details |
|---|---|---|---|
| 1 | **No audio system** | 🔴 Critical | Game is completely silent. No dispatch radio sounds, no sirens, no ambient city audio, no UI clicks, no mission alerts. `soundEnabled` boolean in TopBar with Volume2/VolumeX icons but zero audio implementation. No Howler.js or Web Audio API usage anywhere. |
| 2 | **No favicon/branding** | 🔴 Critical | No favicon.ico on disk. `serve-combined.ts` tries serving `/favicon.ico` but file doesn't exist. No OG image, no social preview cards, no app icon, no PWA manifest. |
| 3 | **Leaderboard — stub only** | 🔴 Critical | Nav tab exists, routes to blank/placeholder view. No backend endpoint. |
| 4 | **Chat — stub only** | 🔴 Critical | Nav tab exists, routes to blank view. WebSocket event type `chat` defined but no chat UI or message history. |
| 5 | **Empty profile/settings** | 🔴 Critical | Settings modal has only: Map Style, Dark Mode, Sound Toggle, Clear Cache. No account management, no keybindings, no audio settings, no accessibility options. |
| 6 | **No landing page** | 🔴 Critical | Root URL serves the game directly. No marketing page, no screenshots, no feature highlights, no "About" section. |
| 7 | **RELEASES.md stuck at v0.1.0** | 🔴 Critical | Docs describe placeholder-only state from initial alpha. Doesn't reflect v0.4.0 features. |
| 8 | **CORS wildcard** | 🔴 High | `serve-combined.ts` line 52: `origin: '*'` — should be config-based like `index.ts` |
| 9 | **No Premium/Shop** | 🔴 High | `PREMIUM` constants defined in economy.ts ($9.99/mo, 2x credits, 2x training speed). Coins field in Player type. Zero UI implementation. |
| 10 | **No Tech Tree** | 🔴 High | `showTechTree` toggle passed as prop to TopBar, no TechTree component on disk. 12 unit types have `unlockLevel` — no visualization. |
| 11 | **Alliance system — types only** | 🔴 High | `Alliance` type defined in player.ts. No routes, no UI, no database table. |
| 12 | **Police & EMS — units only** | 🔴 High | 12 unit types defined (4 fire, 4 police, 4 EMS). Only Fire missions spawn. Police/EMS department selection exists but no police/EMS missions or gameplay. |

---

## 4. MISSING — ENHANCEMENTS 🟡

| # | Gap | Priority | Details |
|---|---|---|---|
| 13 | **No notification center** | 🟡 High | Bell icon imported in TopBar but never wired. `GameNotification` type in events.ts unused. Toast system exists but no persistent notification log. |
| 14 | **No search functionality** | 🟡 High | Search icon in TopBar toolbar, not wired to anything. Should search missions, stations, units. |
| 15 | **Basic Stress Meter** | 🟡 Medium | Only shows bar + tips. No gameplay consequences (e.g., dispatch errors at high stress, unit response delays). |
| 16 | **No save/load slots** | 🟡 Medium | `useSaveSystem` hook exists but only handles autosave. No manual save slots, no load game screen. |
| 17 | **No replay/spectator** | 🟡 Medium | No way to watch completed missions or review dispatch history. |
| 18 | **No multiplayer/co-op** | 🟡 Low | Single player only. Alliance types hint at multiplayer but it's far off. |
| 19 | **No analytics/telemetry** | 🟡 Medium | No opt-in usage tracking, session metrics, or crash reporting. |
| 20 | **No accessibility options** | 🟡 Medium | No colorblind mode, no font scaling, no screen reader labels, no keyboard shortcuts documented. |
| 21 | **No mobile support** | 🟡 Medium | UI is desktop-optimized. Sidebar/topbar collapse somewhat but map interaction is desktop-first. |
| 22 | **No i18n/localization** | 🟢 Low | English only, hardcoded strings. |
| 23 | **City names limited** | 🟢 Low | Only 3 cities. No auto-population-density scaling. |

---

## 5. UI/UX AUDIT

### TopBar
| Element | Status | Issue |
|---|---|---|
| Nav tabs (Missions/Stations/Units/Leaderboard/Chat) | ⚠️ | Leaderboard and Chat are dead |
| Service indicator | ✅ | Shows 🚒🚔🏥 icon |
| Search button | 🔴 | Not wired |
| Notifications bell | 🔴 | Not wired |
| Map Style dropdown | ✅ | Working |
| Profile dropdown | ⚠️ | Shows username only, Logout works |
| Settings gear → modal | ⚠️ | Only 4 settings, no depth |
| Bug Report | ✅ | Fully functional modal |
| Dark Mode toggle | ⚠️ | Toggles boolean, doesn't change theme |

### 6-Button Rail
| Button | Status | Issue |
|---|---|---|
| Dispatch Assistant (AI) | ✅ | Works, context-aware |
| Tactical View | ⚠️ | Opens "coming soon" placeholder |
| Radio Comms | ✅ | Unit messaging works |
| CAD | ✅ | Full 5-tab CAD system |
| Map Style | ✅ | Quick toggle |
| Recenter | ✅ | Re-centers map on city |

### BottomBar
| Element | Status | Issue |
|---|---|---|
| Credits display | ✅ | |
| XP display | ✅ | |
| Level display | ✅ | |
| Active missions count | ✅ | Badge if > 0 |
| Server time | ✅ | |
| Player name | ✅ | |

### Sidebar (when open)
| Tab | Status | Issue |
|---|---|---|
| Missions list | ✅ | Filterable, sortable |
| Stations list | ✅ | With unit counts |
| Units list | ✅ | Fleet cards with status |

### Map
| Feature | Status | Issue |
|---|---|---|
| Station markers | ✅ | |
| Unit markers | ✅ | Moving with heading |
| Mission markers | ✅ | Pulsing + category icon |
| Fog of War zones | ✅ | Explored/unexplored |
| Road routing | ✅ | OSRM with fallback |
| Click-to-select | ✅ | Stations, units, missions |

---

## 6. BACKEND AUDIT

| Component | Status | Notes |
|---|---|---|
| Hono server + static serving | ✅ | serve-combined.ts serves frontend + API |
| PostgreSQL connection | ✅ | Via Drizzle ORM |
| JWT auth | ✅ | Guest + registered |
| Auth middleware | ✅ | Protects /api/player, /api/stations, /api/units, /api/missions |
| WebSocket server | ✅ | Real-time state sync, actions, chat placeholder |
| Station CRUD | ✅ | Full REST routes |
| Unit CRUD | ✅ | Full REST routes |
| Mission CRUD | ✅ | Full REST routes |
| Player routes | ✅ | Profile, stats update |
| Database seed | ✅ | POST /api/seed |
| Health check | ✅ | GET /health |
| CORS config | ⚠️ | Wildcard in serve-combined.ts, should match index.ts |

---

## 7. TEST COVERAGE

| Package | Tests | Status |
|---|---|---|
| game-engine/MissionSystem | ✅ | MissionSystem.test.ts |
| game-engine/SpawnSystem | ✅ | SpawnSystem.test.ts |
| shared/constants | ✅ | constants.test.ts |
| server/health | ✅ | health.test.ts |
| Frontend | ❌ | No frontend tests |

---

## 8. SECURITY NOTES

1. CORS wildcard in `serve-combined.ts` — change to config-based origin
2. Guest auth issues JWT with no expiration (good for demo, bad for prod)
3. No rate limiting on API routes
4. No input validation beyond TypeScript types
5. WebSocket connections not rate-limited
6. No CSRF protection on REST endpoints

---

## 9. PRIORITIZED ACTION PLAN

### PHASE 1: Public-Ready Minimum (2-3 days)
1. **Audio system** — Add Howler.js, create: dispatch radio static, mission alert chimes, siren pass-by, UI click sounds, ambient city loop, completion fanfare
2. **Favicon + branding** — Create favicon.ico, OG image, app icons, PWA manifest
3. **Fix dark mode** — Wire CSS variable swap, persist preference
4. **Landing/marketing page** — Separate route or zo.space page with screenshots, features, CTA
5. **Fill dead tabs** — Leaderboard (top players by XP), Chat (basic global chat)
6. **Update RELEASES.md** — Document v0.2.0 through v0.4.0

### PHASE 2: Feature Completion (3-5 days)
7. **Tech Tree** — Visual unlock tree for all 12 units
8. **Settings overhaul** — Add: Audio levels, keybindings, accessibility toggles, account management
9. **Notification center** — Persistent log, bell badge, click-to-view
10. **Search** — Global search across missions, stations, units
11. **Save system upgrade** — Manual save slots, load game screen
12. **Premium shop** — Coin purchase UI, premium benefits

### PHASE 3: Content & Depth (5-7 days)
13. **Police & EMS missions** — Full mission templates for all 3 departments
14. **Alliance system** — Create/join alliances, alliance chat, cooperative missions
15. **Stress consequences** — Dispatch errors, slower response at high stress
16. **Mobile responsiveness** — Touch-friendly map, collapsible panels
17. **Analytics** — Opt-in telemetry, session stats

### PHASE 4: Polish & Launch (3-5 days)
18. **Load testing** — WebSocket at scale, DB query optimization
19. **Accessibility** — ARIA labels, keyboard nav, colorblind mode
20. **Performance** — Code splitting, lazy loading, bundle analysis
21. **Documentation** — Player guide, FAQ, API docs
22. **Launch prep** — Press kit, social media assets, trailer

---

*Audit compiled from full source code review + live browser testing on 2026-07-31.*
