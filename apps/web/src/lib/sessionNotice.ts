// ============================================
// Dispatch HQ — Session Reset Notice (v0.22.17)
// ============================================
// One-time in-game notice for players whose session was invalidated by the
// pre-launch JWT_SECRET rotation (see plans/RELEASES.md §0b): the rotation
// signed every existing session out in one go, so returning players land on
// the auth screen. After they log back in, tell them once why it happened.
//
// Rules:
//   - Only accounts created BEFORE the rotation day qualify (a brand-new
//     account never had a session to reset).
//   - Shown at most once per browser (localStorage flag, versioned so a
//     future notice can re-arm by bumping the key).
//   - Fired only on the explicit Login path — Register, Quick Play (guest),
//     and Continue Game don't re-login an existing account, so the message
//     would be wrong for them.

import type { Player } from '@dispatch-hq/shared';

/** Day the pre-launch JWT_SECRET rotation happened (runbook §0b). */
export const SESSION_RESET_CUTOFF_ISO = '2026-08-13T00:00:00Z';

/** Versioned browser flag — bump the suffix to re-arm a future notice. */
export const SESSION_RESET_FLAG_KEY = 'dhq_session_reset_notice_shown_v1';

export interface SessionResetNoticePayload {
  type: 'warning';
  title: string;
  message: string;
  icon: string;
  duration: number;
}

export const SESSION_RESET_NOTICE: SessionResetNoticePayload = {
  type: 'warning',
  title: '🔐 Security Rotation — Please Log In Again',
  message:
    'As part of our pre-launch security hardening we rotated the game’s session keys, which signed everyone out once. Log in again to pick up right where you left off — your campaign, settings, and progress are all safe.',
  icon: '🔐',
  duration: 15_000,
};

/**
 * Pure decision: should this player see the reset notice right now?
 * Returns false for missing players, already-shown browsers (pass the
 * localStorage flag value — non-null means shown), and accounts created
 * after the rotation day (they never had a session to reset).
 */
export function shouldShowSessionResetNotice(
  player: Pick<Player, 'createdAt'> | null | undefined,
  flagValue: string | null,
): boolean {
  if (!player) return false;
  if (flagValue !== null) return false;
  const createdAt = Date.parse(player.createdAt);
  const cutoff = Date.parse(SESSION_RESET_CUTOFF_ISO);
  if (!Number.isFinite(createdAt) || !Number.isFinite(cutoff)) return false;
  return createdAt < cutoff;
}

/** Guarded localStorage read — privacy modes / webviews can throw. */
export function sessionResetFlagValue(): string | null {
  try {
    return window.localStorage.getItem(SESSION_RESET_FLAG_KEY);
  } catch {
    return null;
  }
}

/** Guarded localStorage write — returns true when the flag stuck. */
export function markSessionResetNoticeShown(): boolean {
  try {
    window.localStorage.setItem(SESSION_RESET_FLAG_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
