// ============================================
// Dispatch HQ — Update nudge (v0.22.0 Task 1a)
// ============================================
// Kills the stale-bundle complaint class for good: a player whose browser is
// still running an old cached build sees a one-time "Update available — reload"
// notification instead of reporting missing/white UI as a bug.
//
// Mechanism: the running bundle's version (releaseNotes.ts, shipped inside the
// JS) is compared against the live server's version (/health is public and
// returns `version`; both are bumped together on every deploy). When the server
// is newer, fire one notification per version (localStorage-memorialized) with
// a Reload action. Lightweight: one fetch on boot, one on window focus, and one
// when a backgrounded tab becomes visible again (mobile Safari doesn't always
// fire `focus` on resume, so `visibilitychange` is the reliable signal there) —
// all throttled to 30s, fully silent on failure (offline / dev server).

import { useCallback, useEffect, useRef } from 'react';
import { useNotifications } from '@/components/NotificationCenter';
import { currentVersion } from '@/data/releaseNotes';
import { isNewerVersion } from '@/lib/versionCheck';

const CHECK_URL = '/health';
const THROTTLE_MS = 30_000;
const dismissKey = (version: string) => `dhq_update_dismissed_${version}`;

export function useUpdateNudge() {
  const { addNotification } = useNotifications();
  const lastCheckRef = useRef(0);

  const check = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < THROTTLE_MS) return;
    lastCheckRef.current = now;
    try {
      const res = await fetch(CHECK_URL, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: unknown };
      const serverVersion = typeof data?.version === 'string' ? data.version : '';
      const bundleVersion = currentVersion();
      if (!serverVersion || !isNewerVersion(serverVersion, bundleVersion)) return;
      // One-time per version per browser — never nag repeatedly.
      if (localStorage.getItem(dismissKey(serverVersion))) return;
      localStorage.setItem(dismissKey(serverVersion), '1');
      addNotification({
        type: 'warning',
        title: 'Update available — reload to get the latest',
        message: `v${serverVersion} is live. Tap to reload Dispatch HQ and grab the new build.`,
        icon: '🔄',
        duration: 15000,
        action: () => {
          window.location.reload();
        },
      });
    } catch {
      // Offline / dev server without /health — never interrupt play.
    }
  }, [addNotification]);

  useEffect(() => {
    check();
    const onFocus = () => check();
    const onVisibility = () => {
      // Mobile Safari doesn't always fire `focus` when a backgrounded tab comes
      // back — `visibilitychange` → visible is the reliable resume signal there.
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check]);
}
