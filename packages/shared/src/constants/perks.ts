// ============================================
// Dispatch HQ — Station Specialization Perks
// ============================================
// Stations earn specialization slots as they level up (levels 2, 3, 5) and
// the commander picks one perk per slot. Perks branch by station type and
// plug into existing mechanics: coverage radius, mission rewards, and
// hiring/training costs. Chosen perks persist on `station.perks`.

import type { Station, StationType } from '../types/station';
import type { Mission } from '../types/mission';

export interface StationPerk {
  id: string;
  stationType: StationType;
  name: string;
  description: string;
  icon: string;
  /** Effect category — the lib applies each kind to its mechanic. */
  kind:
    | 'radius'
    | 'reward'
    | 'training_discount'
    | 'hire_discount'
    | 'jail_capacity'
    | 'hospital_beds';
  /** Magnitude: 0.15 radius boost, 0.10 reward bonus, 0.25 cost discount,
   * 8 jail booking slots, 5 hospital beds. */
  value: number;
}

/** Station levels that award a new specialization slot (max level 5). */
export const PERK_SLOT_LEVELS = [2, 3, 5] as const;

export const STATION_PERKS: StationPerk[] = [
  // ── Fire ──────────────────────────────────────────────
  {
    id: 'fire_response_radius',
    stationType: 'fire_station',
    name: 'Response Radius',
    description: '+15% coverage radius — fire units reach calls further from the station.',
    icon: '📡',
    kind: 'radius',
    value: 0.15,
  },
  {
    id: 'fire_suppression',
    stationType: 'fire_station',
    name: 'Suppression Wing',
    description: '+10% rewards on fire, hazmat, and rescue calls cleared by this station\'s units.',
    icon: '🧯',
    kind: 'reward',
    value: 0.1,
  },
  {
    id: 'training_hall',
    stationType: 'fire_station',
    name: 'Training Hall',
    description: '−25% training cost for this station\'s crew.',
    icon: '🏋️',
    kind: 'training_discount',
    value: 0.25,
  },
  // ── Police ────────────────────────────────────────────
  {
    id: 'police_response_radius',
    stationType: 'police_station',
    name: 'Response Radius',
    description: '+15% coverage radius — patrol units reach calls further from the station.',
    icon: '📡',
    kind: 'radius',
    value: 0.15,
  },
  {
    id: 'patrol_presence',
    stationType: 'police_station',
    name: 'Patrol Presence',
    description: '+10% rewards on police and traffic calls cleared by this station\'s units.',
    icon: '🚓',
    kind: 'reward',
    value: 0.1,
  },
  {
    id: 'dispatch_office',
    stationType: 'police_station',
    name: 'Dispatch Office',
    description: '−10% hiring cost for this station.',
    icon: '📻',
    kind: 'hire_discount',
    value: 0.1,
  },
  {
    id: 'jail_capacity',
    stationType: 'police_station',
    name: 'Jail Capacity',
    description: '+8 booking slots at the county jail — more suspects held before overflow.',
    icon: '🏛️',
    kind: 'jail_capacity',
    value: 8,
  },
  // ── EMS ───────────────────────────────────────────────
  {
    id: 'ems_response_radius',
    stationType: 'ems_station',
    name: 'Response Radius',
    description: '+15% coverage radius — EMS units reach calls further from the station.',
    icon: '📡',
    kind: 'radius',
    value: 0.15,
  },
  {
    id: 'community_care',
    stationType: 'ems_station',
    name: 'Community Care',
    description: '+10% rewards on EMS calls cleared by this station\'s units.',
    icon: '❤️',
    kind: 'reward',
    value: 0.1,
  },
  {
    id: 'paramedic_training',
    stationType: 'ems_station',
    name: 'Paramedic Academy',
    description: '−25% training cost for this station\'s crew.',
    icon: '🎓',
    kind: 'training_discount',
    value: 0.25,
  },
  {
    id: 'hospital_ward',
    stationType: 'ems_station',
    name: 'Hospital Ward',
    description: '+5 beds at the city hospital ER — more patients treated before diversion.',
    icon: '🛏️',
    kind: 'hospital_beds',
    value: 5,
  },
];

export function perksForStationType(type: StationType): StationPerk[] {
  return STATION_PERKS.filter((p) => p.stationType === type);
}

export function hasPerk(station: Pick<Station, 'perks'>, perkId: string): boolean {
  return (station.perks ?? []).includes(perkId);
}

export function perkById(id: string): StationPerk | undefined {
  return STATION_PERKS.find((p) => p.id === id);
}

/**
 * Aggregate the numeric effect of every owned perk of one kind across stations
 * (v0.24.0): the county jail's booking slots and the hospital ER's beds grow
 * with the stations that picked the matching capacity perk. Each perk stacks,
 * so two "Jail Capacity" stations add +16 slots. Returns 0 when none own it.
 */
export function capacityBonusFor(
  stations: Pick<Station, 'perks'>[],
  kind: StationPerk['kind'],
): number {
  let total = 0;
  for (const station of stations) {
    for (const id of station.perks ?? []) {
      const perk = perkById(id);
      if (perk?.kind === kind) total += perk.value;
    }
  }
  return total;
}

/** How many specialization slots a station of this level has earned. */
export function perkSlotsForLevel(level: number): number {
  return PERK_SLOT_LEVELS.filter((l) => level >= l).length;
}

/** The next slot level the station hasn't filled yet, or null. */
export function nextPerkSlotLevel(station: Pick<Station, 'level' | 'perks'>): number | null {
  const filled = (station.perks ?? []).length;
  const slot = PERK_SLOT_LEVELS[filled];
  if (slot == null) return null;
  return station.level >= slot ? slot : null;
}

/** Perks the station may still pick for its next open slot. */
export function availablePerkChoices(station: Pick<Station, 'type' | 'perks' | 'level'>): StationPerk[] {
  const filled = (station.perks ?? []).length;
  const slot = PERK_SLOT_LEVELS[filled];
  if (slot == null || station.level < slot) return [];
  return perksForStationType(station.type).filter((p) => !(station.perks ?? []).includes(p.id));
}

// ── Mutual Aid partner-station discount (v0.22.2) ───────────────────────────
// Building a station of ANOTHER department (a partner station) gets cheaper as
// the commander's level grows — cross-service play is a strategic mid-game
// choice instead of a flat full-price wall. Your own department's stations are
// never discounted by this.

export const PARTNER_STATION_DISCOUNT_TIERS: { minLevel: number; discount: number }[] = [
  { minLevel: 1, discount: 0 },    // branch out early → pay full price
  { minLevel: 5, discount: 0.1 },   // -10% as the city grows
  { minLevel: 10, discount: 0.2 },  // -20% mid-command
  { minLevel: 15, discount: 0.35 }, // -35% seasoned chief
  { minLevel: 20, discount: 0.5 },  // -50% at max level
];

/** Discount fraction (0..0.5) for building a PARTNER station at this level. */
export function partnerStationDiscountForLevel(level: number): number {
  let discount = 0;
  for (const tier of PARTNER_STATION_DISCOUNT_TIERS) {
    if (level >= tier.minLevel) discount = tier.discount;
  }
  return discount;
}

/** Coverage radius after the +radius perk (applied at pick AND at upgrade so
 * the bonus survives level-ups that otherwise overwrite coverageRadius). */
export function perkAdjustedRadius(baseRadius: number, station: Pick<Station, 'perks'>): number {
  const hasRadius = (station.perks ?? []).some((id) => perkById(id)?.kind === 'radius');
  return hasRadius ? Math.round(baseRadius * (1 + 0.15)) : Math.round(baseRadius);
}

const REWARD_PERK_BY_SERVICE: Record<string, string> = {
  fire: 'fire_suppression',
  police: 'patrol_presence',
  ems: 'community_care',
};

/**
 * Aggregate reward multiplier from station perks for the units that cleared a
 * mission: +10% per station that owns its service's reward perk. Pure — the
 * call site resolves unit → station. Falls back to 1 when no stations/units.
 */
export function stationRewardMultiplier(
  stations: Pick<Station, 'id' | 'perks'>[],
  assignedUnitIds: string[],
  unitStationIds: Record<string, string>,
  category: Mission['category'],
): number {
  const service =
    category === 'fire' || category === 'rescue' || category === 'hazmat'
      ? 'fire'
      : category === 'ems'
        ? 'ems'
        : 'police';
  const perkId = REWARD_PERK_BY_SERVICE[service];
  if (!perkId) return 1;

  const owningStationIds = new Set(
    stations.filter((s) => hasPerk(s, perkId)).map((s) => s.id),
  );
  if (owningStationIds.size === 0) return 1;

  const involved = assignedUnitIds.filter((uid) => {
    const sid = unitStationIds[uid];
    return sid != null && owningStationIds.has(sid);
  });
  if (involved.length === 0) return 1;

  // +10% if any involved station owns the perk; cap at +30% for a mixed fleet.
  return 1 + Math.min(0.3, involved.length * 0.1);
}
