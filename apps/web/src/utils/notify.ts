// ============================================
// Dispatch HQ — Desktop Push Notifications
// ============================================
// Web Notification API surfaced only when the player opts in (pushEnabled
// setting) and only fires while the tab is hidden — you're busy elsewhere
// and a critical call needs units NOW.

import { loadSettings } from './settings';

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export function notify(title: string, body: string, icon = '/logo-512.png?v=13'): void {
  if (typeof window === 'undefined') return;
  if (document.visibilityState !== 'hidden') return;
  if (!loadSettings().pushEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon });
  } catch {
    // Best-effort — never break gameplay on a notification failure.
  }
}
