// ============================================
// Dispatch HQ — Shift Debrief Summary
// ============================================
// Pure aggregation of a completed shift into a shareable debrief: clearance
// rate, busiest neighborhood, difficulty-tier mix, unit leaders, and a
// plain-text block for the copy-to-clipboard button.

import type { CareerStats, ShiftStats } from '@/stores/gameStore';
import { formatTimer } from '@/utils/timeFormat';
import { patientOutcomesForShift, type PatientShiftOutcomes } from '@/lib/hospital';
import type { Patient, Station } from '@dispatch-hq/shared';

export type TierKey = 'routine' | 'moderate' | 'serious' | 'critical';

export const TIER_LABELS: Record<TierKey, string> = {
  routine: 'Routine',
  moderate: 'Moderate',
  serious: 'Serious',
  critical: 'Critical',
};

export interface ShiftSummary {
  bestResponseSec: number | null;
  clearanceRate: number;        // 0..1
  topZone: string | null;
  tierMix: Record<TierKey, number>;
  unitLeaders: { name: string; missions: number }[];
  // Crew condition (v0.20.5)
  crewHoursRidden: number;      // game-hours on duty across the fleet
  avgFatigue: number | null;    // mean fatigue of all personnel (0–100)
  peakFatigue: number;          // highest fatigue reached this shift
  overworkEvents: number;
  moraleBoosts: number;
  restEvents: number;
  // Hospital recovery (v0.22.10) — patient milestones folded into this shift.
  patientOutcomes: PatientShiftOutcomes;
  // Ward expansions (v0.22.17) — credits-bought bed upgrades this shift.
  wardExpansions: number;
  wardBedsAdded: number;
  wardCreditsSpent: number;
  copyText: string;             // plain-text shareable summary
}

export function buildShiftSummary(input: {
  shift: ShiftStats;
  units: Array<{ id: string; name: string }>;
  career: CareerStats;
  stations?: Station[];
  patients?: Patient[];
}): ShiftSummary {
  const { shift, units, career, stations, patients } = input;

  // Mean fatigue across every employee in the department (null when nobody is hired).
  const allEmployees = (stations ?? []).flatMap((s) => s.employees ?? []);
  const avgFatigue = allEmployees.length > 0
    ? allEmployees.reduce((sum, e) => sum + (e.fatigue ?? 0), 0) / allEmployees.length
    : null;

  const total = shift.missionsCompleted + shift.missionsFailed;
  const clearanceRate = total > 0 ? shift.missionsCompleted / total : 0;

  let topZone: string | null = null;
  let topZoneCalls = 0;
  for (const [id, z] of Object.entries(shift.zoneStats ?? {})) {
    if (z.calls > topZoneCalls) {
      topZoneCalls = z.calls;
      topZone = id;
    }
  }

  const tierMix: ShiftSummary['tierMix'] = {
    routine: shift.tierCounts?.routine ?? 0,
    moderate: shift.tierCounts?.moderate ?? 0,
    serious: shift.tierCounts?.serious ?? 0,
    critical: shift.tierCounts?.critical ?? 0,
  };

  const byUnit = Object.entries(shift.unitShiftStats ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const unitLeaders = byUnit.map(([id, missions]) => ({
    name: units.find((u) => u.id === id)?.name ?? 'Unit',
    missions,
  }));

  const best = career.bestResponseTime > 0 && Number.isFinite(career.bestResponseTime)
    ? career.bestResponseTime
    : null;
  const bestSec = best != null ? formatTimer(best) : '--:--';
  const tierLine = (Object.entries(tierMix) as Array<[TierKey, number]>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${TIER_LABELS[k]}: ${n}`)
    .join(' · ') || 'No calls cleared';

  const crewHours = shift.crewHoursRidden ?? 0;
  const crewLine = allEmployees.length > 0
    ? `Crew: ${crewHours.toFixed(1)}h ridden · avg fatigue ${avgFatigue != null ? Math.round(avgFatigue) : 0}% · peak ${shift.peakFatigue ?? 0}%`
      + ` · events: ${shift.overworkEvents ?? 0} overwork / ${shift.moraleBoosts ?? 0} boosts / ${shift.restEvents ?? 0} rests`
    : null;

  // Hospital recovery — patient milestones that happened during this shift.
  // Ward expansions (v0.22.17) — credits-bought bed upgrades this shift.
  const wardExpansions = shift.wardExpansions ?? 0;
  const wardLine = wardExpansions > 0
    ? `Ward: ${wardExpansions} upgrade${wardExpansions === 1 ? '' : 's'} · +${shift.wardBedsAdded ?? 0} beds · $${(shift.wardCreditsSpent ?? 0).toLocaleString()}`
    : null;

  const patientOutcomes = patientOutcomesForShift(patients ?? [], shift.startedAt ?? 0);
  const recoveryLine = patientOutcomes.transported > 0
    ? `Recovery: ${patientOutcomes.transported} transported · ${patientOutcomes.treated} treated · `
      + `${patientOutcomes.recovered} recovered / ${patientOutcomes.recovered + patientOutcomes.released} discharged`
      + (patientOutcomes.recoveryRate != null
        ? ` (${Math.round(patientOutcomes.recoveryRate * 100)}% recovery)`
        : '')
      + (patientOutcomes.diverted > 0 ? ` · ${patientOutcomes.diverted} diverted to trauma center` : '')
      + (patientOutcomes.airlifted + patientOutcomes.roadTransported > 0
        ? ` · ✈️ ${patientOutcomes.airlifted} airlifted / ${patientOutcomes.roadTransported} road`
        : '')
    : null;

  const copyText = [
    '🏙️ DISPATCH HQ — SHIFT REPORT',
    '———————————————————————',
    `Shift cleared: ${shift.missionsCompleted}/${total || 0} (${Math.round(clearanceRate * 100)}%)`,
    `Credits earned: ${shift.creditsEarned.toLocaleString()} · XP: ${shift.xpEarned.toLocaleString()}`,
    `Best response: ${bestSec}`,
    `Busiest neighborhood: ${topZone ?? '—'}`,
    `Tier mix: ${tierLine}`,
    unitLeaders.length > 0
      ? `Top units: ${unitLeaders.map((u) => `${u.name} (${u.missions})`).join(', ')}`
      : 'Top units: —',
    ...(crewLine ? [crewLine] : []),
    ...(wardLine ? [wardLine] : []),
    ...(recoveryLine ? [recoveryLine] : []),
    '———————————————————————',
    'Command the chaos.',
  ].join('\n');

  return {
    bestResponseSec: best,
    clearanceRate,
    topZone,
    tierMix,
    unitLeaders,
    crewHoursRidden: crewHours,
    avgFatigue,
    peakFatigue: shift.peakFatigue ?? 0,
    overworkEvents: shift.overworkEvents ?? 0,
    moraleBoosts: shift.moraleBoosts ?? 0,
    restEvents: shift.restEvents ?? 0,
    patientOutcomes,
    wardExpansions,
    wardBedsAdded: shift.wardBedsAdded ?? 0,
    wardCreditsSpent: shift.wardCreditsSpent ?? 0,
    copyText,
  };
}
