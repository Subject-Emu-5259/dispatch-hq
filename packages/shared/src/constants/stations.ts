// ============================================
// Dispatch HQ — Station Constants
// ============================================

import { StationConfig, StationLevel } from '../types/station';

export const STATION_CONFIGS: Record<string, StationConfig> = {
  fire_station: {
    type: 'fire_station',
    name: 'Fire Station',
    description: 'Houses fire trucks and emergency vehicles',
    icon: '🚒',
    color: '#DC2626',
    baseCost: 5000,
    baseCapacity: 3,
    maxLevel: 5,
  },
  police_station: {
    type: 'police_station',
    name: 'Police Station',
    description: 'Houses patrol cars and tactical units',
    icon: '🏢',
    color: '#2563EB',
    baseCost: 4000,
    baseCapacity: 4,
    maxLevel: 5,
  },
  ems_station: {
    type: 'ems_station',
    name: 'EMS Station',
    description: 'Houses ambulances and paramedic units',
    icon: '🏥',
    color: '#16A34A',
    baseCost: 4500,
    baseCapacity: 4,
    maxLevel: 5,
  },
  // Correction build: troopers and sheriffs are their own agencies, NOT city
  // police — each gets its own station type with an exclusive buy list (see
  // lib/unitPurchase STATION_UNITS). Costs/capacity follow the existing
  // station patterns (police 4000/4, fire 5000/3, ems 4500/4, all maxLevel 5);
  // no level gate exists for building stations, so none is added here.
  trooper_station: {
    type: 'trooper_station',
    name: 'State Trooper Post',
    description: 'State highway patrol post — houses trooper cars',
    icon: '🛣️',
    color: '#1E40AF',
    baseCost: 4500,
    baseCapacity: 3,
    maxLevel: 5,
  },
  sheriff_station: {
    type: 'sheriff_station',
    name: "County Sheriff's Office",
    description: "County sheriff's office — houses deputy cars",
    icon: '⭐',
    color: '#B45309',
    baseCost: 4000,
    baseCapacity: 4,
    maxLevel: 5,
  },
};

/** Department a station type belongs to (fire_station → fire, etc.). Trooper
 *  and sheriff stations are law-enforcement agencies, so they map to the
 *  police service family — agency separation lives in the station type, its
 *  exclusive buy list, and the unit jurisdiction, not in a new service. */
export function stationServiceFor(stationType: string): 'fire' | 'police' | 'ems' {
  if (stationType === 'fire_station') return 'fire';
  if (stationType === 'ems_station') return 'ems';
  if (stationType === 'trooper_station') return 'police';
  if (stationType === 'sheriff_station') return 'police';
  return 'police';
}

export const STATION_LEVELS: StationLevel[] = [
  { level: 1, cost: 0, capacity: 3, coverageRadius: 1000 },
  { level: 2, cost: 12500, capacity: 5, coverageRadius: 1500 },
  { level: 3, cost: 31250, capacity: 8, coverageRadius: 2000 },
  { level: 4, cost: 78125, capacity: 12, coverageRadius: 2500 },
  { level: 5, cost: 195312, capacity: 18, coverageRadius: 3500 },
];

// ── Station themes (v0.15.0) — cosmetic identity presets ──
export interface StationTheme {
  id: string;
  name: string;
  markerColor: string;
  accent: string; // tailwind-ish accent used on cards/panels
}

export const STATION_THEMES: StationTheme[] = [
  { id: 'urban', name: 'Urban', markerColor: '#1F2937', accent: '#60A5FA' },
  { id: 'suburban', name: 'Suburban', markerColor: '#7C3AED', accent: '#C084FC' },
  { id: 'county', name: 'County', markerColor: '#B45309', accent: '#FBBF24' },
];

export function stationThemeFor(themeId?: string | null): StationTheme {
  return STATION_THEMES.find((t) => t.id === themeId) ?? STATION_THEMES[0];
}
