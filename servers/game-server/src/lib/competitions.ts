// ============================================
// Dispatch HQ — Alliance Competitions (Batch 3c)
// ============================================
// Pure weekly-competition math. The ONLY event stream feeding a competitive
// board is server-persisted seasonal contest entries: the seasonal
// /complete route validates the window server-side and writes the row
// before anything counts. Client-reported alliance XP (POST /alliances/xp,
// retired with 410 in Batch 1) and client-reported player stats
// (POST /player/stats, client-authoritative per P1-M5) NEVER enter this
// module — its inputs are DB rows only, so there is no parameter a client
// number could ride in on.
//
// Shipped competition: most clears (weekly, per alliance).
// QUEUED — fastest average response: no server-verified response-time
// stream exists (stats are client-reported), so this board is NOT built.
// Blocker: a server mission ledger. The route says so explicitly instead
// of ranking a forgeable number.

export interface CompetitionEntryRow {
  allianceId: string;
  playerId: string;
  callsCleared: number;
  cityClears: number;
}

/** ISO week key (Monday-start) for a date, UTC. e.g. 2026-11-02. */
export function weekKeyFor(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

/** UTC start (Monday 00:00) of the ISO week containing `date`. */
export function weekStartFor(date: Date): Date {
  return new Date(`${weekKeyFor(date)}T00:00:00.000Z`);
}

export interface AllianceCompetitionRank {
  allianceId: string;
  rank: number;
  totalClears: number;
  manualClears: number;
  cityClears: number;
  memberCount: number;
}

/**
 * Rank alliances by server-verified clears. Manual (player) clears and
 * city (CPU-handled) clears stay visible separately; ranking uses the sum,
 * matching the seasonal leaderboard's TOTAL_CLEARS rule.
 */
export function rankAlliancesByClears(rows: CompetitionEntryRow[]): AllianceCompetitionRank[] {
  const byAlliance = new Map<string, { total: number; manual: number; city: number; members: Set<string> }>();
  for (const r of rows) {
    const cur = byAlliance.get(r.allianceId) ?? { total: 0, manual: 0, city: 0, members: new Set<string>() };
    cur.manual += r.callsCleared;
    cur.city += r.cityClears;
    cur.total += r.callsCleared + r.cityClears;
    cur.members.add(r.playerId);
    byAlliance.set(r.allianceId, cur);
  }
  return [...byAlliance.entries()]
    .map(([allianceId, v]) => ({
      allianceId,
      rank: 0,
      totalClears: v.total,
      manualClears: v.manual,
      cityClears: v.city,
      memberCount: v.members.size,
    }))
    .sort((a, b) => b.totalClears - a.totalClears || a.allianceId.localeCompare(b.allianceId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
