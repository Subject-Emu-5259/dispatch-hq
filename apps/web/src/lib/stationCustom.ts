// ============================================
// Dispatch HQ — Station Customization (Batch 3d)
// ============================================
// Extends LiveryPicker (units) to stations: a paint scheme (per-service
// liveries, same catalog units use) + a patch + the station's own name.
// Pure cosmetic — rides the save blob on the station record.

import type { ServiceType, StationType } from '@dispatch-hq/shared';

export interface StationPatch {
  id: string;
  name: string;
  icon: string;
}

export const STATION_PATCHES: StationPatch[] = [
  { id: 'shield', name: 'Shield', icon: '🛡️' },
  { id: 'star', name: 'Star', icon: '⭐' },
  { id: 'flame', name: 'Flame', icon: '🔥' },
  { id: 'cross', name: 'Cross', icon: '✚' },
  { id: 'badge', name: 'Badge', icon: '🎖️' },
];

export function patchFor(patchId: string | undefined): StationPatch {
  return STATION_PATCHES.find((p) => p.id === patchId) ?? STATION_PATCHES[0];
}

export function serviceForStationType(type: StationType): ServiceType {
  if (type === 'police_station') return 'police';
  if (type === 'ems_station') return 'ems';
  // Correction build: trooper/sheriff stations are law-enforcement agencies.
  if (type === 'trooper_station') return 'police';
  if (type === 'sheriff_station') return 'police';
  return 'fire';
}
