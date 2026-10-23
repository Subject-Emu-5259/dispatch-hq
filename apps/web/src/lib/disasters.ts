// ============================================
// Dispatch HQ — Disaster Events
// ============================================
// City-wide emergencies (tornado / flood / wildfire) that spawn a wave of
// zone-targeted missions and pay a completion bonus. Frequency is player-tuned
// via the disasterFrequency setting (off / rare / normal / frequent) so they
// stay dramatic instead of routine, with a hard cooldown between events.

import type { GeoPoint, ServiceType, MissionTemplate } from '@dispatch-hq/shared';
import { getMissionsForService, difficultyTierFor, RECOVERY_TEMPLATES } from '@dispatch-hq/shared';
import type { CityZone } from '@/lib/patrol/patrolZones';
import type { DisasterFrequency } from '@/utils/settings';

export interface DisasterDefinition {
  id: string;
  name: string;
  icon: string;
  durationSec: number;
  zoneDirection: CityZone['direction'];
  /** Mission wave templates — resolved against the real template pools. */
  templates: { templateId: string; service: ServiceType }[];
  completionBonus: { credits: number; xp: number };
}

export interface ActiveDisaster {
  id: string;
  name: string;
  icon: string;
  startedAt: number;
  endsAt: number;
  /** Missions spawned by this disaster. */
  spawned: number;
  /** Missions spawned by this disaster that were completed. */
  completed: number;
  /** Center of the affected zone — recovery calls spawn near it. */
  zone?: GeoPoint;
  /** 'active' while the emergency window runs; 'aftermath' during recovery. */
  phase?: 'active' | 'aftermath';
  /** When the recovery phase ends and the disaster record clears. */
  aftermathEndsAt?: number;
  /** Recovery missions spawned / completed during the aftermath phase. */
  recoverySpawned?: number;
  recoveryCompleted?: number;
}

/** A restoration call rolled out during the aftermath phase (one per service). */
export interface RecoveryWaveItem {
  templateId: string;
  service: ServiceType;
}

/** The recovery wave: damage assessment, displaced residents, debris clearing. */
export const RECOVERY_WAVE: RecoveryWaveItem[] = [
  { templateId: 'recovery_assessment', service: 'police' },
  { templateId: 'recovery_relocation', service: 'ems' },
  { templateId: 'recovery_debris', service: 'fire' },
];

/** How long the RECOVERY banner window stays up after a disaster is contained. */
export const AFTERMATH_WINDOW_MS = 2 * 60 * 1000;
/** Stagger between recovery calls so restoration feels organic, not instant. */
export const AFTERMATH_SPAWN_GAP_MS = 20 * 1000;

export const DISASTER_DEFINITIONS: DisasterDefinition[] = [
  {
    id: 'tornado',
    name: 'Tornado Warning',
    icon: '🌪️',
    durationSec: 180,
    zoneDirection: 'central',
    templates: [
      { templateId: 'room_fire', service: 'fire' },
      { templateId: 'building_collapse', service: 'fire' },
      { templateId: 'car_crash_injury', service: 'ems' },
    ],
    completionBonus: { credits: 1500, xp: 400 },
  },
  {
    id: 'flood',
    name: 'Flash Flood',
    icon: '🌊',
    durationSec: 240,
    zoneDirection: 'south',
    templates: [
      { templateId: 'car_crash_injury', service: 'ems' },
      { templateId: 'medical_call', service: 'ems' },
      { templateId: 'fall_rescue', service: 'fire' },
    ],
    completionBonus: { credits: 1200, xp: 350 },
  },
  {
    id: 'wildfire',
    name: 'Wildfire Outbreak',
    icon: '🔥',
    durationSec: 300,
    zoneDirection: 'north',
    templates: [
      { templateId: 'wildfire', service: 'fire' },
      { templateId: 'room_fire', service: 'fire' },
      { templateId: 'medical_call', service: 'ems' },
    ],
    completionBonus: { credits: 1800, xp: 500 },
  },
];

// Frequency tuning: how often and how easily disasters roll in.
const FREQUENCY_TUNING: Record<DisasterFrequency, { cooldownMs: number; chancePerLevel: number; maxChance: number }> = {
  off:      { cooldownMs: Infinity, chancePerLevel: 0, maxChance: 0 },
  rare:     { cooldownMs: 15 * 60 * 1000, chancePerLevel: 0.01, maxChance: 0.12 },
  normal:   { cooldownMs: 10 * 60 * 1000, chancePerLevel: 0.015, maxChance: 0.2 },
  frequent: { cooldownMs: 6 * 60 * 1000, chancePerLevel: 0.025, maxChance: 0.3 },
};

// Module-level cooldown so a reload doesn't reset the timer; also prevents
// back-to-back events when the player stays in one session.
let lastTriggerAt = 0;

/** Test-only: clear the module cooldown so tests can roll repeatedly. */
export function resetDisasterCooldown(): void {
  lastTriggerAt = 0;
}

/**
 * Roll for a disaster. Returns null when one is active, when the frequency
 * setting is 'off', during the cooldown window, or when the roll misses.
 * Chance scales with player level and is capped per frequency tier, so early
 * games stay calm and disasters never become the norm.
 */
export function maybeTriggerDisaster(
  level: number,
  active: ActiveDisaster | null,
  frequency: DisasterFrequency,
): DisasterDefinition | null {
  if (active) return null;
  const tuning = FREQUENCY_TUNING[frequency];
  if (tuning.chancePerLevel <= 0) return null;
  if (Date.now() - lastTriggerAt < tuning.cooldownMs) return null;

  const chance = Math.min(tuning.maxChance, level * tuning.chancePerLevel);
  if (Math.random() > chance) return null;

  lastTriggerAt = Date.now();
  const roll = Math.random();
  return DISASTER_DEFINITIONS[Math.min(DISASTER_DEFINITIONS.length - 1, Math.floor(roll * DISASTER_DEFINITIONS.length))];
}

/** Pick the disaster's target zone by direction, falling back to the first zone. */
export function pickDisasterZone(def: DisasterDefinition, zones: CityZone[]): CityZone | null {
  return zones.find((z) => z.direction === def.zoneDirection && z.covered !== false)
    ?? zones.find((z) => z.covered !== false)
    ?? zones[0]
    ?? null;
}

/** 0..1 progress through a disaster's window. */
export function disasterProgress(d: ActiveDisaster): number {
  const total = d.endsAt - d.startedAt;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (d.endsAt - Date.now()) / total));
}

/** 0..1 recovery progress through the aftermath wave (completions / spawns). */
export function aftermathProgress(d: ActiveDisaster): number {
  const spawned = d.recoverySpawned ?? 0;
  if (spawned <= 0) return 0;
  return Math.max(0, Math.min(1, (d.recoveryCompleted ?? 0) / spawned));
}

// ── Wave adaptation (single-service cities) ────────────────────────────────
// Disasters and aftermath recovery roll city-wide waves that mix services. In
// a city running ONE department, cross-service calls are only answerable once
// the player raises a partner station (see BuildStationModal). adaptWaveToService
// keeps those calls when a partner station exists (real Mutual Aid, +25%) and
// otherwise swaps them for a comparable call of the player's own department so
// the crisis keeps its intensity instead of piling up calls that just expire.

/** A wave entry — a template id plus the department the call belongs to. */
export interface WaveTemplateRef {
  templateId: string;
  service: ServiceType;
}

/** Station type → department (mirrors employees.serviceForStation). */
function stationServiceFor(stationType: string): ServiceType {
  if (stationType === 'fire_station') return 'fire';
  if (stationType === 'ems_station') return 'ems';
  return 'police';
}

const ALL_WAVE_TEMPLATES: MissionTemplate[] = [
  ...getMissionsForService('fire'),
  ...getMissionsForService('police'),
  ...getMissionsForService('ems'),
  ...RECOVERY_TEMPLATES,
];

function waveTemplateById(templateId: string): MissionTemplate | undefined {
  return ALL_WAVE_TEMPLATES.find((t) => t.id === templateId);
}

/** Pick a same-service template in the same difficulty tier as the original. */
function sameTierReplacement(service: ServiceType, original: WaveTemplateRef, random: () => number): WaveTemplateRef {
  const orig = waveTemplateById(original.templateId);
  const tier = difficultyTierFor(orig?.difficulty ?? 2);
  const pool = getMissionsForService(service);
  const inTier = pool.filter((t) => difficultyTierFor(t.difficulty) === tier);
  const candidates = inTier.length > 0 ? inTier : pool;
  const t = candidates[Math.floor(random() * candidates.length)];
  return { templateId: t.id, service };
}

/**
 * Adapt a disaster/recovery wave to the player's department. When `service` is
 * null (no single-service city) the wave passes through unchanged.
 */
export function adaptWaveToService(
  wave: readonly WaveTemplateRef[],
  service: ServiceType | null,
  stations: { type: string }[],
  random: () => number = Math.random,
): WaveTemplateRef[] {
  if (!service) return [...wave];
  const stationServices = new Set(stations.map((s) => stationServiceFor(s.type)));
  return wave.map((item) => {
    if (item.service === service) return item;
    if (stationServices.has(item.service)) return item;
    return sameTierReplacement(service, item, random);
  });
}

/**
 * Did adaptWaveToService actually swap any calls? False when the wave passed
 * through unchanged — multi-service city, no active department, or a partner
 * station already making every cross-service call answerable. Used to decide
 * whether the "wave adapted to your department" toast should appear.
 */
export function waveWasAdapted(
  original: readonly WaveTemplateRef[],
  adapted: readonly WaveTemplateRef[],
): boolean {
  if (original.length !== adapted.length) return true;
  return adapted.some((w, i) => w.service !== original[i]?.service);
}
