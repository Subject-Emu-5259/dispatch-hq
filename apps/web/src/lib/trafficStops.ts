// ============================================
// Dispatch HQ — Traffic-stop outcomes (staged batch, Addition 6)
// ============================================
// Traffic stops existed as bare templates (traffic_stop, speeding_vehicle)
// with no resolution: a cleared stop paid credits and vanished. Now a
// cleared traffic mission resolves from REAL data — the linked suspect
// record's warrant state — or a citation/warning roll:
//   • linked record has an active warrant → 'arrest' (the stop found a
//     wanted subject; the record is already warrant-active via
//     attachSuspectToMission, so the arrest path reuses booking);
//   • otherwise → 'citation' (60%) or 'warning' (40%).
// Pure: the caller passes the record (or null) and an injectable roll so
// harnesses can force each branch. App wires the outcome into mission
// history + career counters on clear; nothing here touches the store.

import type { CriminalRecord, TrafficStopOutcome } from '@dispatch-hq/shared';

export interface TrafficStopResolution {
  outcome: TrafficStopOutcome;
  /** Human-readable reason, built only from the record/outcome — no flavor. */
  reason: string;
}

/** Resolve a cleared traffic stop. `rand` defaults to Math.random. */
export function resolveTrafficStopOutcome(
  record: Pick<CriminalRecord, 'warrantStatus' | 'firstName' | 'lastName'> | null | undefined,
  rand: () => number = Math.random,
): TrafficStopResolution {
  if (record && record.warrantStatus === 'active') {
    return {
      outcome: 'arrest',
      reason: `Warrant check flagged ${record.firstName} ${record.lastName} — subject taken into custody.`,
    };
  }
  if (rand() < 0.6) {
    return { outcome: 'citation', reason: 'Violation confirmed — citation issued.' };
  }
  return { outcome: 'warning', reason: 'Verbal warning issued — driver released.' };
}
