// ============================================
// Dispatch HQ — New-Signup Gate
// ============================================
// Founder-controlled switch that stops NEW account creation (the /register
// endpoint and guest→account upgrades). While the gate is CLOSED, new players
// cannot create accounts — login and guest play keep working untouched, so
// existing players and casual guests are unaffected. This is the emergency
// brake for e.g. abuse, spam, or a launch-day flood, NOT a maintenance mode.
//
// Default is OPEN (signups allowed) — the gate is off out of the box and only
// closes when the founder flips it in the Admin Console. State is in-memory
// (same single-instance model as maintenance); a restart resets it to open.
//
// The founder can arm an optional auto-reopen: while closed with `reopensAt`
// set, the gate flips itself back open the moment that time passes. The flip
// is checked lazily (on the next register/upgrade attempt and on status
// reads), so no background timer is needed — the first attempt after the
// deadline succeeds. The 403 response carries `reopensAt` so clients can
// show a live countdown to players.

export interface SignupGateState {
  /** true = new signups allowed; false = account creation rejected. */
  open: boolean;
  /** ISO timestamp of the last state change, or null when never changed. */
  since: string | null;
  /**
   * ISO timestamp at which a closed gate reopens automatically, or null.
   * Only meaningful while `open` is false — clearing it or reopening nulls it.
   */
  reopensAt: string | null;
}

let state: SignupGateState = {
  open: true,
  since: null,
  reopensAt: null,
};

export function getSignupGateState(): SignupGateState {
  // Read through the auto-reopen check so callers never see a stale
  // closed state after the deadline has passed.
  maybeAutoReopen();
  return { ...state };
}

/** Whether new account creation is currently allowed (auto-reopen applied). */
export function areSignupsOpen(): boolean {
  maybeAutoReopen();
  return state.open;
}

/**
 * Set the gate: `open: false` stops new account creation; `true` reopens it.
 * While closing, `reopensAt` (an ISO timestamp) arms an automatic reopen at
 * that moment — pass null to close indefinitely (manual reopen only).
 * The `since` timestamp records the LAST change so the Admin Console can show
 * how long the gate has been in its current state.
 */
export function setSignupGate(open: boolean, reopensAt?: string | null): SignupGateState {
  let nextReopensAt: string | null = null;
  if (!open) {
    const raw = reopensAt == null ? null : String(reopensAt);
    if (raw != null) {
      const t = new Date(raw).getTime();
      if (Number.isFinite(t)) {
        // A deadline already in the past = "reopen immediately" — honor it
        // by leaving the gate open rather than arming a stale timestamp.
        if (t <= Date.now()) {
          return setSignupGate(true, null);
        }
        nextReopensAt = new Date(t).toISOString();
      }
    }
  }
  state = {
    open,
    since: new Date().toISOString(),
    reopensAt: nextReopensAt,
  };
  return getSignupGateState();
}

/**
 * Lazy auto-reopen: if the gate is closed and the armed reopen time has
 * passed, flip it back open. Called on every state read and register/
 * upgrade attempt, so the first attempt after the deadline just works.
 */
function maybeAutoReopen(): void {
  if (state.open) return;
  if (!state.reopensAt) return;
  if (Date.now() < new Date(state.reopensAt).getTime()) return;
  state = {
    open: true,
    since: new Date().toISOString(),
    reopensAt: null,
  };
}
