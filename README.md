# 🚒 Dispatch HQ

A real-time **emergency-dispatch simulation game**. Build fire / police / EMS stations, recruit units, and respond to a living city of dynamic missions on a real-road map — solo or alongside other commanders on the shared map.

**Play it live:** https://dispatch-hq-deandrewharris.zocomputer.io

---

## What is it?

Dispatch HQ is a browser game (PWA — installable, offline-tolerant) backed by a real multiplayer backend:

- **Simulation-first gameplay** — missions spawn weighted by rarity and difficulty, escalate when ignored, chain into follow-ups, and are answered by units that drive real road routes (OSRM with a grid fallback) with live ETAs.
- **Three services** — Fire, Police, and EMS each with their own unit roster, station types, mission pools, and service pipeline (county jail, city hospital, fire-marshal investigations, criminal records).
- **Living city** — accelerated day/night cycle, weather that changes gameplay, disasters (tornado / flood / wildfire) with aftermath recovery, patrol shifts with crime-heat-aware routing.
- **Career & community** — rank ladder to Commissioner, end-of-shift debriefs, achievements, friends, alliances with live chat, weekly leaderboards, promo codes, and a founder admin console.
- **Multiplayer** — live unit movement across the shared map (speed-validated, Redis-relayed), presence, and per-alliance chat.

## Monorepo layout

```
apps/
  web/            React 19 + Vite + Zustand + MapLibre GL client (the game)
  desktop/        macOS desktop shell (Electron, DMG build, server-driven updates)
packages/
  shared/         Types, constants & pure logic shared by client and server
  game-engine/    Simulation engine logic (thin; most lives in the client)
servers/
  game-server/    Hono + Drizzle + PostgreSQL + Redis backend (REST + WebSocket)
plans/            Planning docs (roadmap, release plans, runbook) + archive/
scripts/          Deploy, smoke-test, and DB-hygiene tooling
infra/            Docker Compose for local infra (Postgres, Redis)
docs/             Architecture, development, and desktop app docs
```

## Quickstart

```bash
pnpm install        # install all workspace deps
pnpm dev            # web (vite :3000) + game-server (:3001) + engine
```

Local dev servers:
- **Web app:** http://localhost:3000 (Vite dev server, proxying `/api` + `/ws` to the live server unless the backend is running locally)
- **Game server:** http://localhost:3001 — health at `/health`; needs PostgreSQL + Redis (see `infra/docker/docker-compose.yml` for a one-command local stack)

## Useful commands

| Task | Command |
|---|---|
| Run everything in dev | `pnpm dev` |
| Typecheck all workspaces | `pnpm typecheck` |
| Build all workspaces | `pnpm build` |
| Test all workspaces | `pnpm --filter <pkg> test` (web/shared/server/engine) |
| Build the desktop DMG | `pnpm --filter @dispatch-hq/desktop package` |
| Deploy to the Zo server | `scripts/deploy.sh <VERSION> <files...>` (see `plans/RELEASES.md` runbook) |

## Docs

- [docs/](docs/) — architecture, development guide, and the desktop app + update mechanism
- [plans/ROADMAP-v1.0.md](plans/ROADMAP-v1.0.md) — the shipped path to v1.0 and what's queued beyond it
- [plans/RELEASES.md](plans/RELEASES.md) — the deploy & rollback runbook (used by `scripts/deploy.sh`)
- [plans/AUDIT-v1.0.0.md](plans/AUDIT-v1.0.0.md) — the v0.17.9 feature/endpoint audit

## Tech stack

React 19 · Vite 6 · TypeScript · Zustand · MapLibre GL · Tailwind CSS · framer-motion · lucide-react · Hono · Drizzle ORM · PostgreSQL · Redis (ioredis) · jose (JWT) · vitest · Turborepo · pnpm · Electron (desktop shell)
