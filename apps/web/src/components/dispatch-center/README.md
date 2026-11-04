# Dispatch Center modules (STAGED batch)

Step 1 (done): the tab registry lives in `tabs.ts` (`DispatchTab`,
`CORE_TABS`, `SERVICE_TABS`, `TAB_META`, `visibleTabsFor`). Adding a tab =
registry entry + one render branch in `UnifiedDispatchCenter.tsx`, nothing
else. The console shell (`isOpen`/`onClose` props only), the store slices it
reads, and the `radio-message` window bus are unchanged.

## Module seams for later passes (planned, not yet extracted)

Each module below receives store slices + `addComm`/`addRadio` as props (or
via a `DispatchContext` if prop-drilling gets noisy). Modules must keep
reading `missions`/`units` from the store — never copy them into tab-local
state. The Assistant is the future LLM swap point: only its query function's
body changes, never the tab shell.

| Module | Owns |
|---|---|
| `CallQueue.tsx` | `IncomingCall` type, random-call generation, accept/dispatch/decline, ringing list |
| `Board.tsx` | Board cards, priority/tier/zone helpers, auto-dispatch |
| `RadioConsole.tsx` | `radio-message` listener, compose/broadcast UI (its unit selection stays radio-scoped) |
| `Roster.tsx` | Roster grid, patrol/recall/lend buttons — and the future Locate/Follow button (which must set App's selection via the store's `followedUnitId`/`selectedUnitId` path and close the console, since the overlay covers the map) |
| `Assistant.tsx` | Keyword engine behind `queryAssistant(q, snapshot) => string` |
| `CommLog.tsx` | Right rail + `commLog` state, mounted across tabs |

## Rules

- New tabs register here; never inline a second tab list.
- Follow state lives in the store (`followedUnitId`), never in CAD-local
  state — App-local selection is exactly why CAD could not select before.
- The Assistant stays template-only until an LLM path is approved; its
  module boundary is where that swap happens.
