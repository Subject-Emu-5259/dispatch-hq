// ============================================
// Dispatch HQ — Tutorial "seen" marker (v0.22.x)
// ============================================
// The onboarding tour shows once per ACCOUNT, not once per campaign. When a
// player finishes (or skips) the tour, a per-account marker lands in
// localStorage; new campaigns then skip the auto-show. Replay Tutorial in the
// pause menu is unaffected — it is an explicit action, never an auto-show.
// Keyed per player so a shared browser never carries one account's tour state
// to another (same convention as releaseSeen).

const DONE_KEY_PREFIX = 'dhq_tutorial_done_';

function keyFor(playerId: string | null | undefined): string {
  return `${DONE_KEY_PREFIX}${playerId ?? 'guest'}`;
}

/** Has this account already completed (or skipped) the tour on this browser? */
export function hasCompletedTutorial(playerId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(keyFor(playerId)) === '1';
  } catch {
    // localStorage unavailable (private mode) — assume NOT completed so a
    // first-time player still gets the tour; nothing is written, so no error.
    return false;
  }
}

/** Record that this account finished/skipped the tour (idempotent). */
export function markTutorialCompleted(playerId: string | null | undefined): void {
  try {
    localStorage.setItem(keyFor(playerId), '1');
  } catch {
    // Ignore — quota/availability; the tour is a one-time nicety, not a gate.
  }
}
