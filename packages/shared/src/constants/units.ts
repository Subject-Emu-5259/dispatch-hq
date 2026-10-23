// ============================================
// Dispatch HQ — Unit Constants
// ============================================

import type { UnitConfig } from '../types/unit';
import type { ServiceType } from '../types/station';

// Ceiling the UI quotes for unit speed. The raw config speed (m/s → ~25–40 mph)
// understates real in-game travel: movement scales with the game-speed setting
// and response-speed tech (up to ~3.3×), so units genuinely hit 110–135 mph.
// 150 is the single cap shown everywhere — comfortably above anything the
// simulation produces.
export const MAX_UNIT_SPEED_MPH = 150;

export const UNIT_CONFIGS: Record<string, UnitConfig> = {
  // Fire units
  engine: {
    type: 'engine',
    name: 'Fire Engine',
    description: 'Standard fire truck with pump and water tank',
    icon: '🚒',
    speed: 13.9,
    capacity: 4,
    cost: 1500,
    unlockLevel: 1,
    trainingTime: 300,
  },
  ladder: {
    type: 'ladder',
    name: 'Ladder Truck',
    description: 'Extended ladder for high-rise rescue',
    icon: '🪜',
    speed: 11.1,
    capacity: 3,
    cost: 3000,
    unlockLevel: 3,
    trainingTime: 600,
  },
  rescue: {
    type: 'rescue',
    name: 'Rescue Truck',
    description: 'Specialized rescue equipment',
    icon: '🚑',
    speed: 13.9,
    capacity: 3,
    cost: 2500,
    unlockLevel: 5,
    trainingTime: 450,
  },
  battalion_chief: {
    type: 'battalion_chief',
    name: 'Battalion Chief',
    description: 'Command vehicle for large incidents',
    icon: '🚙',
    speed: 16.7,
    capacity: 1,
    cost: 5000,
    unlockLevel: 8,
    trainingTime: 900,
  },
  // Police units
  patrol_car: {
    type: 'patrol_car',
    name: 'Patrol Car',
    description: 'Standard police patrol vehicle',
    icon: '🚔',
    speed: 15.3,
    capacity: 2,
    cost: 1200,
    unlockLevel: 1,
    trainingTime: 200,
  },
  swat_van: {
    type: 'swat_van',
    name: 'SWAT Van',
    description: 'Tactical armored vehicle',
    icon: '🚐',
    speed: 12.5,
    capacity: 8,
    cost: 4000,
    unlockLevel: 5,
    trainingTime: 600,
  },
  k9_unit: {
    type: 'k9_unit',
    name: 'K-9 Unit',
    description: 'Police dog unit for tracking',
    icon: '🐕',
    speed: 13.9,
    capacity: 1,
    cost: 2000,
    unlockLevel: 3,
    trainingTime: 400,
  },
  police_suv: {
    type: 'police_suv',
    name: 'Police SUV',
    description: 'Fast pursuit vehicle',
    icon: '🚓',
    speed: 18.1,
    capacity: 2,
    cost: 2500,
    unlockLevel: 4,
    trainingTime: 350,
  },
  // EMS units
  ambulance: {
    type: 'ambulance',
    name: 'Ambulance',
    description: 'Patient transport and basic life support',
    icon: '🚑',
    speed: 13.9,
    capacity: 2,
    cost: 1800,
    unlockLevel: 1,
    trainingTime: 250,
  },
  paramedic_unit: {
    type: 'paramedic_unit',
    name: 'Paramedic Unit',
    description: 'Advanced life support vehicle',
    icon: '🏥',
    speed: 14.4,
    capacity: 2,
    cost: 2500,
    unlockLevel: 3,
    trainingTime: 500,
  },
  ems_supervisor: {
    type: 'ems_supervisor',
    name: 'EMS Supervisor',
    description: 'Command vehicle for EMS incidents',
    icon: '🚐',
    speed: 15.3,
    capacity: 1,
    cost: 3500,
    unlockLevel: 5,
    trainingTime: 600,
  },
  fire_ambulance: {
    type: 'fire_ambulance',
    name: 'Fire Rescue Ambulance',
    description: 'Combined fire/EMS rescue vehicle',
    icon: '🚑',
    speed: 14.4,
    capacity: 3,
    cost: 3000,
    unlockLevel: 4,
    trainingTime: 450,
  },
};

// ── Unit liveries (v0.15.0) — per-service paint schemes ──
// Purely cosmetic: rendered on map markers + unit cards. `markerColor` is the
// puck color; `swatch` is the CSS gradient shown in the picker.
export interface Livery {
  id: string;
  name: string;
  markerColor: string;
  swatch: string[];
}

export const LIVERIES: Record<ServiceType, Livery[]> = {
  police: [
    { id: 'black-white', name: 'Black & White', markerColor: '#1F2937', swatch: ['#111827', '#F9FAFB'] },
    { id: 'midnight', name: 'Midnight', markerColor: '#1E3A8A', swatch: ['#0F172A', '#1E3A8A'] },
    { id: 'county', name: 'County', markerColor: '#7C3AED', swatch: ['#6B21A8', '#FDE68A'] },
  ],
  fire: [
    { id: 'classic-red', name: 'Classic Red', markerColor: '#DC2626', swatch: ['#991B1B', '#F87171'] },
    { id: 'lime', name: 'Lime', markerColor: '#65A30D', swatch: ['#3F6212', '#BEF264'] },
    { id: 'blackout', name: 'Blackout', markerColor: '#27272A', swatch: ['#09090B', '#52525B'] },
  ],
  ems: [
    { id: 'rescue-white', name: 'Rescue White', markerColor: '#E5E7EB', swatch: ['#F9FAFB', '#9CA3AF'] },
    { id: 'ambulance-yellow', name: 'Ambulance Yellow', markerColor: '#CA8A04', swatch: ['#854D0E', '#FDE047'] },
    { id: 'night', name: 'Night', markerColor: '#0E7490', swatch: ['#164E63', '#67E8F9'] },
  ],
};

/** Resolve a livery by id with fallback to the service default. */
export function liveryFor(service: ServiceType, id?: string | null): Livery {
  const list = LIVERIES[service] ?? [];
  if (list.length === 0) {
    return { id: 'default', name: 'Standard', markerColor: '#6B7280', swatch: ['#4B5563', '#9CA3AF'] };
  }
  return list.find((l) => l.id === id) ?? list[0];
}
