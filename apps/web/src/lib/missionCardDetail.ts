// ============================================
// Dispatch HQ — Mission card detail derivation (staged batch, Addition 9)
// ============================================
// Crime/mission cards showed name, description, needs, rewards, tier, and
// timer — but not the crime's own facts: its type, severity, place,
// gang link, escalation state, or how many units are already on it. This
// module derives that collapsed-visible detail row from the mission
// record itself (same terms as the crime audit, POI spawn work, and the
// Addition 6 crime/gang additions — no parallel versions):
//   • category label: the mission's own category;
//   • priority: the mission's spawn-time priority (absent on older
//     records → no chip, never a guessed severity);
//   • POI label: a placed-POI type resolves through POI_TYPE_META; a
//     spawn bucket (residential/commercial/road/…) resolves through the
//     bucket map; anything else yields no label;
//   • gang: the GANGS definition for the mission's gangId (absent or
//     unknown → no chip);
//   • escalated: the mission's own escalation counter (≥1);
//   • responding: the count of assigned unit ids (0 → no chip).
// Pure: the card renders what comes out; harnesses prove every field.

import { gangById } from '@dispatch-hq/shared';
import { POI_TYPE_META } from './pois';
import type { Mission } from '@dispatch-hq/shared';

export const CATEGORY_LABELS: Record<Mission['category'], string> = {
  fire: 'Fire',
  traffic: 'Traffic',
  rescue: 'Rescue',
  hazmat: 'Hazmat',
  police: 'Police',
  ems: 'EMS',
};

const BUCKET_LABELS: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  retail: 'Retail',
  road: 'Road',
  highway: 'Highway',
  intersection: 'Intersection',
  public: 'Public',
  park: 'Park',
  school: 'School',
  warehouse: 'Warehouse',
  industrial: 'Industrial',
  rural: 'Rural',
  parking: 'Parking',
  water: 'Waterfront',
  high_rise: 'High-Rise',
  bank: 'Bank',
};

export const PRIORITY_TONES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-gray-700/40 text-gray-400 border-gray-700/40',
};

export interface MissionCardDetail {
  categoryLabel: string;
  priority: string | null;
  priorityTone: string | null;
  poiLabel: string | null;
  gangName: string | null;
  gangColor: string | null;
  escalated: boolean;
  respondingCount: number;
}

export function buildMissionCardDetail(mission: Pick<Mission, 'category' | 'priority' | 'poiType' | 'gangId' | 'escalations' | 'assignedUnits'>): MissionCardDetail {
  const meta = mission.poiType ? (POI_TYPE_META as Record<string, { label: string } | undefined>)[mission.poiType] : undefined;
  const poiLabel = meta?.label ?? (mission.poiType ? BUCKET_LABELS[mission.poiType] ?? null : null);
  const gang = gangById(mission.gangId);
  return {
    categoryLabel: CATEGORY_LABELS[mission.category] ?? mission.category,
    priority: mission.priority ?? null,
    priorityTone: mission.priority ? PRIORITY_TONES[mission.priority] ?? PRIORITY_TONES.low : null,
    poiLabel,
    gangName: gang?.name ?? null,
    gangColor: gang?.color ?? null,
    escalated: (mission.escalations ?? 0) >= 1,
    respondingCount: mission.assignedUnits.length,
  };
}
