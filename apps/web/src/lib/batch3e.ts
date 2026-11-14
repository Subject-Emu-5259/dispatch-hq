// ============================================
// Dispatch HQ — Batch 3e: FINAL FEATURES + CLEANUP
// Tech-tree expansion (feature 15), incident replay (16), photo
// snapshots (17), onboarding campaign (18), offline action queue (19).
//
// Pure module — no store, DOM, or network access — so the harness can
// prove real behavior (modifier math, grades, queue limits, chain
// progression) without rendering the game. All limits below are honest:
// the offline queue is in-memory (a reload drops queued non-save
// actions; saves have the browser mirror as a fallback), it is FIFO,
// it caps at 50 entries, and an entry is dropped after 3 failed sends.
// Nothing here promises delivery the transport cannot keep.
// ============================================

import type { ShareCardData } from './shareCard';

// ── Feature 15: tech-tree expansion ──────────────────────────────────────
// New operations-branch nodes (defined in techData.ts): op-drone (drone
// recon — faster scene size-up), op-hazmat (hazmat team), op-k9 (K9 unit).
// "Scene size-up" has no separate timer in this game: the on-scene phase
// IS the mission clear, so drone recon shortens clears across the board
// while hazmat/K9 shorten clears for their own call types. The multipliers
// below are the single source of truth; techTree.getClearSpeedMultiplier
// applies them on top of the existing training multipliers.

export const BATCH3E_TECH_IDS = ['op-drone', 'op-hazmat', 'op-k9'] as const;

/** Clear-speed multiplier from the drone node alone (all call types). */
export function droneClearMultiplier(purchased: ReadonlySet<string>): number {
  return purchased.has('op-drone') ? 1.25 : 1;
}

/** Clear-speed multiplier from the hazmat node (hazmat calls only). */
export function hazmatClearMultiplier(category: string | undefined, purchased: ReadonlySet<string>): number {
  return category === 'hazmat' && purchased.has('op-hazmat') ? 1.3 : 1;
}

/** Clear-speed multiplier from the K9 node (police calls only). */
export function k9ClearMultiplier(category: string | undefined, purchased: ReadonlySet<string>): number {
  return category === 'police' && purchased.has('op-k9') ? 1.2 : 1;
}

/** Combined Batch 3e clear-speed multiplier for one mission category. */
export function batch3eClearMultiplier(category: string | undefined, purchased: ReadonlySet<string>): number {
  return droneClearMultiplier(purchased) * hazmatClearMultiplier(category, purchased) * k9ClearMultiplier(category, purchased);
}

// ── Feature 16: incident replay / after-action review ────────────────────

export interface MissionHistoryEntry {
  id: string;
  name: string;
  category: string;
  /** ms epoch when the mission resolved (completed or expired). */
  resolvedAt: number;
  /** First-response seconds (dispatch → all units on scene), null if none. */
  responseSec: number | null;
  cleared: boolean;
  creditsEarned: number;
  xpEarned: number;
  /** Staged batch (Addition 6): gang this resolved incident belonged to. */
  gangId?: string;
  /** Staged batch (Addition 6): how a cleared traffic mission resolved. */
  stopOutcome?: 'citation' | 'warning' | 'arrest';
}

/** Cap: the replay tab shows one shift, not a career archive. */
export const MISSION_HISTORY_CAP = 50;

export type MissionGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Grade from first-response time. Thresholds are the game's own speed-bonus
 * intuition (fast = S): ≤2 min S, ≤4 min A, ≤7 min B, ≤10 min C, slower D;
 * an expired mission is always F, and a clear with no recorded response
 * time grades C (it cleared, but the response is unmeasured).
 */
export function gradeForResponse(responseSec: number | null, cleared: boolean): MissionGrade {
  if (!cleared) return 'F';
  if (responseSec == null || !Number.isFinite(responseSec)) return 'C';
  if (responseSec <= 120) return 'S';
  if (responseSec <= 240) return 'A';
  if (responseSec <= 420) return 'B';
  if (responseSec <= 600) return 'C';
  return 'D';
}

export function gradeForEntry(entry: MissionHistoryEntry): MissionGrade {
  return gradeForResponse(entry.responseSec, entry.cleared);
}

/** Append one resolved mission, keeping only the newest MISSION_HISTORY_CAP. */
export function recordMissionHistory(history: MissionHistoryEntry[], entry: MissionHistoryEntry): MissionHistoryEntry[] {
  const next = [...history, entry];
  return next.length > MISSION_HISTORY_CAP ? next.slice(next.length - MISSION_HISTORY_CAP) : next;
}

export interface ShiftReplayStats {
  total: number;
  cleared: number;
  failed: number;
  clearancePct: number;
  avgResponseSec: number | null;
  bestResponseSec: number | null;
  gradeCounts: Record<MissionGrade, number>;
}

/** Aggregate stats for the replay tab; null averages when nothing resolved. */
export function shiftReplayStats(history: MissionHistoryEntry[]): ShiftReplayStats {
  const gradeCounts: Record<MissionGrade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const e of history) gradeCounts[gradeForEntry(e)]++;
  const cleared = history.filter((e) => e.cleared).length;
  const withResponse = history.filter((e) => e.cleared && e.responseSec != null && Number.isFinite(e.responseSec as number));
  const avgResponseSec = withResponse.length > 0
    ? withResponse.reduce((s, e) => s + (e.responseSec as number), 0) / withResponse.length
    : null;
  const bestResponseSec = withResponse.length > 0
    ? Math.min(...withResponse.map((e) => e.responseSec as number))
    : null;
  return {
    total: history.length,
    cleared,
    failed: history.length - cleared,
    clearancePct: history.length > 0 ? Math.round((cleared / history.length) * 100) : 0,
    avgResponseSec,
    bestResponseSec,
    gradeCounts,
  };
}

// ── Feature 17: photo mode / incident snapshots ──────────────────────────
// A snapshot stores the share-card DATA, not a PNG: the gallery re-renders
// each snapshot through the existing renderShareCard painter, so there is
// exactly one renderer and the save blob stays small (card JSON, ~1–2 KB).
// Export/download still goes through the edition's existing shareCardPng
// path (main: clipboard-first PNG; Reddit: PNG export, no social intent).

export interface PhotoSnapshot {
  id: string;
  capturedAt: number;
  title: string;
  card: ShareCardData;
}

/** Cap: 12 snapshots; the oldest drops when a 13th is saved. */
export const PHOTO_GALLERY_CAP = 12;

export function addPhotoSnapshot(gallery: PhotoSnapshot[], snapshot: PhotoSnapshot): PhotoSnapshot[] {
  const withoutDup = gallery.filter((s) => s.id !== snapshot.id);
  const next = [...withoutDup, snapshot];
  return next.length > PHOTO_GALLERY_CAP ? next.slice(next.length - PHOTO_GALLERY_CAP) : next;
}

export function removePhotoSnapshot(gallery: PhotoSnapshot[], id: string): PhotoSnapshot[] {
  return gallery.filter((s) => s.id !== id);
}

export function parsePhotoGallery(raw: unknown): PhotoSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is PhotoSnapshot =>
      !!s && typeof s === 'object' && typeof (s as PhotoSnapshot).id === 'string'
      && typeof (s as PhotoSnapshot).capturedAt === 'number'
      && (s as PhotoSnapshot).card != null,
  ).slice(0, PHOTO_GALLERY_CAP);
}

// ── Feature 18: onboarding campaign ──────────────────────────────────────
// A guided first-shift mission chain. The tour (OnboardingOverlay) ends in
// a campaign intro card; starting it sets the chain active in the store
// (persisted in the save blob). Each step names the call type to clear —
// the App completion hook advances the chain only when the cleared
// mission's category matches the CURRENT step, so random clears cannot
// skip the lesson. A stuck player can skip a step from the First Shift
// card on the main menu (skipTutorialCampaignStep): the step is recorded
// in skippedStepIds, and skipping the final step ends the campaign with
// skipped: true instead of a completion. (Corrected 2026-11-14: an earlier
// version of this header claimed the chain "is skipped by clearing any
// mission of a later step's type" — that was never true in code;
// advanceTutorialCampaign requires an exact current-step match.)

export interface TutorialMissionStep {
  id: string;
  name: string;
  category: string;
  hint: string;
}

export const TUTORIAL_MISSION_CHAIN: TutorialMissionStep[] = [
  {
    id: 'tut-traffic',
    name: 'First Call — Fender Bender',
    category: 'traffic',
    hint: 'A minor collision needs one unit. Dispatch your nearest unit and watch the response timer — fast arrivals earn the best grades.',
  },
  {
    id: 'tut-fire',
    name: 'Second Call — Small Structure Fire',
    category: 'fire',
    hint: 'Fire calls want a fire unit. Send an engine, then check the replay tab in the shift report to see your grade.',
  },
  {
    id: 'tut-ems',
    name: 'Final Call — Medical Assist',
    category: 'ems',
    hint: 'An EMS call closes the chain. Clear it and your first shift is done — the campaign badge is the shift report itself.',
  },
];

export interface TutorialCampaignState {
  active: boolean;
  /** Index into TUTORIAL_MISSION_CHAIN; >= length means completed. */
  stepIndex: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Step ids the player skipped (skipTutorialCampaignStep) — recorded so a
   *  future shift-report replay can show "skipped" for these instead of a
   *  grade. No replay surface reads this yet. Absent = none. */
  skippedStepIds?: string[];
  /** True when the campaign ended by skipping its final step rather than
   *  clearing it — ended-by-skip, not completed. Absent = false. */
  skipped?: boolean;
}

export const EMPTY_TUTORIAL_CAMPAIGN: TutorialCampaignState = {
  active: false,
  stepIndex: 0,
  startedAt: null,
  completedAt: null,
};

export function startTutorialCampaign(now: number = Date.now()): TutorialCampaignState {
  return { active: true, stepIndex: 0, startedAt: now, completedAt: null };
}

export function parseTutorialCampaign(raw: unknown): TutorialCampaignState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_TUTORIAL_CAMPAIGN };
  const r = raw as Partial<TutorialCampaignState>;
  return {
    active: r.active === true,
    stepIndex: typeof r.stepIndex === 'number' && Number.isFinite(r.stepIndex)
      ? Math.max(0, Math.min(Math.floor(r.stepIndex), TUTORIAL_MISSION_CHAIN.length))
      : 0,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : null,
    completedAt: typeof r.completedAt === 'number' ? r.completedAt : null,
    skippedStepIds: Array.isArray(r.skippedStepIds)
      ? r.skippedStepIds.filter((id): id is string => typeof id === 'string')
      : undefined,
    skipped: r.skipped === true ? true : undefined,
  };
}

export interface CampaignAdvance {
  state: TutorialCampaignState;
  /** True when this clear moved the chain (step advanced or completed). */
  advanced: boolean;
  completed: boolean;
}

/**
 * Advance the chain on a cleared mission. Strict current-step match: a
 * clear of the current step's category advances one step; anything else
 * leaves the chain untouched (the hint tells the player what to clear
 * next). Completing the last step closes the chain (active=false).
 */
export function advanceTutorialCampaign(
  state: TutorialCampaignState,
  clearedCategory: string,
  now: number = Date.now(),
): CampaignAdvance {
  if (!state.active || state.stepIndex >= TUTORIAL_MISSION_CHAIN.length) {
    return { state, advanced: false, completed: false };
  }
  const current = TUTORIAL_MISSION_CHAIN[state.stepIndex];
  if (current.category !== clearedCategory) return { state, advanced: false, completed: false };
  const nextIndex = state.stepIndex + 1;
  const completed = nextIndex >= TUTORIAL_MISSION_CHAIN.length;
  return {
    state: {
      ...state,
      stepIndex: nextIndex,
      active: !completed,
      completedAt: completed ? now : state.completedAt,
    },
    advanced: true,
    completed,
  };
}

/**
 * Skip the current tutorial step (First Shift card on the main menu). Same
 * transition as a clear — stepIndex +1, campaign closes past the last step —
 * minus any grade: the skipped step's id is recorded in skippedStepIds, and
 * skipping the final step ends the campaign with skipped: true (ended-by-
 * skip, not completed). No-op on an inactive or finished campaign.
 */
export function skipTutorialCampaignStep(
  state: TutorialCampaignState,
  now: number = Date.now(),
): CampaignAdvance {
  if (!state.active || state.stepIndex >= TUTORIAL_MISSION_CHAIN.length) {
    return { state, advanced: false, completed: false };
  }
  const current = TUTORIAL_MISSION_CHAIN[state.stepIndex];
  const nextIndex = state.stepIndex + 1;
  const completed = nextIndex >= TUTORIAL_MISSION_CHAIN.length;
  const skippedStepIds = [...(state.skippedStepIds ?? []), current.id];
  return {
    state: {
      ...state,
      stepIndex: nextIndex,
      active: !completed,
      completedAt: completed ? now : state.completedAt,
      skippedStepIds,
      ...(completed ? { skipped: true as const } : {}),
    },
    advanced: true,
    completed,
  };
}

// ── Feature 19: offline action queue ─────────────────────────────────────
// FIFO queue of actions taken while offline. Limits, stated plainly:
// in-memory only (a reload drops queued non-save actions — saves have the
// browser mirror); max 50 entries (a 51st enqueue is rejected, never
// silently dropped); max 3 send attempts per entry, then it is dropped
// and the drop is reported to the caller so the UI can say so. The queue
// never reorders and never invents a success: drain reports sent /
// dropped / still-queued per entry.

export interface QueuedAction {
  id: string;
  kind: string;
  payload: unknown;
  queuedAt: number;
  attempts: number;
}

export const OFFLINE_QUEUE_CAP = 50;
export const OFFLINE_QUEUE_MAX_ATTEMPTS = 3;

export type EnqueueResult =
  | { ok: true; queue: QueuedAction[] }
  | { ok: false; queue: QueuedAction[]; error: string };

export function enqueueOfflineAction(queue: QueuedAction[], action: Omit<QueuedAction, 'attempts' | 'queuedAt'> & { queuedAt?: number }): EnqueueResult {
  if (queue.some((a) => a.id === action.id)) return { ok: true, queue };
  if (queue.length >= OFFLINE_QUEUE_CAP) {
    return { ok: false, queue, error: 'Offline queue is full (50 actions) — reconnect before taking more online actions.' };
  }
  return {
    ok: true,
    queue: [...queue, { ...action, queuedAt: action.queuedAt ?? Date.now(), attempts: 0 }],
  };
}

export interface DrainResult {
  /** Entries successfully sent (removed from the queue). */
  sent: QueuedAction[];
  /** Entries that hit max attempts and were dropped (removed). */
  dropped: QueuedAction[];
  /** Entries still queued (send failed, attempts left). */
  remaining: QueuedAction[];
}

/**
 * Drain attempt: `send` returns true per entry. A failed entry's attempt
 * count rises; at MAX_ATTEMPTS it is dropped rather than retried forever.
 * Order is preserved: draining stops at the first failure? No — each entry
 * is attempted independently in FIFO order, so one stuck entry cannot
 * block later ones; the caller re-drains on the next reconnect.
 */
export function drainOfflineQueue(queue: QueuedAction[], send: (action: QueuedAction) => boolean): DrainResult {
  const sent: QueuedAction[] = [];
  const dropped: QueuedAction[] = [];
  const remaining: QueuedAction[] = [];
  for (const action of queue) {
    let ok = false;
    try {
      ok = send(action);
    } catch {
      ok = false;
    }
    if (ok) {
      sent.push(action);
    } else {
      const attempts = action.attempts + 1;
      if (attempts >= OFFLINE_QUEUE_MAX_ATTEMPTS) dropped.push({ ...action, attempts });
      else remaining.push({ ...action, attempts });
    }
  }
  return { sent, dropped, remaining };
}

/** Custom events the offline banner + diagnostics listen for. */
export const ACTION_QUEUED_EVENT = 'dhq-action-queued';
export const ACTION_FLUSHED_EVENT = 'dhq-action-flushed';
export const ACTION_DROPPED_EVENT = 'dhq-action-dropped';

export function dispatchActionEvent(name: string): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
  } catch {
    /* non-browser / test env — no banner to notify */
  }
}
