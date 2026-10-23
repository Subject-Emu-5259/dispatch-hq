# V1.0 Co-Op Endgame — Shared Resources

> **The Last Multiplayer Gap**
> Co-op dispatch (Phases 1-5) is live. Alliance members can see each other's
> missions, dispatch units, and coordinate responses. But they still can't
> share resources — credits, units, or stations. This spec closes that gap
> and delivers the "true multiplayer" the roadmap originally promised.

---

## Problem Statement

Right now, every player runs an isolated economy: they earn credits, build
stations, buy units, and progress their tech tree entirely solo. Alliance
members can coordinate on missions (co-op dispatch), but there's no way to:

- Pool credits for a shared goal (e.g. building a joint station)
- Lend a unit to an ally who's understaffed
- Gift credits to a new member who's struggling to get started
- Run a shared fleet across multiple stations

The original roadmap called this "true multiplayer." The current state is
"co-op dispatch" — shared missions, but private resources.

## Design Principles

1. **Opt-in at every level.** Sharing is never forced. Players choose what
   to share and with whom.
2. **Alliance-level gated.** Shared resources unlock progressively as the
   alliance levels up, giving progression a tangible payoff.
3. **No exploitation.** Rate limits, caps, and cooldowns prevent resource
   farming via alt accounts or gifting loops.
4. **Composable with co-op dispatch.** Shared resources stack with the
   existing shared mission board — a pooled treasury funds joint stations,
   which answer shared missions.
5. **Server-authoritative for shared state.** Unlike local missions (client-
   authoritative), shared resources live on the server so every member sees
   the same balances and inventories.

## Architecture

### Alliance Treasury

A shared credit pool that all alliance members can contribute to and spend
from. The treasury funds joint projects: building stations, purchasing units,
and upgrading infrastructure.

**Server model:**
```sql
-- New table: alliance_treasury
CREATE TABLE alliance_treasury (
  alliance_id    UUID PRIMARY KEY REFERENCES alliances(id),
  balance        INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- New table: alliance_treasury_transactions
CREATE TABLE alliance_treasury_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id    UUID NOT NULL REFERENCES alliances(id),
  player_id      UUID NOT NULL REFERENCES players(id),
  delta          INTEGER NOT NULL,         -- + deposited, - withdrawn
  reason         VARCHAR(30) NOT NULL,     -- deposit|withdraw|station_build|unit_purchase|upgrade|gift
  ref_id         UUID,                     -- station/unit id for build/purchase
  balance_after  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**API routes:**
```
POST /api/alliances/treasury/deposit   { amount: number }
POST /api/alliances/treasury/withdraw  { amount: number }
GET  /api/alliances/treasury           → { balance, recentTransactions }
GET  /api/alliances/treasury/log       → { transactions[] }  (paginated)
```

**Rules:**
- Only members with role `leader` or `officer` can withdraw or spend.
- All members can deposit.
- Daily deposit cap: 50,000 credits per player (prevents farming).
- Daily withdrawal cap: 100,000 credits per player (prevents draining).
- Treasury balance floor: 0 (can't go negative).
- All transactions are logged with player id, reason, and timestamp.

### Shared Stations

Alliance members can pool treasury credits to build stations that belong to
the alliance, not any individual player. Shared stations answer missions
from any alliance member in the same city.

**Server model:**
```sql
-- New column on stations: alliance ownership
ALTER TABLE stations ADD COLUMN alliance_id UUID REFERENCES alliances(id);
-- NULL = private station (existing behavior)
-- non-NULL = shared station (alliance-owned)
```

**Rules:**
- Shared stations require alliance level 3+ to build.
- Build cost is paid from the treasury (not the player's credits).
- Any officer+ can upgrade a shared station (cost from treasury).
- Shared stations appear on the map for all alliance members (purple glow,
  same as allied units).
- Shared stations answer shared missions automatically (like partner
  stations, but for alliance members).
- A shared station can be "claimed" by a player (becomes their personal
  station) if they pay the treasury the full build cost — this lets the
  alliance "sell" stations to members who want independence.

### Unit Lending

Alliance members can temporarily lend units to each other. The lending
player's unit appears in the borrowing player's fleet for a fixed duration.

**Server model:**
```sql
-- New table: alliance_unit_loans
CREATE TABLE alliance_unit_loans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id    UUID NOT NULL REFERENCES alliances(id),
  lender_id      UUID NOT NULL REFERENCES players(id),
  borrower_id    UUID NOT NULL REFERENCES players(id),
  unit_type      VARCHAR(50) NOT NULL,     -- what type of unit
  unit_config    JSONB NOT NULL,           -- stats, livery, training level
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'active'  -- active|returned|expired
);
```

**Rules:**
- Unit lending requires alliance level 4+.
- Loan duration: 2 hours (configurable by officers).
- Maximum 2 active loans per player (lender and borrower each count).
- The lender's unit is "locked" (can't be dispatched) during the loan.
- The borrower gets a copy of the unit's stats — the original stays with
  the lender.
- When the loan expires, the unit returns to the lender automatically.
- Officers can recall a loan early (unit returns immediately).
- The borrower can return a loan early (unit goes back to lender).

**UI:**
- Lending: in the Unit Roster, a "Lend to Ally" button on available units.
  Picker shows online alliance members in the same city.
- Borrowing: in the Unit Roster, a "Loaned Units" section shows borrowed
  units with a countdown timer.
- Map: loaned units appear with a special icon (dashed outline) and the
  lender's name.

### Credit Gifting

One-time credit transfers between alliance members. Simple, transparent,
rate-limited.

**Server model:**
```sql
-- New table: alliance_gifts
CREATE TABLE alliance_gifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id    UUID NOT NULL REFERENCES alliances(id),
  sender_id      UUID NOT NULL REFERENCES players(id),
  receiver_id    UUID NOT NULL REFERENCES players(id),
  amount         INTEGER NOT NULL,
  message        VARCHAR(200),             -- optional gift message
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Rules:**
- Credit gifting requires alliance level 2+.
- Daily gift cap: 25,000 credits per player (sending + receiving combined).
- Minimum gift: 100 credits (prevents spam).
- Maximum single gift: 50,000 credits.
- All gifts are logged and visible in the alliance activity feed.
- The receiver gets a notification: "[Player] sent you [amount] credits!"

### Alliance Activity Feed

A shared timeline of alliance resource events, visible to all members.

**Events:**
- Treasury deposits/withdrawals (amount + player)
- Station builds/upgrades (station name + cost)
- Unit loans (lender → borrower + duration)
- Credit gifts (sender → receiver + amount)
- Milestone achievements (first shared station, treasury milestones)

**UI:** A new "Activity" tab in the Alliance panel, showing a reverse-
chronological feed of these events. Each event has an icon, player name,
and timestamp.

## Alliance Level Progression (Updated)

| Level | XP | Unlocked Feature |
|-------|-----|-----------------|
| 1 | 0 | Shared mission board (view only) |
| 2 | 2,000 | Dispatch coordination + Credit gifting |
| 3 | 6,000 | Cross-service shared board + Shared stations |
| 4 | 14,000 | Full co-op dispatch + Unit lending |
| 5 | 26,000 | Alliance treasury (full access) |

**Rationale:** Treasury is gated at Level 5 because it's the most powerful
feature — pooled resources can accelerate progression significantly. Credit
gifting is Level 2 because it's simple and low-risk. Shared stations are
Level 3 because they affect mission coverage. Unit lending is Level 4
because it directly affects combat capability.

## Server-Side Changes

### New Routes

```
POST /api/alliances/treasury/deposit    → deposit credits
POST /api/alliances/treasury/withdraw   → withdraw credits (officer+)
GET  /api/alliances/treasury            → balance + recent transactions
GET  /api/alliances/treasury/log        → full transaction log (paginated)

POST /api/alliances/stations/build      → build shared station from treasury
POST /api/alliances/stations/:id/upgrade → upgrade shared station
POST /api/alliances/stations/:id/claim  → claim a shared station (pay treasury)

POST /api/alliances/loans/create        → lend a unit
POST /api/alliances/loans/:id/return    → return a loan early
POST /api/alliances/loans/:id/recall    → recall a loan (officer+)

POST /api/alliances/gifts/send          → send credits
GET  /api/alliances/activity            → activity feed
```

### WebSocket Events

```
alliance_treasury_update    → { balance: number }  (all members)
alliance_station_built      → { station: Station }  (all members)
alliance_loan_created       → { loan: Loan }        (all members)
alliance_loan_returned      → { loanId: string }    (all members)
alliance_gift_sent          → { sender, receiver, amount }  (all members)
alliance_activity           → { event: ActivityEvent }      (all members)
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/treasury/deposit` | 10/min per player |
| `/treasury/withdraw` | 5/min per officer |
| `/gifts/send` | 5/min per player |
| `/loans/create` | 3/min per player |
| `/stations/build` | 1/min per alliance |

## Client-Side Changes

### New Components

- **AllianceTreasury.tsx** — balance display, deposit/withdraw forms,
  transaction log
- **AllianceStations.tsx** — shared station list, build/upgrade buttons,
  claim flow
- **AllianceLoans.tsx** — active loans, lend/return/recall buttons
- **AllianceGifts.tsx** — gift picker, amount slider, message input
- **AllianceActivity.tsx** — activity feed timeline

### Updated Components

- **Sidebar.tsx** — new "Treasury" and "Activity" tabs in the Alliance section
- **StationsPanel.tsx** — shared stations shown alongside private stations
  (purple border)
- **UnitRoster.tsx** — "Lend to Ally" button, "Loaned Units" section
- **UnifiedDispatchCenter.tsx** — shared stations in the dispatch picker

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Alliance Auto-Deposit | OFF | Automatically deposit 10% of mission earnings to treasury |
| Loan Notifications | ON | Show notifications when units are lent/returned |
| Gift Notifications | ON | Show notifications when credits are received |

## Implementation Phases

### Phase 1: Alliance Treasury
- Server: `alliance_treasury` + `alliance_treasury_transactions` tables
- Server: deposit/withdraw/log API routes
- Client: AllianceTreasury component
- Client: Treasury tab in Alliance panel
- **Tests:** 8-10 unit tests for deposit/withdraw/cap logic

### Phase 2: Credit Gifting
- Server: `alliance_gifts` table
- Server: gift send API route
- Client: AllianceGifts component
- Client: Gift notification
- **Tests:** 5-7 unit tests for gift caps and daily limits

### Phase 3: Shared Stations
- Server: `alliance_id` column on stations
- Server: build/upgrade/claim API routes
- Server: shared station WebSocket events
- Client: AllianceStations component
- Client: Shared station markers on map
- **Tests:** 8-10 unit tests for build cost, upgrade, and claim logic

### Phase 4: Unit Lending
- Server: `alliance_unit_loans` table
- Server: create/return/recall API routes
- Server: loan expiry cron job
- Client: AllianceLoans component
- Client: Loaned unit display in UnitRoster
- **Tests:** 8-10 unit tests for loan creation, expiry, and recall

### Phase 5: Activity Feed & Polish
- Server: `alliance_activity` events
- Client: AllianceActivity component
- Client: Auto-deposit setting
- UI polish: animations, badges, milestone celebrations
- **Tests:** 3-5 unit tests for activity event generation

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Resource farming via alt accounts | Daily caps on deposits/gifts; one alliance per player |
| Treasury draining by rogue officer | Daily withdrawal cap; founder can freeze treasury |
| Unit lending exploitation | Loan duration cap; max 2 active loans; original stays with lender |
| Shared station griefing | Only officers can build/upgrade; claim requires full cost payment |
| Server load from treasury transactions | Rate-limited; indexed; transactions are append-only |
| New player confusion | Onboarding tooltip explains sharing; gradual unlock via levels |

## Success Metrics

- **Treasury utilization:** % of alliances with >0 treasury balance
- **Shared station count:** How many alliance-owned stations exist
- **Loan activity:** Average loans per alliance per week
- **Gift volume:** Total credits gifted per day
- **Alliance retention:** Do alliances with shared resources have higher 30-day retention?
- **Revenue impact:** Does shared infrastructure increase membership conversions?

## What This Does NOT Do (v1.0)

- **Shared tech tree** — each player keeps their own tech purchases
- **Shared XP** — alliance XP is separate from player XP
- **Cross-city resource sharing** — shared resources are per-city
- **Alliance-wide mission board** — missions are still per-player (co-op dispatch handles visibility)
- **Server-authoritative local state** — player credits, units, stations remain client-authoritative for solo play
- **Voice comms** — text chat only (existing alliance chat)

---

*This spec builds on the co-op dispatch foundation (Phases 1-5, v0.38-v0.40)
and the city traits system (v0.35). It's the final piece of the "true
multiplayer" puzzle — the feature that turns alliances from social groups
into functional teams.*
