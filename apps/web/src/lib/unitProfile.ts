// ============================================
// Dispatch HQ — Unit profile derivation (staged batch, Addition 8)
// ============================================
// The unit cards showed status + level + rank but never answered "whose
// unit is this, where does it belong, how ready is it, what has it done?"
// in one place — and the selected-unit panel lacked certs, veterancy, and
// shift history entirely. This module derives the full profile from data
// the game already tracks (nothing invented):
//   • station: the unit's stationId joined to stations (or 'Unassigned');
//   • service: passed in by the caller (the service mapping already lives
//     in utils/routing — not duplicated here);
//   • veterancy: rank + XP-to-next from unitsStaff (null at max rank);
//   • certs / academy: the unit's own academy record, with remaining
//     game-minutes from unitsStaff;
//   • readiness: crewReadiness over the unit's assigned crew when the
//     fatigue simulation is on, else null (fatigue inert — no fake label);
//   • shift clears: shift.unitShiftStats[unit.id] — this shift only. The
//     game tracks no lifetime per-unit mission count, so none is shown.
// Pure: panels render what comes out; harnesses prove every field.

import type { Unit, Station, Employee } from '@dispatch-hq/shared';
import { UNIT_CONFIGS } from '@dispatch-hq/shared';
import { veterancyRankFor, veterancyXpToNext, academyRemainingGameMin } from './unitsStaff';
import { crewReadiness } from './personnel';

export interface UnitProfile {
  service: 'fire' | 'police' | 'ems';
  stationName: string;
  jurisdiction: string;
  level: number;
  rank: string;
  xpToNext: number | null;
  certs: string[];
  academy: { course: string; remainingGameMin: number } | null;
  readiness: { label: string; pct: number } | null;
  shiftClears: number;
  crewSize: number;
  crewCapacity: number;
  patrolSummary: string | null;
}

export function buildUnitProfile(
  unit: Unit,
  station: Station | null | undefined,
  service: 'fire' | 'police' | 'ems',
  shiftClears: number,
  crew: Employee[],
  fatigueMode: string,
  gameMinutes: number,
): UnitProfile {
  const readiness = crew.length > 0 && fatigueMode !== 'off'
    ? (() => {
        const r = crewReadiness(crew);
        return r ? { label: r.label, pct: Math.round(r.avgEffectiveness * 100) } : null;
      })()
    : null;
  return {
    service,
    stationName: station?.name ?? 'Unassigned',
    jurisdiction: unit.jurisdiction ?? 'city',
    level: unit.trainingLevel,
    rank: veterancyRankFor(unit.veterancyXp),
    xpToNext: veterancyXpToNext(unit.veterancyXp),
    certs: [...(unit.certs ?? [])],
    academy: unit.academy
      ? { course: unit.academy.course, remainingGameMin: academyRemainingGameMin(unit, gameMinutes) }
      : null,
    readiness,
    shiftClears,
    crewSize: crew.length,
    crewCapacity: UNIT_CONFIGS[unit.type]?.capacity ?? 0,
    patrolSummary: unit.patrolMode
      ? `${unit.patrolMode}${unit.patrolAreaId ? ` · zone ${unit.patrolAreaId}` : ''}`
      : null,
  };
}
