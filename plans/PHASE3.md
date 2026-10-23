# Dispatch HQ — Phase 3: Multiplayer & Polish

**Status:** In progress  
**Started:** 2026-08-02  
**Live URL:** https://dispatch-hq.onrender.com

## Goal

Move Dispatch HQ from a client-authoritative single-player beta to a true online dispatch game: server-persistent player data, real-time presence across players, server-side leaderboards, chat, achievements, and polish (mobile, audio, PWA, admin).

## Foundation: Where Player Data Lives

| Data Type | Storage | Reason |
|---|---|---|
| Player accounts/auth | PostgreSQL `players` + HttpOnly cookie | Single source of truth; no browser `localStorage` |
| Game save slots | PostgreSQL `player_saves` | Cross-session, cross-device resume |
| Settings/preferences | PostgreSQL `player_settings` | Same config on every login |
| Stations & units | PostgreSQL `stations`, `units` | Server-authoritative for multiplayer visibility |
| Missions (global/city) | PostgreSQL `missions` | Shared world events across players |
| Chat history | PostgreSQL `chat_messages` | Persistent global/channel chat |
| Achievements | PostgreSQL `achievements` + `player_achievements` | Progression system |
| Leaderboards | Player stats query on PostgreSQL | Server-side ranking |
| Real-time presence & unit movement | Redis + WebSocket pub/sub | Fast ephemeral state + presence |
| Gameplay telemetry / bug reports | PostgreSQL `bug_reports` | Debug without browser localStorage |

Hosts:
- **PostgreSQL:** Zo Computer-managed local Postgres service (`postgresql`, port 5432, database `dispatch_hq`).
- **Redis:** Zo Computer-managed local Redis service (`redis`, port 6379) for real-time pub/sub and presence.

This keeps all durable state on the server and off the client’s `localStorage`.

## Completed Foundation Tasks

- [x] Commit pre-Phase 3 UI/bugfix checkpoint.
- [x] Ensure `dispatch_hq` database and `dispatch` role exist.
- [x] Extend schema with multiplayer/polish tables.
- [x] Move auth token from `localStorage` to HttpOnly cookie.
- [x] Add chat, leaderboard, achievements, and bug-report API routes.
- [x] Remove `localStorage` usage from API client, chat, and bug reports.
- [x] Rebuild and redeploy live service.

## Remaining Phase 3 Tasks

- [x] Multiplayer map visibility: nearby `stations`/`units` shared via WebSocket `viewport_update` responses (`nearby_state`) and rendered on the map.
- [x] Real-time unit movement: server-side interpolation loop (or authoritative client snapshots with server validation).
- [x] Global chat UI wired to `/api/chat` history and live WebSocket `chat` messages.
- [x] Server-side leaderboard UI replacing simulated entries.
- [x] Achievements engine + toast rewards (client-side checks with server-backed persistence).
- [x] Mobile-responsive pass (bottom nav, touch targets, responsive panels).
- [x] Sound effects polish + persistent volume settings already server-side.
- [x] PWA installability: service worker registered, offline fallback page added, assets cached.
- [x] Admin dashboard (player list, broadcasts, mission events).

