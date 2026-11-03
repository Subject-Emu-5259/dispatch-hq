// ============================================
// Dispatch HQ — Daily + Weekly Challenges (Batch 3d)
// ============================================
// Pure rules, no I/O: the tracker component + sync hook feed events in
// (dispatch, mission outcome, aid-board answers) and this module owns
// progress, streak rules, day/week rollover, and reward math.
// Rewards are XP always; coins only where money exists (main edition —
// credited through the local save-blob economy, never a new server money
// path). The Reddit edition passes coinsEnabled=false and gets XP only.

export type ChallengeScope = 'daily' | 'weekly';

export interface ChallengeDef {
  id: string;
  scope: ChallengeScope;
  title: string;
  description: string;
  target: number;
  xp: number;
  /** Coins on main only; 0 on Reddit (coinsEnabled=false). */
  coins: number;
}

export const DAILY_CHALLENGES: ChallengeDef[] = [
  { id: 'dispatch-5', scope: 'daily', title: 'Five Calls Out', description: 'Dispatch units to 5 missions.', target: 5, xp: 100, coins: 50 },
  { id: 'flawless-3', scope: 'daily', title: 'Clean Streak', description: 'Complete 3 missions in a row with zero fails.', target: 3, xp: 100, coins: 50 },
  { id: 'aid-1', scope: 'daily', title: 'Good Neighbor', description: 'Answer 1 mutual-aid / aid-board call.', target: 1, xp: 100, coins: 50 },
];

export const WEEKLY_CHALLENGES: ChallengeDef[] = [
  { id: 'dispatch-25', scope: 'weekly', title: 'Busy Week', description: 'Dispatch units to 25 missions.', target: 25, xp: 500, coins: 200 },
  { id: 'clears-15', scope: 'weekly', title: 'Fifteen Clears', description: 'Complete 15 missions.', target: 15, xp: 500, coins: 200 },
  { id: 'aid-3', scope: 'weekly', title: 'Aid Network', description: 'Answer 3 mutual-aid / aid-board calls.', target: 3, xp: 500, coins: 200 },
];

export const ALL_CHALLENGES: ChallengeDef[] = [...DAILY_CHALLENGES, ...WEEKLY_CHALLENGES];

export function challengeDef(id: string): ChallengeDef | undefined {
  return ALL_CHALLENGES.find((c) => c.id === id);
}

export interface ChallengeProgress {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface ChallengeState {
  dateKey: string;
  weekKey: string;
  /** Zero-fail streak across completed missions (resets on any fail). */
  streak: number;
  /** Last career mutualAidAnswered seen; null until the first sync (so old
   * answers never retro-count toward today's aid challenge). */
  aidSeen: number | null;
  daily: Record<string, ChallengeProgress>;
  weekly: Record<string, ChallengeProgress>;
}

function blankProgress(): Record<string, ChallengeProgress> {
  return {};
}

function progressFor(state: ChallengeState, scope: ChallengeScope, id: string): ChallengeProgress {
  const bucket = scope === 'daily' ? state.daily : state.weekly;
  return bucket[id] ?? { progress: 0, completed: false, claimed: false };
}

function bump(state: ChallengeState, scope: ChallengeScope, id: string, by: number): void {
  const def = challengeDef(id);
  if (!def) return;
  const bucket = scope === 'daily' ? state.daily : state.weekly;
  const cur = bucket[id] ?? { progress: 0, completed: false, claimed: false };
  const progress = cur.progress + by;
  bucket[id] = { progress, completed: cur.completed || progress >= def.target, claimed: cur.claimed };
}

/** UTC calendar day key, e.g. "2026-11-03". */
export function dayKeyFor(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ISO-week key, e.g. "2026-W45" (Monday-first, UTC). */
export function weekKeyFor(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function emptyChallengeState(now: Date = new Date()): ChallengeState {
  return { dateKey: dayKeyFor(now), weekKey: weekKeyFor(now), streak: 0, aidSeen: null, daily: blankProgress(), weekly: blankProgress() };
}

/** Rollover: a new day resets daily progress (weekly survives); a new week resets both. */
export function rolloverChallengeState(state: ChallengeState, now: Date = new Date()): ChallengeState {
  const dateKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  if (state.dateKey === dateKey && state.weekKey === weekKey) return state;
  const next: ChallengeState = {
    ...state,
    dateKey,
    weekKey,
    daily: state.dateKey === dateKey ? state.daily : blankProgress(),
    weekly: state.weekKey === weekKey ? state.weekly : blankProgress(),
  };
  // Streak is a same-day concept: a new day breaks it.
  if (state.dateKey !== dateKey) next.streak = 0;
  return next;
}

/** A mission got units assigned (first dispatch of that mission). */
export function recordDispatch(state: ChallengeState, now: Date = new Date()): ChallengeState {
  const next = rolloverChallengeState(cloneState(state), now);
  bump(next, 'daily', 'dispatch-5', 1);
  bump(next, 'weekly', 'dispatch-25', 1);
  return next;
}

/**
 * A mission resolved. Success grows the zero-fail streak (the flawless
 * challenge tracks the live streak, so it completes at 3 and can complete
 * again only after a reset); any fail/expire resets the streak to 0.
 */
export function recordMissionOutcome(state: ChallengeState, success: boolean, now: Date = new Date()): ChallengeState {
  const next = rolloverChallengeState(cloneState(state), now);
  if (success) {
    next.streak += 1;
    const cur = progressFor(next, 'daily', 'flawless-3');
    next.daily['flawless-3'] = {
      progress: next.streak,
      completed: cur.completed || next.streak >= 3,
      claimed: cur.claimed,
    };
    bump(next, 'weekly', 'clears-15', 1);
  } else {
    next.streak = 0;
    const cur = progressFor(next, 'daily', 'flawless-3');
    next.daily['flawless-3'] = { progress: 0, completed: cur.completed, claimed: cur.claimed };
  }
  return next;
}

/**
 * Feed the career mutualAidAnswered total. Only the DELTA since the last
 * sync counts (first sync just baselines, so pre-existing answers never
 * retro-complete today's challenge).
 */
export function recordAidAnswers(state: ChallengeState, totalAnswered: number, now: Date = new Date()): ChallengeState {
  const next = rolloverChallengeState(cloneState(state), now);
  if (next.aidSeen === null) {
    next.aidSeen = totalAnswered;
    return next;
  }
  const delta = Math.max(0, totalAnswered - next.aidSeen);
  next.aidSeen = totalAnswered;
  if (delta > 0) {
    bump(next, 'daily', 'aid-1', delta);
    bump(next, 'weekly', 'aid-3', delta);
  }
  return next;
}

/** Reward for claiming a completed, unclaimed challenge — or an error string. */
export function claimChallenge(
  state: ChallengeState,
  scope: ChallengeScope,
  id: string,
  coinsEnabled: boolean,
): { state: ChallengeState; xp: number; coins: number } | { error: string } {
  const def = challengeDef(id);
  if (!def || def.scope !== scope) return { error: 'Unknown challenge' };
  const cur = progressFor(state, scope, id);
  if (!cur.completed) return { error: 'Challenge not complete yet' };
  if (cur.claimed) return { error: 'Already claimed' };
  const next = cloneState(state);
  const bucket = scope === 'daily' ? next.daily : next.weekly;
  bucket[id] = { ...cur, claimed: true };
  return { state: next, xp: def.xp, coins: coinsEnabled ? def.coins : 0 };
}

export function challengeProgress(state: ChallengeState, def: ChallengeDef): ChallengeProgress {
  return progressFor(state, def.scope, def.id);
}

function cloneState(state: ChallengeState): ChallengeState {
  return {
    ...state,
    daily: Object.fromEntries(Object.entries(state.daily).map(([k, v]) => [k, { ...v }])),
    weekly: Object.fromEntries(Object.entries(state.weekly).map(([k, v]) => [k, { ...v }])),
  };
}

/** Defensive parse of a saved challenge blob; anything malformed → fresh state. */
export function parseChallengeState(raw: unknown, now: Date = new Date()): ChallengeState {
  const fresh = emptyChallengeState(now);
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Record<string, unknown>;
  const parseBucket = (v: unknown): Record<string, ChallengeProgress> => {
    if (!v || typeof v !== 'object') return {};
    const out: Record<string, ChallengeProgress> = {};
    for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
      if (!challengeDef(k) || !p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      if (typeof pp.progress !== 'number') continue;
      out[k] = { progress: pp.progress, completed: pp.completed === true, claimed: pp.claimed === true };
    }
    return out;
  };
  return rolloverChallengeState({
    dateKey: typeof r.dateKey === 'string' ? r.dateKey : fresh.dateKey,
    weekKey: typeof r.weekKey === 'string' ? r.weekKey : fresh.weekKey,
    streak: typeof r.streak === 'number' ? r.streak : 0,
    aidSeen: typeof r.aidSeen === 'number' ? r.aidSeen : null,
    daily: parseBucket(r.daily),
    weekly: parseBucket(r.weekly),
  }, now);
}
