// ============================================
// Dispatch HQ — Career Ranks
// ============================================
// A service-aware rank ladder (Rookie → Chief) mapped from player level.
// Pure mapping — no state. Rank titles are per-service where defined;
// rank also carries a reward bonus that multiplies mission payouts.

import type { ServiceType } from '../types/station';

export interface Rank {
  id: string;
  minLevel: number;
  title: string;
  serviceTitles: Partial<Record<ServiceType, string>>;
  /** XP/credit multiplier at this rank (1.0 → 1.3). */
  rewardBonus: number;
  icon: string;
}

export const RANKS: Rank[] = [
  { id: 'rookie',     minLevel: 1,  title: 'Rookie',        serviceTitles: { police: 'Rookie Officer',        fire: 'Probationary Firefighter', ems: 'Probationary EMT' },  rewardBonus: 1.0,  icon: '🌱' },
  { id: 'officer',    minLevel: 3,  title: 'Officer',       serviceTitles: { police: 'Police Officer',       fire: 'Firefighter',             ems: 'EMT' },            rewardBonus: 1.05, icon: '🚔' },
  { id: 'sergeant',   minLevel: 6,  title: 'Sergeant',      serviceTitles: { police: 'Sergeant',            fire: 'Engine Lieutenant',       ems: 'Paramedic' },      rewardBonus: 1.1,  icon: '🎖️' },
  { id: 'lieutenant', minLevel: 9,  title: 'Lieutenant',    serviceTitles: { police: 'Lieutenant',          fire: 'Battalion Chief',        ems: 'Field Supervisor' }, rewardBonus: 1.15, icon: '⭐' },
  { id: 'captain',    minLevel: 12, title: 'Captain',       serviceTitles: { police: 'Captain',             fire: 'Assistant Chief',        ems: 'Operations Manager' }, rewardBonus: 1.2, icon: '🎖️' },
  { id: 'chief',      minLevel: 15, title: 'Chief',         serviceTitles: { police: 'Police Chief',        fire: 'Fire Chief',             ems: 'EMS Director' },    rewardBonus: 1.3,  icon: '👑' },
  { id: 'deputy_chief', minLevel: 16, title: 'Deputy Chief', serviceTitles: { police: 'Deputy Chief',       fire: 'Deputy Fire Chief',      ems: 'EMS Coordinator' }, rewardBonus: 1.35, icon: '⭐' },
  { id: 'commissioner', minLevel: 20, title: 'Commissioner', serviceTitles: { police: 'Police Commissioner', fire: 'Fire Commissioner',      ems: 'Health Commissioner' }, rewardBonus: 1.4, icon: '🏛️' },
];

export function rankForLevel(level: number, service?: ServiceType): Rank {
  let best = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) best = r;
  if (service && best.serviceTitles[service]) return { ...best, title: best.serviceTitles[service]! };
  return best;
}

export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.minLevel > level) ?? null;
}
