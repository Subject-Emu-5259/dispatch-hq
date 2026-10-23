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
};

/** Department a station type belongs to (fire_station → fire, etc.). */
export function stationServiceFor(stationType: string): 'fire' | 'police' | 'ems' {
  if (stationType === 'fire_station') return 'fire';
  if (stationType === 'ems_station') return 'ems';
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
