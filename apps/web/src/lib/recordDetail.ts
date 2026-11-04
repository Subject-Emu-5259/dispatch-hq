// ============================================
// Dispatch HQ — Criminal record detail derivation (staged batch, Addition 7)
// ============================================
// The records list was "too plain": rows showed names + charges, and the
// detail modal showed identity + charge chips + arrest count, but nothing
// joined the record to the rest of the game — its active incident, its
// jail/court state, its gang affiliation, or its computed sentence/bail.
// This module joins those pieces from data the game itself generated:
//   • linked mission: the live mission whose id the record's missionId
//     points at (null when unlinked — honestly "no active incident");
//   • jail row: the LATEST inmate row for this record (by bookingTime),
//     carrying status, sentence, bail, jurisdiction, and court verdict
//     (null when never booked — "not in custody");
//   • gang: the GANGS definition for the record's stamped gangId (null
//     when unaffiliated — never invented);
//   • statutes + sentence/bail: the game-code table (DHQ-###) and the
//     charge-driven helper; unknown charges yield no statute and no
//     computed sentence (shown as unknown, never fabricated).
// Pure: the panel passes store slices in, the modal renders what comes
// out, and harnesses can prove every field against stored data.

import { gangById, type Gang, type CriminalRecord, type Inmate, type Mission } from '@dispatch-hq/shared';
import { statuteForCharge, sentenceAndBailForCharges, type ChargeStatute } from './chargeStatutes';

export interface ChargeLine {
  charge: string;
  statute: ChargeStatute | null;
}

export interface RecordDetail {
  record: CriminalRecord;
  gang: Gang | null;
  chargeLines: ChargeLine[];
  /** Computed from the top charge's range; null when no charge has a statute. */
  computed: { sentenceDays: number; bailAmount: number } | null;
  /** Live linked mission, or null when the record has no active incident. */
  linkedMission: Mission | null;
  /** Latest jail row for this record, or null when never booked. */
  inmate: Inmate | null;
  /** Court disposition in plain words, from the inmate row or jail status. */
  disposition: string;
}

export function dispositionFor(inmate: Inmate | null): string {
  if (!inmate) return 'No court case on file';
  if (inmate.status === 'transferred') return 'Transferred (jail at capacity)';
  if (inmate.verdict === 'guilty') return 'Court: guilty — sentence per game code';
  if (inmate.verdict === 'dismissed') return 'Court: dismissed';
  if (inmate.status === 'released') return 'Released — case closed';
  return 'Court: hearing pending';
}

export function buildRecordDetail(
  record: CriminalRecord,
  missions: Mission[],
  inmates: Inmate[],
): RecordDetail {
  const gang = gangById(record.gangId);
  const chargeLines: ChargeLine[] = record.charges.map((charge) => ({
    charge,
    statute: statuteForCharge(charge) ?? null,
  }));
  // Deterministic midpoint pick: the detail view shows the computed range's
  // representative value, not a fresh random roll on every render.
  const computed = sentenceAndBailForCharges(record.charges, record.riskLevel, 0.5);
  const linkedMission = record.missionId
    ? (missions.find((m) => m.id === record.missionId) ?? null)
    : null;
  const inmateRows = inmates.filter((i) => i.recordId === record.id);
  const inmate = inmateRows.length > 0
    ? inmateRows.reduce((latest, row) => (row.bookingTime >= latest.bookingTime ? row : latest))
    : null;
  return {
    record,
    gang,
    chargeLines,
    computed,
    linkedMission,
    inmate,
    disposition: dispositionFor(inmate),
  };
}
