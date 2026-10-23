# Preview & Scan Dispatch HQ

Start the game preview and systematically scan for visual/functional issues.

## Steps

- [x] 1. **Build the project** — `pnpm build` (4/4 green)
- [x] 2. **Start the combined server** — boots under Bun; guest login requires local Postgres (absent) → fell back to Vite dev server (proxies `/api`, `/ws`, `/tiles`, `/routing` to production per `vite.config.ts`)
- [x] 3. **Open browser preview** — `http://localhost:3000` (Vite) + preview tools
- [x] 4. **Full game scan** — map, CAD (incoming 911 + comm log + board), stations, units (unit info: rename/livery/crew/recall), economy HUD, leaderboard, alliance, public chat, notifications, controls (⚙️), crew, county jail, records
- [x] 5. **Capture findings** — console/network logs + screenshots; findings below

## Findings (2026-08-14, read-only scan against production backend)

### Real product issues

1. **Unit speed can exceed its max** — K-9 Unit 66 read `Speed 52 mph` with `max 51 mph` (a frame-level overshoot). Cosmetic, but the HUD shouldn't show current speed above the rated max.
2. **STRESS pinned at 100% with no consequence signal** — at 9 active missions + an active disaster the stress meter sat at 100% with no indicator of what max stress does (penalty, recovery rate, escalation). UX clarity gap.
3. **Duplicate mission type spawning concurrently** — two `Multi-Vehicle Crash` calls (both HIGH) rang at once. Not broken, but suggests mission-variety weighting could be improved.

### Dev-proxy issues (NOT production — production serves these routes directly)

4. **WS handshake fails through Vite proxy** → HUD chip shows `Offline` in dev. Production WS works; the documented local-dev path shows a false "Offline" state.
5. **`/tiles/*` 500 through Vite proxy** → map tiles fail in dev (OSM raster). Production tile route is unaffected.
6. **`/routing/route` + `/routing/nearest` 500 through the proxy** → routing falls back to straight-line in dev.

### Clean

- No React errors, no unhandled rejections, no hydration warnings in console.
- All panels rendered correctly at a 749px viewport (layout held; no visible overflow).
- Notifications, alliance, public chat, leaderboard, county jail, records all populated and legible.

### Scan limitations

- Guest login untested against the local combined server (no local Postgres); guest→dispatch→save→reload→resume is covered by the separate e2e smoke (Slice 4).
- Read-only: no dispatch/build/purchase (pre-existing production account).
- Fixed ~749px preview pane — true 1920px desktop and 375px mobile breakpoints not exercised.

---

## Mobile & Tablet Breakpoint Pass (2026-08-15, v0.29.x)

Ran a Puppeteer headless-Chrome pass at **375×812** (phone) and **768×1024** (tablet)
against the Vite dev path, walking the full new-player flow
(loader → Quick Play → upgrade-prompt dismiss → New Campaign → save slot →
city → department → Start Dispatching). Screenshots:

- `plans/screenshots/mobile-auth-375.png` — auth screen at 375px
- `plans/screenshots/mobile-sidebar-375.png` — fresh campaign default: sidebar drawer open (w-[85vw]) over the map
- `plans/screenshots/mobile-hud-375.png` — phone HUD: full map, top bar, zoom, service chip, mission markers
- `plans/screenshots/mobile-more-sheet-375.png` — v0.29.0 bottom-nav More sheet open (Leaderboard / Public Chat / Notifications / Pause / Log Out)
- `plans/screenshots/tablet-hud-768.png` — tablet HUD: top icon tab strip, no bottom nav, bottom status bar
- `plans/screenshots/cad-mobile-375.png` — CAD console at 375px after the v0.29.2 revamp (full-width calls panel, stacked header, ACCEPT/CLOSE inside the card)
- `plans/screenshots/cad-tablet-768.png` — CAD console at 768px (two-column deck restored, header + tabs on one row)

### Passed (renders correctly)

- **375px:** top bar fits (hamburger, clock pill, pause, ⋯, bell, avatar); map fills the screen; zoom controls; service chip; mission markers; city boundary polygon. Bottom nav present and interactive — its More button opened the sheet (functional proof). Dispatch HQ center button renders.
- **768px:** the full 6-icon tab strip (Missions/Stations/Units/Crew/Leaderboard/Chat) fits without overflow next to the clock pill, pause, ⋯, bell, avatar; MobileNav correctly hidden (`md:hidden`); bottom status bar (credits/XP/level/status/stations/units/active) renders; map + controls + markers all present.
- **More sheet (375px):** rounded-top bottom panel, MORE header with X close, backdrop blur over the map; destinations grid rendered.
- No React errors, page errors, or 500s during the pass (console noise = pre-login 401s + the dev WS failure below).

### Findings from this pass

1. **Sidebar drawer auto-opens on phones and covers ~85% of the map.** ~~`isSidebarOpen` defaults `true`; on a fresh campaign the phone renders the drawer (`w-[85vw]`) over the city, reducing the map to a sliver until the player hits the hamburger. Deliberate default, but a poor first-run mobile experience — worth defaulting the drawer closed on small screens (or overlaying with a backdrop) so a new player sees the city first.~~ **FIXED in v0.29.4:** the store now initializes `isSidebarOpen: window.innerWidth >= 1024`, so phones/tablets start with the drawer closed (map first, hamburger reopens it) and desktops keep the open default. Verified at 375px (closed → 319px after hamburger) and 1280px (384px open).
2. **Dev-only `Offline` WS chip** — same known Vite-proxy WS limitation as the desktop scan; production WS unaffected.
3. **Tablet tab strip is icon-only (labels hidden until lg)** — v0.29.0 added hover tooltips; labels stay hidden at 768px by design.
4. **Production incident discovered during the pass:** guest login 500'd with `connect ECONNREFUSED 127.0.0.1:5432` — the instance's Postgres was down (stale socket lock from an unclean shutdown). The postgresql watchdog (`svc_mS_FHfGmAYQ`) cleared the lock and recovered it; guest creation verified back to 201. Recorded here so a future scan doesn't re-diagnose it from scratch.

### Pass limitations

- 375px screenshot taken with `deviceScaleFactor: 2` (crisp); functional taps verified via DOM/mouse events, not a physical device.
- Desktop 1920px still unexercised (preview pane is fixed-width); tablet landscape (1024+) not captured.

## Notes

- Combined server (`serve-combined.ts`) is the production entrypoint on Zo (port 3001)
- Local dev runs Vite (3000) + game-server (3001) separately via turbo — using combined server is simpler for a scan
- The public instance at `https://dispatch-hq.onrender.com` is also available as fallback
- Requires `pnpm build` first since neither `dist/` nor `lib/` output exists currently
