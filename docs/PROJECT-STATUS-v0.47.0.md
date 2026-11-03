# Dispatch HQ — Project Status Report

> Correction note (2026-11-03, Batch 3e — history not rewritten): this is a
> historical snapshot of v0.47.0 as written 2026-08-27. Two claims in it are
> stale and are corrected here, not silently edited out of the body: the
> header's "live on Zo" is superseded — production is now Render
> (https://dispatch-hq.onrender.com, auto-deployed from GitHub main) — and
> the §desktop "STALE" stamp is superseded — desktop is at 0.4.1 on itch
> (Dispatch HQ desktop v0.4.1 live since 2026-10-24).


**Version:** 0.47.0 (live on Zo)
**Date:** August 27, 2026
**URL:** https://dispatch-hq-deandrewharris.zocomputer.io

---

## 1. Gameplay Features — Fire, EMS, Police

### Mission Templates

| Service | Count | Difficulty Range | Notes |
|---------|-------|-----------------|-------|
| **Fire** | 16 | 1–10 | Structure fires, wildfires, gas leaks, factory fires, vehicle fires |
| **EMS** | 19 | 1–10 | Cardiac, overdose, multi-victim, hazmat medical, air ambulance |
| **Police** | 15 | 1–10 | Robbery, hostage, pursuit, barricade, DUI, domestic |
| **Traffic** | 7 | 1–5 | Intersection crashes, pileups, drunk driving |
| **Rescue** | 1 | 8 | Water rescue |
| **Hazmat** | 1 | 7 | Chemical spill |
| **Total** | **58** | 1–10 | |

### Mission Chains (5 escalation chains)

| Chain | Stages | Cross-Service |
|-------|--------|---------------|
| Fire Escalation | Structure Fire → Gas Leak → Injury Response | Fire → Fire → EMS |
| Robbery Follow-Up | Robbery → Hostage Situation → Crash Response | Police → Police → EMS |
| Mass Casualty Response | Mass Casualty → Secondary Cardiac → Traffic Control | EMS → EMS → Police |
| Chemical Spill Response | Fuel Spill → Exposure Treatment → Chemical Fire | Fire → EMS → Fire |
| Mass Transit Incident | Bus Crash → Mass Casualty → Exposure Treatment | EMS → EMS → EMS |

### Depth Assessment

- ✅ **58 unique templates** across 6 categories — solid variety
- ✅ **5 escalation chains** with cross-service follow-ups — good depth
- ✅ **10 difficulty tiers** — missions scale from routine to critical
- ✅ **City traits** modify spawn weights per city (9 cities with traits)
- ⚠️ **No multi-service chain starters** — chains always start from one service
- ⚠️ **No location-specific missions** — templates don't vary by city district
- ⚠️ **Rescue/Hazmat underrepresented** — only 1 each vs 15-19 for core services

### Recommendations

1. **Add 3-5 more rescue/hazmat templates** to balance the service mix
2. **Add location-specific mission variants** (e.g., subway incidents in NYC, harbour rescues in Sydney)
3. **Add a police → fire escalation chain** (arson investigation → structure fire)
4. **Add night-specific missions** (DUI spikes, bar fights, noise complaints)

---

## 2. Immersive Features

### City Traits (9 cities with unique gameplay modifiers)

| City | Trait | Fire | EMS | Police | Travel | Spawn | Credits |
|------|-------|------|-----|--------|--------|-------|---------|
| Paris | Urban Density | ×1.4 | ×1.3 | — | ×1.12 | ×1.15 | ×1.1 |
| London | Congestion Zone | — | ×1.2 | ×1.35 | ×1.15 | ×1.1 | ×1.12 |
| Berlin | Cold War Grid | ×0.8 | — | ×1.25 | ×0.92 | ×1.05 | ×0.95 |
| Chicago | Windy City | ×1.5 | ×1.35 | — | ×1.08 | ×1.2 | ×1.15 |
| Houston | Highway Sprawl | ×1.1 | ×1.15 | ×1.1 | ×1.2 | ×1.05 | ×1.12 |
| NYC | Five Boroughs | ×1.35 | ×1.3 | ×1.2 | ×1.05 | ×1.25 | ×1.1 |
| Toronto | The Six | ×1.25 | ×1.35 | ×1.1 | ×1.1 | ×1.15 | ×1.1 |
| Sydney | Harbour Chaos | ×1.2 | ×1.3 | ×1.15 | ×1.1 | ×1.1 | ×1.08 |
| Tokyo | Megacity Pulse | ×1.35 | ×1.4 | ×1.1 | ×1.12 | ×1.2 | ×1.12 |
| LA | Freeway Grid | ×1.2 | ×1.1 | ×1.25 | ×1.18 | ×1.1 | ×1.1 |

### City Radio Accents (6 international cities)

| City | Dispatch Style | Ack Codes | Fire Codes | EMS Codes |
|------|---------------|-----------|------------|-----------|
| London | British | "Acknowledged" | "Make Pumps 4/6" | "Cat 1-4" |
| Paris | French | "Reçu" | "FEU" | "P1-P4 URGENT" |
| Tokyo | Japanese | "Shōchi" | "Kaji" | "Kyūkyū" |
| Berlin | German | "Verstanden" | "BRAND" | "NOTFALL" |
| Sydney | Australian | "Copy" | "ALPHA" | "PARAMEDIC URGENT" |
| Toronto | Canadian | "Copy that" | "ALPHA" | "PARAMEDIC URGENT" |

### Weather System

- **3 weather types:** Storm, Fog, Heatwave
- **Gameplay effects:** Spawn weight shifts, response speed changes, road/water bias
- **Composes with city traits** — storm in Paris = extreme fire risk

### Disaster System

- **Disaster types:** Tornado, Flood, Wildfire
- **Recovery phase:** Damage assessment → displaced residents → debris clearance
- **Zone-targeted:** Disasters hit specific neighborhoods
- **Cooldown system:** Prevents back-to-back disasters

### Patrol System

- **4 patrol modes:** Station-beat, Zone, Hotspot, City-sweep
- **Crime heat overlay:** Real-time zone heat mapping
- **Patrol lifecycle:** Shift length, post-mission behavior, rest breaks
- **Zone-based routing:** Units follow city zones for realistic coverage

### Seasonal Events

- **2 events:** Fourth of July, Christmas
- **Boosted templates** during event windows
- **Reward multipliers** (1.5× during events)
- **Badge system** for participation

### Landmark System

- **12+ landmark types:** Schools, parks, gas stations, libraries, etc.
- **City General Hospital:** Buildable ER with ward upgrades
- **Air Ambulance Helipad:** Critical patient airlifts
- **POI-based mission anchoring:** Missions name your placed landmarks

### Immersion Assessment

- ✅ **City traits create meaningful differentiation** — 9 cities play differently
- ✅ **Radio accents add flavor** — 6 cities have unique dispatch voices
- ✅ **Weather/disasters add unpredictability** — dynamic gameplay shifts
- ✅ **Patrol system feels realistic** — zone-based, heat-driven routing
- ✅ **Landmarks make the city feel alive** — missions name your places
- ⚠️ **Only 2 seasonal events** — needs more holiday coverage
- ⚠️ **No night/day cycle** — missions don't vary by time of day
- ⚠️ **No voice acting** — radio accents are text-only

### Recommendations

1. **Add 2-3 more seasonal events** (Halloween, New Year, Valentine's)
2. **Add a day/night cycle** affecting mission types (DUI at night, school events by day)
3. **Add city-specific disaster variants** (earthquakes in Tokyo, blizzards in Toronto)
4. **Add a "city mood" system** tying weather + time + season together

---

## 3. Game Engine

### Core Systems

| System | Status | Notes |
|--------|--------|-------|
| **Spawn engine** | ✅ Solid | City traits + weather + random events compose correctly |
| **Dispatch logic** | ✅ Solid | Nearest-unit, cross-service, backup coordination |
| **Mission lifecycle** | ✅ Solid | Spawn → dispatch → en route → on scene → complete/fail |
| **Reward system** | ✅ Solid | Banded credits/XP, chain bonuses, seasonal multipliers |
| **Tech tree** | ✅ Solid | Travel speed, dispatch capacity, reward multipliers |
| **Patrol engine** | ✅ Solid | 4 modes, zone heat, crime-aware routing |
| **Hospital system** | ✅ Solid | Ward upgrades, ER fatigue, overflow diversion |
- **Personnel system** | ✅ Solid | Crew readiness, overwork, training |
- **Co-op dispatch** | ✅ Solid | Shared missions, CLEARED BY badges, level gating |
- **Economy** | ✅ Solid | Credits, coins, membership, shop, promo codes |

### Engine Assessment

- ✅ **Multiplier pipeline is clean** — traits, weather, tech tree, seasonal all compose
- ✅ **Server-authoritative for multiplayer** — client-side for solo play
- ✅ **Save/load works reliably** — autosave + manual save + cross-device
- ⚠️ **No difficulty scaling** — missions don't get harder as you level up
- ⚠️ **No dynamic event system** — disasters are random, not story-driven
- ⚠️ **CPU mutual aid is basic** — partner agencies don't have their own behaviors

### Recommendations

1. **Add difficulty scaling** — harder missions at higher levels
2. **Add story-driven events** — multi-day disaster arcs with escalating phases
3. **Expand CPU mutual aid** — partner agencies with their own units and behaviors
4. **Add a "city health" metric** — aggregate of response times, crime rate, etc.

---

## 4. UI Polish

### Component Architecture

| Component | Size | Status |
|-----------|------|--------|
| Main bundle | 787KB | ⚠️ Over 700KB target |
| MapView | 847KB | ✅ Lazy-loaded |
| Sidebar | 81KB | ✅ Lazy-loaded |
| AdminPanel | 67KB | ✅ Lazy-loaded |
| UnifiedDispatchCenter | 55KB | ✅ Lazy-loaded |
| PauseScreen | 40KB | ✅ Lazy-loaded |
| patrolEngine | 3KB | ✅ Lazy-loaded |

### UI Features

- ✅ **Responsive design** — phones, tablets, desktop all work
- ✅ **Dark theme** — consistent dark-first UI
- ✅ **Framer Motion animations** — smooth transitions
- ✅ **MapLibre GL** — real road map with overlays
- ✅ **Lazy loading** — major components code-split
- ✅ **Help & FAQ** — comprehensive, up-to-date
- ✅ **Tutorial/onboarding** — 10-step guided tour
- ✅ **Loading screen** — fresh dispatch tips

### UI Assessment

- ✅ **Mobile-first navigation** — bottom nav, hamburger menu
- ✅ **Touch-friendly** — no iOS double-tap delay
- ✅ **Keyboard accessible** — Tab + Enter/Space for mission cards
- ⚠️ **Main bundle 787KB** — over 700KB target (App.tsx is 174KB)
- ⚠️ **No accessibility audit** — was slated in v0.18.0, status unknown
- ⚠️ **No i18n** — text is English-only despite international cities

### Recommendations

1. **Split App.tsx** into smaller lazy chunks to get under 700KB
2. **Run an accessibility audit** — ARIA labels, contrast ratios, screen reader support
3. **Add i18n foundation** — locale layer for the 6 international cities
4. **Add a dark/light theme toggle** — currently dark-only

---

## 5. Server Polish

### API Architecture

| Metric | Count |
|--------|-------|
| Total API routes | 44 |
| Rate-limited routes | 24 |
| Auth-protected routes | 20 |
| WebSocket events | 4 |
| DB tables | 29 |

### Server Features

- ✅ **JWT authentication** — secure, session-aware
- ✅ **Rate limiting** — 24 routes throttled per player/IP
- ✅ **Body size caps** — 413 on oversized payloads
- ✅ **CORS configured** — proper origin restrictions
- ✅ **Static file serving** — SPA fallback with correct MIME types
- ✅ **Tile/routing proxy** — on-origin OSRM + OSM tiles
- ✅ **Promo code system** — seeded codes, redemption tracking
- ✅ **Shop system** — coin packs, membership, webhooks
- ✅ **Daily login bonus** — idempotent, server-authoritative
- ✅ **Alliance system** — shared missions, chat, XP
- ✅ **Analytics** — opt-in, anonymized session/mission counts
- ✅ **Bug reports** — in-game reporter with triage status

### Server Assessment

- ✅ **Well-structured** — clear separation of routes, middleware, DB
- ✅ **Rate limiting is comprehensive** — covers all write endpoints
- ✅ **Auth is solid** — JWT with proper expiry and refresh
- ⚠️ **No CORS hardening** — was on v0.18.0 list, status unclear
- ⚠️ **No monitoring/alerting** — nightly DB hygiene exists, but no uptime alerts
- ⚠️ **No local dev docker-compose** — e2e only runs on CI

### Recommendations

1. **Add CORS hardening** — restrict to game origin only
2. **Add uptime alerting** — on the guest-201 watchdog
3. **Add docker-compose for local dev** — Postgres + Redis + server
4. **Add API versioning** — prepare for v2 endpoints

---

## 6. Radio Feature Audit

### Radio Dialogue Engine

| Module | Lines | Status |
|--------|-------|--------|
| Core (types, constants, context) | 718 | ✅ In main bundle |
| Lazy (sequence generators) | 420 | ✅ Lazy-loaded |
| City accents | 637 | ✅ 6 cities |
| **Total** | **1,138** | |

### Radio Features

- ✅ **Per-service dispatch codes** — fire/EMS/police each have unique codes
- ✅ **Call-sign formatting** — {icon} {name} (e.g., "🚒 Engine 1")
- ✅ **City-flavored accents** — 6 international cities with unique voices
- ✅ **Template overrides** — city-specific phrasing for dispatch, on-scene, backup
- ✅ **Dialogue sequences** — assignment, status report, command response, backup
- ✅ **Cross-service coordination** — backup dispatches across departments
- ✅ **Patrol radio** — unit patrol announcements
- ✅ **Mission dispatch traffic** — "New call: …" and "All clear on …"

### Radio Assessment

- ✅ **Rich dialogue system** — 1,138 lines of dialogue logic
- ✅ **City accents work well** — London says "Acknowledged", Paris says "Reçu"
- ✅ **Code-split correctly** — sequence generators lazy-loaded
- ⚠️ **No voice acting** — text-only radio
- ⚠️ **No radio sound effects** — visual only
- ⚠️ **Sydney/Toronto accents share codes** — both use "ALPHA" fire codes
- ⚠️ **No radio history/transcript** — can't review past dispatches

### Recommendations

1. **Differentiate Sydney/Toronto fire codes** — Sydney could use "ALPHA/BRAVO", Toronto "10-30/10-40"
2. **Add a radio transcript panel** — scrollable history of dispatch traffic
3. **Add radio sound effects** — static bursts, tones, alert sounds
4. **Add radio squelch/chatter** — background ambiance during active missions

---

## 7. itch.io Platform Status

### Current State

| Item | Status | Notes |
|------|--------|-------|
| **Game version** | 0.47.0 | Live on web |
| **itch.io description** | ⚠️ OUTDATED | Still says "membership coming in future update" |
| **Devlog drafts** | ⚠️ BEHIND | Only 0.33.0 and 0.34.0 exist |
| **Desktop builds** | ⚠️ STALE | Last stamped at unknown version |
| **Promo codes** | ⚠️ OUTDATED | Lists DHQ-LAUNCH (10K credits) — may be expired |

### itch.io Description Issues

The current description at `docs/promo/itch-description.md` contains:

```html
<h2>What's coming</h2>
<ul>
<li>A <strong>membership program</strong> and <strong>coin purchases</strong> for gamers — coming in a future update</li>
<li>More cities, more mission types, and seasonal events</li>
</ul>
```

**These features are already live!** The description needs a full rewrite to reflect v0.47.0.

### Missing Devlogs

| Version | Devlog | Status |
|---------|--------|--------|
| 0.33.0 | plans/itch-devlog-0.33.0.md | ✅ Exists |
| 0.34.0 | plans/itch-devlog-0.34.0.md | ✅ Exists |
| 0.35.0–0.47.0 | — | ❌ Missing (13 versions!) |

### Recommendations

1. **Rewrite itch.io description** to reflect v0.47.0 features (membership, coins, co-op, city traits, radio accents)
2. **Create devlog drafts** for v0.40.0–v0.47.0 (co-op dispatch, economy, radio accents, daily bonus, Help & FAQ refresh)
3. **Stamp itch.io desktop builds** at v0.47.0
4. **Update promo codes** — DHQ-LAUNCH may be expired, WELCOME-50 is new

---

## 8. Summary — What's Next

### High Priority

| Task | Impact | Effort |
|------|--------|--------|
| **Rewrite itch.io description** | High — first impression for desktop players | Low |
| **Create missing devlogs** | Medium — community engagement | Low |
| **Stamp itch.io desktop builds** | High — desktop players on old version | Low |
| **Split App.tsx for bundle size** | Medium — faster initial load | Medium |
| **Add 3-5 more rescue/hazmat missions** | Medium — service balance | Low |

### Medium Priority

| Task | Impact | Effort |
|------|--------|--------|
| **Add seasonal events** (Halloween, New Year) | High — retention | Medium |
| **Add day/night cycle** | High — immersion | High |
| **Differentiate Sydney/Toronto radio codes** | Low — polish | Low |
| **Add radio transcript panel** | Medium — UX | Medium |
| **Accessibility audit** | Medium — inclusivity | Medium |

### Low Priority

| Task | Impact | Effort |
|------|--------|--------|
| **Add i18n foundation** | Medium — international reach | High |
| **Add voice acting** | High — immersion | Very High |
| **Add docker-compose for local dev** | Low — DX | Medium |
| **Add API versioning** | Low — future-proofing | Medium |

---

*Report generated by Buffy (Codebuff) — v0.47.0*
