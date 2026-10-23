# 🚒 Dispatch HQ — Full Game Audit v0.17.9

**Audit Date:** 2026-08-06
**URL:** https://dispatch-hq-deandrewharris.zocomputer.io
**Version audited:** v0.17.9 (live, /health verified `{"status":"ok","version":"0.17.9"}`)
**Stack:** React 19 / TypeScript / Vite, Zustand, MapLibre GL, framer-motion, Tailwind, Hono/Bun, PostgreSQL + Drizzle, Redis pub/sub, WebSocket, OSRM routing.

---

## 1. Live Service Status

| Item | Status | Notes |
|---|---|---|
| HTTPS hosting | ✅ | `https://dispatch-hq-deandrewharris.zocomputer.io` (Zo, port 3001) |
| `/health` | ✅ | Returns 0.17.9 with timestamp |
| WebSocket | ✅ | `/ws` — presence, chat, alliance channels, unit-position relay via Redis |
| PostgreSQL | ✅ | 19 tables (see §4) |
| Redis | ✅ | Unit positions + per-alliance chat channels (`dhq:alliance:<id>`) |
| Deploy pipeline | ✅ | `scripts/deploy.sh` + runbook in `plans/RELEASES.md` (backup → byte-exact transfer → build → restart → verify) |
| Scheduled probes | ✅ | Save-health smoke test (2h), DB-hygiene check (nightly) |

## 2. Feature Inventory (v0.17.9)

### 2.1 Core Loop — all working end-to-end
- **3 services** (fire/police/EMS) with per-service stations, units, missions, rank titles, console tabs
- **Cities:** West Memphis (tuned boundary + zones + crime heat), Memphis, NYC, LA, Chicago
- **Real-road routing:** OSRM with street-grid fallback; units ride polylines (dispatch + patrol use identical GPS)
- **Patrol lifecycle:** shifts (2–8 min), zone modes, crime-heat targeting, rest breaks, persistence
- **Missions:** difficulty tiers, priority, chains, pacing settings, escalation/aftermath, Mutual Aid board, clickable map popups with real OSRM ETAs + multi-unit quick dispatch
- **Service pipelines:** County Jail (booking→held→released), City Hospital (admitted→treated→discharged), Fire Marshal Bureau (arson investigations), criminal records
- **Atmosphere:** virtual day/night clock (1 min = 30 game min), gameplay-active weather (storm/fog/heatwave), disasters (tornado/flood/wildfire) + recovery aftermath, synthesized Web Audio (per-category volumes)

### 2.2 Multiplayer & Community
- Live unit positions (Redis pub/sub, validated speed caps, ghost interpolation)
- Global chat + alliance chat (per-alliance Redis channels, read receipts persisted ✓✓, typing indicator, unread badges)
- Alliances: invite codes, roles (leader/officer/member), kick/promote, shared XP + levels + perks, recruitment board
- Leaderboards: global, Friends tab (weekly snapshot rollover), Alliance tab, Mutual Aid sort
- Social: Facebook + Reddit links on main menu, friends panel, profile with avatar/name

### 2.3 Account & Ops
- Auth: guest (30-day), register/login, JWT 30d (pinned secret), session-expiry recovery
- Save system v7: three slots, preview cards, autosave + tab-close beacon, zero-loss migration
- Resume-on-reload (account-aware), Continue never silently restarts
- Live admin sync: grants land ≤30s (poll + focus), alliance + weekly snapshot reconcile
- Guest→account upgrade with full merge + immutable audit log
- Promo codes + redemption log (DHQ-LAUNCH seeded)
- Admin Console: overview, broadcasts, bug triage digest, player bonuses, promo manager, upgrade audit — founder-gated
- Bug reports: triage workflow (new/investigating/fixed), assignee, My Reports, Known Issues
- PWA + offline fallback; mobile-responsive bottom nav

### 2.4 Post-audit deltas shipped with this audit (v0.18.0)
- Progression to Level 20 (xpPerLevel/levelBonus curves + ranks Deputy Chief L16 / Commissioner L20)
- `police_suv` + `battalion_chief` now required by real missions (high-speed pursuits, multi-alarm fires)
- Reward bands: wildfire re-tuned into its D4 band, garage_fire above room_fire
- EMS 5→11 templates, police 11→14 (stroke, overdose, maternity, hazmat exposure, school emergency, heatstroke; stolen vehicle, barricade)
- Performance: lazy-loaded heavy panels (Admin/Social/Radio/TechTree/service pipelines), dispatch-board virtualization (24-card pages)
- Accessibility: colorblind-safe crime heat setting, keyboard-focusable board cards + focus rings, `prefers-reduced-motion` respected, aria-labels on top-bar toggles
- Security: CORS allowlist, per-IP rate limiting (auth/promo/chat/bug reports), input bounds already present

## 3. Bugs & Findings (open at audit time → disposition)

| # | Finding | Disposition |
|---|---|---|
| 1 | `xpPerLevel`/`levelBonus` capped at L10; ranks topped at L15 | **Fixed in v0.18.0** (L20 curves + 2 ranks) |
| 2 | `police_suv` + `battalion_chief` unreferenced by any mission | **Fixed in v0.18.0** (2 new missions) |
| 3 | D4 `wildfire` out-earned its tier 3.4×; D6 `garage_fire` underpaid vs D5 | **Fixed in v0.18.0** (reward bands) |
| 4 | EMS content thin (5 templates vs 11-12 fire/police) | **Fixed in v0.18.0** (5→11) |
| 5 | CORS reflected any origin with credentials | **Fixed in v0.18.0** (allowlist) |
| 6 | No HTTP rate limiting on auth/promo/chat/bug reports | **Fixed in v0.18.0** (token bucket) |
| 7 | Heavy panels in the initial bundle; board renders hundreds of cards | **Fixed in v0.18.0** (lazy + virtualization) |
| 8 | Heat palette red-green dependent; icon-only buttons label-less; no reduced-motion | **Fixed in v0.18.0** |
| 9 | `MissionCard.tsx.bak` committed cruft | **Deleted in v0.18.0** |
| 10 | Stale plan-doc checkboxes; audit mislabeled as v1.0.0 | **Reconciled in v0.18.0** |

### Known limitations (carried forward)
- ~~**Client leveling still uses a flat `level × 1000` formula**~~ **Resolved in v0.19.0** — the completion handler, promo redemption, live admin-grant sync, and disaster bonus all route through the shared `advanceLevel` curve. The last straggler (WS presence deriving level from the XP *remainder* instead of `players.level`) was fixed in the v0.30.x economy pass (2026-08-15).
- ~~Level bonus (`levelBonus`/`ECONOMY`) is declared data, not consumed by payout math~~ **Resolved in v0.22.0** — `computeMissionRewards` multiplies credits by `levelBonusFor(level)` (×1.0–2.0); XP stays on the rank ladder.
- ~~No analytics~~ **Resolved in v0.24.0** (sessionStats table + POST/GET analytics routes + Admin overview). **Still open:** no shop/monetization UI (PREMIUM constants + coins exist, admin/promo-granted only).
- No cluster-wide rate limiting (per-instance buckets only — fine for single-instance).
- ~~Mission dispatch / patrol / save round-trip remain integration-level~~ **Resolved in v0.32.0** — the e2e smoke (`apps/web/e2e/smoke.mjs`, CI `e2e.yml`) now drives guest → build → START PATROL → save → reload → resume (patrol persisted) → dispatch → en_route headlessly against the built server.

## 4. Architecture Snapshot

- **Frontend:** `apps/web` — 50+ components, ~20 lib modules, Zustand store (player, units, stations, missions, patrol, career, shift, weekly, weather, disasters, alliances)
- **Backend:** `servers/game-server` — 15 route modules (auth, player, stations, units, missions, settings, saves, chat, leaderboard, social, achievements, bugReports, alliances, admin, promos), WebSocket server, Redis pub/sub
- **DB:** 19 tables — players, stations, units, missions, player_settings, player_saves, chat_messages, chat_message_receipts, achievements, player_achievements, player_stats, alliances, alliance_join_requests, alliance_members, promo_codes, promo_redemptions, bug_reports, guest_upgrade_audit
- **Shared:** `packages/shared` — types + constants (missions 13/14/11 per service, 12 units, economy, career ranks, chains, tiers) with 76 unit tests
- **Tests:** 76 shared + ~15 web (incl. new AdminPanel/spawn) + ~15 server (founder gate, rate limit, saves sanitize, promo, triage, alliance perms)

## 5. Where the Game Is Headed

- **v0.18.0 shipped this audit:** depth, scale, hardening, accessibility — the release-readiness pass.
- **Late-October full release** is the stated target; remaining pre-release work is content breadth + the economy rebalance above, not features.
- **Queued beyond v1.0** (`plans/ROADMAP-v1.0.md`): employee fatigue/morale, station specialization perks, multi-city campaign, shift-report share card, seasonal events, monetization shop, analytics, spectator/replay, more cities.

*Audit compiled 2026-08-06 from full source review + live endpoint checks; supersedes the v0.4.0-era content this file previously carried.*
