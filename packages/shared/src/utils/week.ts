// ============================================
// Dispatch HQ — Weekly Stats Utilities
// ============================================
// ISO-8601 week keying for the Friends leaderboard's "who's ahead this week"
// comparison. Weeks roll over every Monday so the snapshot is stable across a
// weekend of play but resets for the new week.

/** Snapshot of one player's activity within a single ISO week. */
export interface WeeklySnapshot {
  /** ISO week key, e.g. "2026-W32". */
  weekKey: string;
  /** Missions started this week (cleared + failed). */
  callsRun: number;
  /** Missions cleared this week. */
  cleared: number;
  /** Credits earned this week. */
  creditsEarned: number;
  /** XP earned this week. */
  xpEarned: number;
}

/** ISO-8601 week key (year-Www) for the given date, local time. */
export function isoWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export function emptyWeekly(date: Date = new Date()): WeeklySnapshot {
  return { weekKey: isoWeekKey(date), callsRun: 0, cleared: 0, creditsEarned: 0, xpEarned: 0 };
}
