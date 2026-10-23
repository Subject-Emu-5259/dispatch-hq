// ============================================
// Dispatch HQ — Release "seen" tracker (v0.22.x)
// ============================================
// The What's New button (main menu + pause menu) carries an unread dot that
// only clears after the player opens the release notes for the current
// version. The marker is per player AND per version in localStorage, so:
//   • a reload never resurrects the dot for a version already read, and
//   • a shared browser never shows one account's read state to another.
// The ReleaseNotesModal calls markReleaseSeen on open; the buttons subscribe
// through useReleaseUnread so the dot disappears the moment the modal opens.

import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { currentVersion } from '@/data/releaseNotes';

const SEEN_EVENT = 'dhq-release-notes-seen';

function keyFor(playerId: string | null | undefined, version: string): string {
  return `dhq_release_seen_${playerId ?? 'guest'}_${version}`;
}

/** Has this player opened the notes for `version` on this browser? */
export function hasSeenRelease(playerId: string | null | undefined, version: string): boolean {
  try {
    return localStorage.getItem(keyFor(playerId, version)) === '1';
  } catch {
    // localStorage unavailable (private mode) — treat as read so we never nag.
    return true;
  }
}

/** Record that this player opened the notes for `version` (idempotent). */
export function markReleaseSeen(playerId: string | null | undefined, version: string): void {
  try {
    localStorage.setItem(keyFor(playerId, version), '1');
  } catch {
    // Ignore — quota/availability; the dot is cosmetic.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SEEN_EVENT));
  }
}

/** Live unread state for the What's New buttons. Re-evaluates when the
 * player identity hydrates (a tick after boot) and when the notes are
 * marked seen, so both buttons always agree. */
export function useReleaseUnread(): boolean {
  const playerId = useGameStore((s) => s.player?.id);
  const [unread, setUnread] = useState<boolean>(() => !hasSeenRelease(playerId, currentVersion()));

  useEffect(() => {
    setUnread(!hasSeenRelease(playerId, currentVersion()));
    const handler = () => setUnread(!hasSeenRelease(playerId, currentVersion()));
    window.addEventListener(SEEN_EVENT, handler);
    return () => window.removeEventListener(SEEN_EVENT, handler);
  }, [playerId]);

  return unread;
}
