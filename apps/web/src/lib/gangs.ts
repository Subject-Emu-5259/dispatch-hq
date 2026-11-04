// ============================================
// Dispatch HQ — Gang activity derivation (staged batch, Addition 6)
// ============================================
// The gang layer stores nothing of its own: activity is DERIVED from data
// the crime system already produces — suspect records stamped with a
// gangId at spawn (see stampGangAffiliation in spawn.ts), live missions
// carrying a gangId, and cleared mission-history entries with a gangId.
// Pure functions, so cards, records, and harnesses all read the same
// numbers. A gang with no affiliated records/missions/history shows zero
// activity — never an invented presence.

import { GANGS, gangById, type Gang } from '@dispatch-hq/shared';
import type { CriminalRecord } from '@dispatch-hq/shared';

export interface GangActivity {
  gang: Gang;
  /** Suspect records stamped with this gang (the affiliation pool). */
  affiliatedRecords: number;
  /** Live missions carrying this gangId right now. */
  liveIncidents: number;
  /** Cleared history entries with this gangId (resolved incidents). */
  clearedIncidents: number;
}

/** Per-gang activity from real game data only. */
export function gangActivitySummary(
  records: Pick<CriminalRecord, 'gangId'>[],
  liveMissions: { gangId?: string }[],
  history: { gangId?: string; cleared: boolean }[],
): GangActivity[] {
  return GANGS.map((gang) => ({
    gang,
    affiliatedRecords: records.filter((r) => r.gangId === gang.id).length,
    liveIncidents: liveMissions.filter((m) => m.gangId === gang.id).length,
    clearedIncidents: history.filter((h) => h.gangId === gang.id && h.cleared).length,
  }));
}

/** Gang label for a mission/record, or null when unaffiliated. */
export function gangLabelFor(gangId: string | null | undefined): string | null {
  return gangById(gangId)?.name ?? null;
}
