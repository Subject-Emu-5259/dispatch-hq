# Co-Op Dispatch — Shared Mission Board

> **The v1.0 Multiplayer Gap**
> Alliances exist socially (chat, presence, shared XP), but two players can't
> answer the same mission board. This spec closes that gap.

---

## Problem Statement

Right now, every player runs an isolated dispatch loop: missions spawn into
their local Zustand store, they dispatch their own units, and completion is
entirely local. Alliance members can see each other's unit positions on the map
and chat in real time, but there's no shared objective — no way for two
commanders to coordinate on the same incident or split a multi-unit response.

The original roadmap called this "true multiplayer." The current state is
"multiplayer-lite" — live presence + chat, but no shared gameplay.

## Design Principles

1. **Opt-in, not forced.** The shared board is a toggle. Solo play is unchanged.
2. **Same city only.** Co-op only works when alliance members are dispatched to
   the same city. Cross-city alliances remain social (chat + XP) only.
3. **Client-authoritative missions stay client-authoritative.** We don't move
   mission state to the server. The shared board is a *view layer* — missions
   are still spawned locally, but a subset is broadcast to alliance members.
4. **No new server tables.** The existing WebSocket pub/sub infrastructure
   (alliance channels, Redis fan-out) handles the shared board. Missions live
   in each player's local store; the broadcast is a read-only mirror.
5. **Composable with city traits.** A storm in Paris stacks with the density
   trait AND the shared board intensity — the system doesn't care *why* the
   board is busy, just that everyone sees the same one.

## Architecture

### Shared Mission Pool

Each alliance member's local spawn loop continues to generate missions via
`buildMission()`. When a mission spawns, it's tagged with an `allianceShare`
flag if:

- The player is in an alliance (`myAlliance` is non-null)
- The player is in the same city as at least one other alliance member
  (determined by the WebSocket presence layer — `allianceId` + `city` in
  `playerMeta`)

Tagged missions are broadcast over the existing alliance WebSocket channel as
`alliance_mission_spawn` events. Other alliance members in the same city add
the mission to their local board (deduplicating by `mission.id`).

### Broadcast Protocol

```
Client A spawns mission → broadcasts alliance_mission_spawn
                        → Server relays to alliance channel
                        → Client B receives, adds to local board
                        → Client B can dispatch their units to it
```

**Event shape:**
```typescript
interface AllianceMissionSpawn {
  type: 'alliance_mission_spawn';
  mission: Mission;           // full mission object (name, location, category, etc.)
  playerName: string;         // who spawned it
  city: string;               // which city it's in
  allianceId: string;
}

interface AllianceMissionDispatch {
  type: 'alliance_mission_dispatch';
  missionId: string;
  playerName: string;
  unitCount: number;          // how many units this player is sending
  eta: number;                // seconds to arrival
}

interface AllianceMissionComplete {
  type: 'alliance_mission_complete';
  missionId: string;
  playerName: string;
  service: string;            // fire/ems/police
}
```

### Dispatch Coordination

When a player dispatches units to a shared mission, they broadcast
`alliance_mission_dispatch`. Other alliance members see:

- **Who's responding** — player name + unit count + ETA
- **"X units en route"** badge on the mission card
- **"Already handled"** indicator when enough units are committed (configurable
  threshold: e.g. 2+ units = covered for a Routine mission)

The originating player can cancel their dispatch (units return) at any time —
the cancellation also broadcasts so the "en route" count updates live.

### Completion & Credit

When any player completes a shared mission:

1. The completing player gets full local credit (credits, XP, alliance XP) —
   same as today.
2. A `alliance_mission_complete` event broadcasts to the alliance channel.
3. Other alliance members who had units en route to that mission see a
   notification: *"Alliance mission cleared by [player] — [mission name]"*
4. No duplicate credit — only the completing player earns rewards. The shared
   board is about *coordination*, not double-dipping.

### Mutual Aid Integration

The existing mutual aid system (cross-service calls, +25% bonus) composes
naturally:

- A shared mission is still classified as fire/ems/police by the originating
  player's service.
- If Player A is fire and Player B is EMS, and Player A spawns a fire mission
  on the shared board, Player B sees it as a mutual-aid opportunity (+25%
  bonus) — same as today's partner-agency calls, but now triggered by an
  alliance member instead of the city simulation.

### Alliance Level Gating

The shared board is gated by alliance level:

| Level | Feature |
|-------|---------|
| 1 | Solo only (existing behavior) |
| 2+ | Shared mission board — see alliance members' missions |
| 3+ | Dispatch coordination — send units to shared missions |
| 4+ | Cross-service shared board — see mutual-aid opportunities from allies |
| 5 | Full co-op — all features, no restrictions |

This gives alliance progression a tangible gameplay payoff beyond cosmetics.

## UI Changes

### Dispatch Board (UnifiedDispatchCenter)

A new **"Alliance" tab** on the dispatch board, alongside the existing service
tabs (Fire / EMS / Police). The tab shows:

- Missions spawned by alliance members in the same city
- Color-coded by originating player (each player gets a unique accent color
  from a palette)
- "Responding" badges showing who's en route
- "Already handled" indicator when the mission has enough units committed

### Mission Card Changes

Shared missions get:
- A small alliance badge (the originating player's tag/color)
- "En route: 2 units (Player A)" sub-line when dispatching
- "Cleared by Player B" post-completion

### Map Overlays

Alliance member units already appear on the map (purple glow). For shared
missions:
- Shared mission markers get a subtle pulse animation
- When a unit from another player is en route, a dashed line shows their
  approach path (same style as the existing ETA line, but in the player's
  accent color)

### Notifications

New notification types:
- `"Alliance mission: [name] — [player] needs backup"` (when a shared mission
  spawns)
- `"Alliance dispatch: [player] sending [N] units to [mission]"` (opt-in,
  settings-gated)
- `"Alliance clear: [player] cleared [mission] — no action needed"` (when a
  shared mission completes)

## Data Model Changes

### Mission (client-side only)

```typescript
// New optional fields on the Mission type (alliance sharing)
interface Mission {
  // ... existing fields ...

  /** Whether this mission is shared on the alliance board. */
  allianceShared?: boolean;
  /** Player ID of the alliance member who spawned this mission. */
  allianceSpawnerId?: string;
  /** Player name of the spawner (for display). */
  allianceSpawnerName?: string;
  /** Units currently en route from OTHER alliance members. */
  allianceResponders?: AllianceResponder[];
}

interface AllianceResponder {
  playerName: string;
  unitCount: number;
  eta: number;           // seconds
  service: ServiceType;
}
```

No new database tables. No new server routes. All state is in-memory via
WebSocket events and client-side stores.

## Settings

New toggles in the existing Settings panel (under "Multiplayer"):

| Setting | Default | Description |
|---------|---------|-------------|
| Shared Mission Board | ON | Show alliance members' missions on your board |
| Alliance Dispatch Notifications | ON | Show notifications when allies spawn/dispatch/complete |
| Auto-respond to shared missions | OFF | Automatically dispatch nearest available unit to shared missions |

## Implementation Phases

### Phase 1: Shared Board (read-only)
- Add `allianceShared` flag to Mission type
- Broadcast `alliance_mission_spawn` on spawn loop
- Add "Alliance" tab to UnifiedDispatchCenter
- Basic deduplication (don't add a mission you already have)
- **Tests:** 5-8 unit tests for broadcast/receive/dedup logic

### Phase 2: Dispatch Coordination
- Broadcast `alliance_mission_dispatch` / `alliance_mission_cancel`
- "En route" badges on shared mission cards
- "Already handled" indicator
- ETA sync between players
- **Tests:** 5-8 unit tests for dispatch tracking and count logic

### Phase 3: Completion & Notifications
- Broadcast `alliance_mission_complete`
- Completion notifications
- Post-completion "Cleared by [player]" display
- **Tests:** 3-5 unit tests for completion broadcast and notification

### Phase 4: Alliance Level Gating
- Gate shared board behind alliance level 2+
- Gate dispatch behind level 3+
- Gate cross-service behind level 4+
- **Tests:** 3-5 unit tests for level-gate logic

### Phase 5: UI Polish
- Player accent colors on shared missions
- Map overlays (dashed approach lines, pulse animations)
- Auto-respond setting
- **Tests:** Visual regression / manual QA

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| WebSocket spam from high spawn rates | Rate-limit `alliance_mission_spawn` to 1/3s per player; batch spawns |
| Stale missions on shared board | Shared missions expire with the same timer as local missions; TTL = `timeRemaining` |
| Cheating via shared board visibility | Missions are already client-authoritative; shared board is read-only — no new attack surface |
| Conflicting dispatch (too many units) | "Already handled" indicator; no hard cap — let players coordinate |
| Performance with 20-member alliances | Shared board capped at 10 visible missions (lowest priority evicted); lazy-load details |

## Success Metrics

- **Co-op dispatch rate:** % of shared missions that get multi-player responses
- **Alliance retention:** Do alliances with co-op dispatch have higher 7-day retention?
- **Session length:** Does shared dispatch increase average session time?
- **Alliance XP velocity:** Does shared dispatch increase alliance leveling speed?

## What This Does NOT Do (v1.0)

- **Shared resources** — players can't share credits, units, or stations
- **Cross-city dispatch** — still single-city per player
- **Alliance-wide mission board** — missions are still per-player, just visible
- **Server-authoritative missions** — missions remain client-side (v2.0 territory)
- **Voice comms** — text chat only (existing alliance chat)

---

*This spec follows the pattern established by the city traits system: data-driven,
composable, and incrementally deliverable. Phase 1 can ship as a minor version
bump; each subsequent phase adds gameplay without breaking the core loop.*
