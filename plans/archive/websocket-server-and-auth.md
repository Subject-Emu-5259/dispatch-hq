# Phase 2 Feature: WebSocket Server + JWT Auth

## Summary

Implement a real-time WebSocket server on the Hono backend and JWT authentication, connecting the React frontend to the backend for live game state sync. This replaces the client-only simulation with a server-authoritative architecture.

## Current State

- Hono server has REST CRUD endpoints (working, need PostgreSQL)
- WebSocket message types defined in `packages/shared/src/types/events.ts` but NOT implemented
- Frontend runs entirely client-side (Zustand store, no server connection)
- No auth system exists
- `@hono/node-server` already supports WS via `upgradeContext`
- `ioredis` and `bullmq` installed but unused

## Slices

### Slice 1: JWT Auth (REST) — No DB required for testing
Player register/login returns a JWT token. Used for both REST and WS auth.

- [ ] **Task 1.1**: Install `jose` (JWT library, ESM-native)
  - Files: `servers/game-server/package.json` (add dep via pnpm)
  - `pnpm --filter @dispatch-hq/game-server add jose`

- [ ] **Task 1.2**: Create `src/auth/jwt.ts` — sign and verify JWT tokens
  - Files: `servers/game-server/src/auth/jwt.ts` (new)
  - `signToken(playerId: string): string` — 7d expiry, HS256
  - `verifyToken(token: string): { playerId: string } | null`

- [ ] **Task 1.3**: Create `src/routes/auth.ts` — POST /api/auth/register, POST /api/auth/login
  - Files: `servers/game-server/src/routes/auth.ts` (new)
  - Register: create player row, hash password (bcrypt or simple hash for dev), return JWT
  - Login: verify password, return JWT
  - Files: `servers/game-server/src/index.ts` (edit — mount auth routes)

- [ ] **Task 1.4**: Create `src/auth/middleware.ts` — JWT verification middleware
  - Files: `servers/game-server/src/auth/middleware.ts` (new)
  - Hono middleware that reads `Authorization: Bearer <token>`, verifies, sets `c.set('playerId', ...)`

- [ ] **Task 1.5**: Protect existing REST routes with auth middleware
  - Files: `servers/game-server/src/index.ts` (edit — apply middleware to /api/stations, /api/units, /api/missions)

### Slice 2: WebSocket Server — Real-time connection

- [ ] **Task 2.1**: Create `src/websocket/wsServer.ts` — WebSocket connection handler
  - Files: `servers/game-server/src/websocket/wsServer.ts` (new)
  - Accept WS upgrade on `/ws` path
  - On connect: require JWT in first message (`{ type: 'auth', token }`)
  - Verify token, store connection with playerId
  - Respond with `auth_ok` + initial state snapshot
  - Handle `ping` → `pong`
  - Handle `action` messages → process → `action_confirmed`/`action_rejected`
  - Handle `viewport_update` → store for spatial filtering
  - Handle `chat` → broadcast to channel
  - On disconnect: cleanup

- [ ] **Task 2.2**: Create `src/websocket/connectionManager.ts` — track active connections
  - Files: `servers/game-server/src/websocket/connectionManager.ts` (new)
  - Map of playerId → WebSocket
  - `broadcast(message, except?)` — send to all connected players
  - `sendTo(playerId, message)` — send to one player
  - `broadcastDelta(changes)` — send state_delta to all relevant players

- [ ] **Task 2.3**: Create `src/websocket/actionHandler.ts` — process game actions
  - Files: `servers/game-server/src/websocket/actionHandler.ts` (new)
  - Handle `build_station` → validate, insert DB, broadcast delta
  - Handle `upgrade_station` → validate, update DB, broadcast delta
  - Handle `buy_unit` → validate credits, insert DB, update station count, broadcast
  - Handle `dispatch_unit` → validate, update unit status, broadcast
  - Handle `recall_unit` → update unit status, broadcast

- [ ] **Task 2.4**: Wire WS into Hono server
  - Files: `servers/game-server/src/index.ts` (edit)
  - Add `/ws` route with `upgradeContext` for WebSocket upgrade
  - Pass to wsServer handler

### Slice 3: Frontend WebSocket Client — Connect React to server

- [ ] **Task 3.1**: Create `src/lib/wsClient.ts` — WebSocket client singleton
  - Files: `apps/web/src/lib/wsClient.ts` (new)
  - Connect to `ws://localhost:3001/ws`
  - Send auth message with JWT
  - Reconnect on disconnect (exponential backoff)
  - Parse ServerMessages, dispatch to Zustand store
  - Send GameActions from store to server

- [ ] **Task 3.2**: Create `src/lib/apiClient.ts` — REST fetch wrapper
  - Files: `apps/web/src/lib/apiClient.ts` (new)
  - `fetchWithAuth(url, options)` — attaches Bearer token from localStorage
  - Player, station, unit, mission REST calls

- [ ] **Task 3.3**: Create auth UI — login/register screen
  - Files: `apps/web/src/components/AuthScreen.tsx` (new)
  - Files: `apps/web/src/App.tsx` (edit — add 'auth' screen state)
  - Login form (username/email + password)
  - Register form
  - On success: store JWT in localStorage, transition to city-select

- [ ] **Task 3.4**: Wire WebSocket client into game loop
  - Files: `apps/web/src/stores/gameStore.ts` (edit)
  - Add `wsConnected: boolean` state
  - On login: connect wsClient, set token
  - On state_delta: apply changes to store
  - Game actions (build, buy, dispatch) send via WS instead of local-only

## Risks

1. **No PostgreSQL running** — Docker isn't installed on this machine. All DB-dependent code must be written and type-checked but can't be runtime-tested until Postgres is available. The auth and WS code will compile and be ready.
2. **Hono WS upgrade** — `@hono/node-server` supports WS via `upgradeContext` but it's not well documented. May need `@hono/node-ws` helper package.
3. **Password hashing** — bcrypt is the standard but requires native bindings. Use `jose` for JWT and a simple hash for dev (or use `node:crypto` scrypt).
4. **Frontend changes** — The game currently works fully client-side. Adding server dependency means the game won't work offline anymore. Consider feature flag for online/offline mode.

## Decision Needed

- **Auth scope**: Do you want full register/login flow, or just a "quick play" mode that creates an anonymous player? Full auth is more work but needed for multiplayer.
- **Online/offline**: Should the game work offline (current behavior) with optional online sync, or require a server connection? I recommend feature-flagged: offline by default, online when server is available.