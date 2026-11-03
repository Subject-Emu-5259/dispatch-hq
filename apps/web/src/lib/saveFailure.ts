// ============================================
// Dispatch HQ — Save-Failure Specificity (Batch 3d polish)
// ============================================
// One classifier shared by autosave + Save Now so the player never sees a
// connectivity message for a too-large or stale save (or vice versa).
// Kinds, in priority order: offline > too-large > stale > auth > server.

export type SaveFailureKind = 'offline' | 'too-large' | 'stale' | 'auth' | 'server';

export const SAVE_FAILURE_COPY: Record<SaveFailureKind, { title: string; message: string }> = {
  offline: {
    title: 'Offline — Save Queued',
    message: "You're offline — progress is kept in this browser and will save when you're back online.",
  },
  'too-large': {
    title: 'Save Too Large',
    message:
      'Save too large — this campaign is too big for dispatch cloud. Your progress is still kept in this browser — keep this tab open and do not clear site data.',
  },
  stale: {
    title: 'Save Conflict',
    message: 'A newer save already exists for this slot — reload to keep the newer progress instead of overwriting it.',
  },
  auth: {
    title: 'Session Expired',
    message: 'Session expired — sign back in from the profile menu.',
  },
  server: {
    title: 'Auto Save Failed',
    message: 'Could not reach dispatch cloud — retrying. Recent progress may not be saved.',
  },
};

export function classifySaveError(err: unknown, online: boolean = true): SaveFailureKind {
  if (!online) return 'offline';
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (/save too large|request too large|payload too large|\b413\b/i.test(message)) return 'too-large';
  if (/stale|newer save|\b409\b/i.test(message)) return 'stale';
  if (/unauthorized|invalid or expired|missing or malformed|session expired|\b401\b/i.test(message)) return 'auth';
  return 'server';
}

/** Custom event the offline banner listens for (queued-save indicator). */
export const SAVE_QUEUED_EVENT = 'dhq-save-queued';

export function dispatchSaveQueued(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SAVE_QUEUED_EVENT));
  } catch {
    /* non-browser / test env — no banner to notify */
  }
}
