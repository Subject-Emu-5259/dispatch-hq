// ============================================
// Dispatch HQ — Mission Spawning Helpers
// ============================================
// Centralizes weighted template selection, crime-aware zone placement,
// road-snapping, and mission object construction.

import type { Mission, MissionTemplate, MissionCategory, GeoPoint, ServiceType } from '@dispatch-hq/shared';
import { getMissionsForService, getMissionPriority, getTrafficDutyTemplates, CHAIN_DEFINITIONS } from '@dispatch-hq/shared';
import type { CityData } from '@/stores/gameStore';
import { clampToBoundary, isPointInBoundary } from '@/data/cityBoundaries';
import { seasonalBoostedPick } from '@/lib/seasonal';
import { useGameStore } from '@/stores/gameStore';
import { haversineKm } from '@/utils/roadPathfinding';
import { snapPointToRoad } from '@/utils/routing';
import { patrolZonesForCity } from '@/lib/patrol/patrolZones';
import { getWeatherEffects, currentWeather } from '@/lib/weather';
import { findAnchorPoi, POI_TYPE_META, type Poi } from '@/lib/pois';
import { adaptAirliftTemplate, emsAirliftEligible } from '@/lib/cpuMutualAid';
import { getCityTrait } from '@/lib/cityTraits';
import type { Unit } from '@dispatch-hq/shared';

export interface MissionZone {
  name: string;
  center: { lat: number; lng: number };
  radiusKm: number;
  weights: Record<'fire' | 'police' | 'ems', number>;
  tags: string[];
}

/** Mission templates include a spawn rarity weight. Severe calls should be rare;
 * routine traffic/domestic/medical calls should dominate the dispatch board. */
function pickWeightedTemplate(templates: MissionTemplate[]): MissionTemplate {
  if (templates.length === 0) {
    throw new Error('pickWeightedTemplate called with empty template list');
  }
  const weights = templates.map((t) => t.spawnWeight ?? 5);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return templates[0];
  let roll = Math.random() * total;
  const pick = templates.find((t, i) => {
    roll -= weights[i];
    return roll <= 0;
  });
  return pick ?? templates[0];
}

export function pickRandomMissionTemplate(service: ServiceType, _level = 1): MissionTemplate {
  return pickWeightedTemplate(getMissionsForService(service));
}

/**
 * Variety guard (v0.22.18): when the weighted pick lands on a template used in
 * a RECENT organic spawn, re-roll from the rest of the pool so the same callout
 * never respawns back-to-back — the dispatch board reads as a living city, not
 * a repeating carousel. Keeps a minimum candidate pool so a small city never
 * starves; forced templates (chains, traffic duties, aftermath waves) bypass it.
 */
export function avoidRecentTemplate(
  current: MissionTemplate,
  recentIds: readonly string[],
  all: MissionTemplate[],
  minPool = 3,
): MissionTemplate {
  if (recentIds.length === 0 || !recentIds.includes(current.id)) return current;
  const candidates = all.filter((t) => !recentIds.includes(t.id));
  if (candidates.length < minPool) return current;
  return pickWeightedTemplate(candidates);
}

/** Rolling record of recently spawned template ids (oldest dropped first). */
export function pushRecentTemplate(recent: string[], id: string, window = 6): string[] {
  const next = [...recent.filter((x) => x !== id), id];
  return next.slice(-window);
}

/** Per-service rolling memory of recently spawned templates (module state). */
const recentTemplatesByService: Record<string, string[]> = {};

/**
 * Active-mission ceiling for the spawn loop (v0.18.0, extracted for testing).
 * The player's chosen max (Settings: 4–15) gets a little headroom as they
 * level up, clamped to the same 4–15 band so a low level can never be flooded
 * and a high level never deadens the board.
 */
export function activeMissionCap(level: number, baseMax: number): number {
  return Math.min(15, Math.max(4, baseMax) + Math.min(5, level));
}

/** Compute a sensible city radius from bounds. */
export function getCityRadiusKm(input?: [[number, number], [number, number]] | CityData | null): number {
  const bounds = input && 'bounds' in (input as any) ? (input as any).bounds : input;
  if (Array.isArray(bounds) && bounds.length === 2) {
    const width = haversineKm({ lat: bounds[0][0], lng: bounds[0][1] }, { lat: bounds[0][0], lng: bounds[1][1] });
    const height = haversineKm({ lat: bounds[0][0], lng: bounds[0][1] }, { lat: bounds[1][0], lng: bounds[0][1] });
    return Math.max(2, Math.min(15, Math.max(width, height) / 2));
  }
  return 8;
}

/** Build deterministic city zones around a center so missions spread logically. */
export function getCityZones(lat: number, lng: number, radiusKm: number): MissionZone[] {
  const latPerKm = 1 / 111;
  const lngPerKm = 1 / (111 * Math.cos(lat * Math.PI / 180));
  return [
    {
      name: 'Downtown',
      center: { lat, lng },
      radiusKm: radiusKm * 0.35,
      weights: { fire: 0.9, police: 1.4, ems: 1.1 },
      tags: ['commercial', 'retail', 'bank', 'high_rise', 'public', 'road', 'intersection'],
    },
    {
      name: 'Industrial District',
      center: { lat: lat + radiusKm * 0.005 * latPerKm * 0.8, lng: lng - radiusKm * 0.005 * lngPerKm },
      radiusKm: radiusKm * 0.35,
      weights: { fire: 1.6, police: 0.7, ems: 0.6 },
      tags: ['industrial', 'cargo_port', 'warehouse', 'factory', 'road'],
    },
    {
      name: 'Westside',
      center: { lat, lng: lng - radiusKm * 0.7 * lngPerKm },
      radiusKm: radiusKm * 0.45,
      weights: { fire: 0.8, police: 1.2, ems: 1.0 },
      tags: ['residential', 'school', 'road'],
    },
    {
      name: 'Eastside',
      center: { lat, lng: lng + radiusKm * 0.7 * lngPerKm },
      radiusKm: radiusKm * 0.45,
      weights: { fire: 0.9, police: 1.3, ems: 0.9 },
      tags: ['residential', 'school', 'park', 'road'],
    },
    {
      name: 'North Hills',
      center: { lat: lat + radiusKm * 0.7 * latPerKm, lng },
      radiusKm: radiusKm * 0.5,
      weights: { fire: 1.1, police: 0.8, ems: 1.2 },
      tags: ['residential', 'park', 'forest', 'road'],
    },
    {
      name: 'Southside',
      center: { lat: lat - radiusKm * 0.7 * latPerKm, lng },
      radiusKm: radiusKm * 0.5,
      weights: { fire: 1.0, police: 1.5, ems: 1.1 },
      tags: ['residential', 'school', 'park', 'road'],
    },
  ];
}

/** Half-diagonal of a bounds-aligned zone in km (used to size spawn disks). */
function zoneRadiusKm(z: { bounds: { latMin: number; latMax: number; lngMin: number; lngMax: number } }): number {
  const midLat = (z.bounds.latMin + z.bounds.latMax) / 2;
  const dLatKm = (z.bounds.latMax - z.bounds.latMin) * 111;
  const dLngKm = (z.bounds.lngMax - z.bounds.lngMin) * 111 * Math.cos((midLat * Math.PI) / 180);
  return Math.max(0.4, Math.sqrt(dLatKm * dLatKm + dLngKm * dLngKm) / 2);
}

// Per-neighborhood flavor for the bounds-aligned grid: service preferences and
// typical POI tags keep placement variety (police-heavy south/west, industrial
// southeast, parks & schools north) while staying inside the city footprint.
const GRID_ZONE_FLAVOR: Record<string, { weights: Record<'fire' | 'police' | 'ems', number>; tags: string[] }> = {
  central:    { weights: { fire: 0.9,  police: 1.4, ems: 1.1 }, tags: ['commercial', 'retail', 'public', 'road'] },
  west:       { weights: { fire: 0.8,  police: 1.2, ems: 1.0 }, tags: ['residential', 'school', 'road'] },
  east:       { weights: { fire: 0.9,  police: 1.3, ems: 0.9 }, tags: ['residential', 'school', 'park', 'road'] },
  north:      { weights: { fire: 1.1,  police: 0.8, ems: 1.2 }, tags: ['residential', 'park', 'road'] },
  south:      { weights: { fire: 1.0,  police: 1.5, ems: 1.1 }, tags: ['residential', 'school', 'park', 'road'] },
  northeast:  { weights: { fire: 1.1,  police: 0.9, ems: 1.2 }, tags: ['residential', 'park', 'road'] },
  northwest:  { weights: { fire: 1.2,  police: 0.9, ems: 0.9 }, tags: ['industrial', 'warehouse', 'road'] },
  southeast:  { weights: { fire: 1.5,  police: 0.9, ems: 0.8 }, tags: ['industrial', 'warehouse', 'factory', 'road'] },
  southwest:  { weights: { fire: 0.9,  police: 1.3, ems: 0.9 }, tags: ['residential', 'school', 'road'] },
};

/**
 * Mission spawn zones. When precise city bounds exist, neighborhoods align to
 * the same grid the map draws (Downtown center, Westside west, Southside south…)
 * so calls land on the correct side of town — never spilling past city limits.
 * Falls back to legacy center+radius circles for unknown geometry.
 */
function missionZonesForCity(city: CityData | null, center: GeoPoint, radiusKm: number): MissionZone[] {
  const bounds = city?.bounds ?? null;
  if (bounds && Array.isArray(bounds) && bounds.length === 2) {
    return patrolZonesForCity({ bounds, boundary: city?.boundary ?? null })
      .filter((z) => z.covered !== false)
      .map((z) => {
        const flavor = GRID_ZONE_FLAVOR[z.direction] ?? GRID_ZONE_FLAVOR.central;
        return {
          name: z.name,
          center: z.center,
          radiusKm: zoneRadiusKm(z),
          weights: { ...flavor.weights },
          tags: [...flavor.tags],
        };
      });
  }
  return getCityZones(center.lat, center.lng, radiusKm);
}

/**
 * Attach a suspect from the records pool to a law-enforcement call so clearing
 * the scene can flow into an arrest/booking. Runs inside buildMission for every
 * police/traffic mission (incl. traffic duties and Aftermath follow-ups).
 */
export function attachSuspectToMission(mission: Pick<Mission, 'id' | 'category'>): void {
  if (mission.category !== 'police' && mission.category !== 'traffic') return;
  const st = useGameStore.getState();
  const pool = st.criminalRecords.filter((r) => !r.missionId);
  if (pool.length === 0) return;
  const rec = pool[Math.floor(Math.random() * pool.length)];
  st.linkCriminalRecordToMission(rec.id, mission.id);
  st.updateCriminalRecord(rec.id, { warrantStatus: 'active' });
}

function clampLocationToBounds(point: GeoPoint, bounds?: [[number, number], [number, number]] | null): GeoPoint {
  if (!bounds) return point;
  const [[latMin, lngMin], [latMax, lngMax]] = bounds;
  const marginLat = (latMax - latMin) * 0.02;
  const marginLng = (lngMax - lngMin) * 0.02;
  return {
    lat: Math.max(latMin + marginLat, Math.min(latMax - marginLat, point.lat)),
    lng: Math.max(lngMin + marginLng, Math.min(lngMax - marginLng, point.lng)),
  };
}

function chooseZone(zones: MissionZone[], service: ServiceType, poiTypes: string[] = [], roadBias = 1): MissionZone {
  const wantRoad = poiTypes.some((t) => ['road', 'highway', 'intersection'].includes(t));
  const weights = zones.map((z) => {
    let w = z.weights[service] ?? 1;
    const tagMatch = poiTypes.some((t) => z.tags.includes(t));
    if (tagMatch) w *= 3;
    if (wantRoad && z.tags.includes('road')) w *= 1.4 * roadBias;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  const picked = zones.find((z, i) => {
    roll -= weights[i];
    return roll <= 0;
  });
  return picked ?? zones[0];
}

/** Generate a random point inside a disk. Uses polar coordinate with sqrt(r) for uniform spread. */
function randomPointInDisk(center: GeoPoint, radiusKm: number): GeoPoint {
  const rFactor = Math.sqrt(Math.random());
  const r = (rFactor * radiusKm) / 111;
  const theta = Math.random() * Math.PI * 2;
  const latPerKm = 1 / 111;
  const lngPerKm = 1 / (111 * Math.cos(center.lat * Math.PI / 180));
  return {
    lat: center.lat + r * Math.cos(theta) * latPerKm * 111,
    lng: center.lng + r * Math.sin(theta) * lngPerKm * 111,
  };
}

function randomPointInZone(zone: MissionZone, wantRoad: boolean, origin?: GeoPoint | null): GeoPoint {
  const center = origin ?? zone.center;
  const radiusKm = origin ? Math.min(zone.radiusKm * 0.35, 2) : zone.radiusKm;

  // Road calls cluster toward the forward direction so they don't teleport behind patrol units.
  if (wantRoad && origin) {
    const r = (0.2 + Math.random() * 0.6) * radiusKm;
    const theta = Math.random() * Math.PI * 2;
    const latPerKm = 1 / 111;
    const lngPerKm = 1 / (111 * Math.cos(center.lat * Math.PI / 180));
    return {
      lat: center.lat + r * Math.cos(theta) * latPerKm * 111,
      lng: center.lng + r * Math.sin(theta) * lngPerKm * 111,
    };
  }

  return randomPointInDisk(center, radiusKm);
}

function sampleInsideBoundary(
  bounds: [[number, number], [number, number]] | null,
  boundary: GeoPoint[][] | undefined,
  generator: () => GeoPoint,
  maxAttempts = 40,
): GeoPoint {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generator();
    const clamped = bounds ? clampLocationToBounds(candidate, bounds) : candidate;
    if (!boundary || isPointInBoundary(clamped, boundary)) return clamped;
  }
  // Final fallback: clamp toward inside using the boundary geometry.
  return boundary ? clampToBoundary(generator(), boundary, 60) : generator();
}

/** Pick a location that makes sense for the incident type and stay strictly inside city limits.
 *  Each attempt draws a fresh candidate inside the precise boundary, then snaps it to the
 *  nearest drivable road. Snaps are rejected if they leave the city or jump more than 500 m,
 *  which keeps markers off water, forest, and the far side of the river. */
export async function pickMissionLocation(
  service: ServiceType,
  poiTypes: string[] = [],
  city?: CityData | null,
  origin?: GeoPoint | null,
): Promise<GeoPoint> {
  const bounds = city?.bounds ?? null;
  const boundary = city?.boundary ?? null;
  const cityCenter = { lat: city?.lat ?? 0, lng: city?.lng ?? 0 };
  const cityRadiusKm = origin ? 2 : Math.min(15, getCityRadiusKm(bounds));
  const center = origin ?? cityCenter;

  const zones = missionZonesForCity(city ?? null, center, cityRadiusKm);
  const wantRoad = poiTypes.some((t) => ['road', 'highway', 'intersection', 'parking'].includes(t));
  const isWater = poiTypes.some((t) => t === 'water');
  // Weather read once per location search (chooseZone runs in a loop below).
  const fx = getWeatherEffects(currentWeather());
  const roadBias = fx.roadBias;

  const inBoundary = (p: GeoPoint) => !boundary || isPointInBoundary(p, boundary);

  let bestPoint: GeoPoint | null = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 35; attempt++) {
    if (attempt > 8) zones.forEach((z) => { z.radiusKm = Math.max(0.3, z.radiusKm * 0.9); });
    if (attempt > 18) zones.forEach((z) => { z.radiusKm = Math.max(0.2, z.radiusKm * 0.85); });

    const zone = chooseZone(zones, service, poiTypes, roadBias);
    const raw = randomPointInZone(zone, wantRoad, origin);

    if (attempt > 25) {
      const t = (attempt - 25) / 10;
      raw.lat = raw.lat + (cityCenter.lat - raw.lat) * t;
      raw.lng = raw.lng + (cityCenter.lng - raw.lng) * t;
    }

    const bounded = bounds ? clampLocationToBounds(raw, bounds) : raw;
    if (boundary && !isPointInBoundary(bounded, boundary)) continue;

    if (isWater) return bounded;

    try {
      const snapped = await snapPointToRoad(bounded);
      if (snapped.lat === 0 && snapped.lng === 0) continue;
      const snapJumpKm = haversineKm(bounded, snapped);
      if (inBoundary(snapped) && snapJumpKm <= 0.5) {
        return snapped;
      }
      if (inBoundary(bounded) && snapJumpKm < bestScore) {
        bestPoint = bounded;
        bestScore = snapJumpKm;
      }
    } catch {
      if (inBoundary(bounded)) {
        const score = haversineKm(bounded, center);
        if (score < bestScore) {
          bestPoint = bounded;
          bestScore = score;
        }
      }
    }
  }

  if (!bestPoint) {
    bestPoint = boundary ? clampToBoundary(cityCenter, boundary || undefined, 100) : cityCenter;
  }

  try {
    const snapped = await snapPointToRoad(bestPoint);
    return inBoundary(snapped) && haversineKm(bestPoint, snapped) <= 0.5 ? snapped : bestPoint;
  } catch {
    return bestPoint;
  }
}

export interface BuildMissionOptions {
  level?: number;
  origin?: GeoPoint;
  prefix?: string;
  originDescription?: string;
  /** Preselect a template instead of rolling a rarity-weighted random one. */
  template?: MissionTemplate;
  /** Skip suspect attachment (callers that rewrite the mission id afterwards). */
  skipSuspect?: boolean;
}

/** Build a fully-formed mission with rarity, location, and scaling. */
function capTemplateRarity(service: ServiceType, cityName?: string | null): MissionTemplate {
  const all = getMissionsForService(service);
  const fx = getWeatherEffects(currentWeather());
  const svcMult = fx.spawnWeights[service] ?? 1;
  const waterBias = fx.waterBias;
  // City trait (v0.35.0): per-service spawn weight multiplier + category boosts
  // stack with weather on the same weight line so a storm in Paris = extreme fire risk.
  const trait = getCityTrait(cityName);
  const traitSvcMult = service === 'fire'
    ? (trait?.modifiers.fireSpawnWeight ?? 1)
    : service === 'ems'
      ? (trait?.modifiers.emsSpawnWeight ?? 1)
      : (trait?.modifiers.policeSpawnWeight ?? 1);
  const categoryBoosts = trait?.modifiers.categoryBoosts ?? {};
  // Cap high-severity weights so extreme missions stay rare but difficulty still scales normally.
  const capped = all.map((t) => {
    let maxWeight = t.spawnWeight ?? 5;
    if (t.difficulty >= 9) maxWeight = Math.min(maxWeight, 0.02);
    else if (t.difficulty >= 7) maxWeight = Math.min(maxWeight, 0.25);
    else if (t.difficulty >= 5) maxWeight = Math.min(maxWeight, 0.9);
    // Weather: storms boost rescue-class calls (the game's water rescues); the
    // per-service pool multiplier is kept for parity but selection is unchanged
    // within a single-service pool — cross-service bias lives in getAssistingServices.
    maxWeight *= svcMult;
    // City trait: service-specific spawn weight multiplier (e.g. Paris 1.4× fire)
    maxWeight *= traitSvcMult;
    // City trait: category-specific boost (e.g. fire category gets extra weight)
    const catBoost = categoryBoosts[t.category];
    if (catBoost) maxWeight *= catBoost;
    if (t.category === 'rescue') maxWeight *= waterBias;
    return { ...t, spawnWeight: maxWeight };
  });
  return pickWeightedTemplate(capped);
}

export async function buildMission(
  service: ServiceType,
  city: CityData | null,
  opts: BuildMissionOptions = {},
): Promise<Mission> {
  const level = opts.level ?? 1;
  const cityName = city?.name ?? null;
  let template = opts.template ?? capTemplateRarity(service, cityName);
  // Seasonal boost (v0.21.0): during a live holiday window, the event's boosted
  // callout types roll more often so the city matches the season (fireworks
  // fires in July, tree fires at Christmas).
  let seasonalForced = false;
  if (!opts.template) {
    const boosted = seasonalBoostedPick(getMissionsForService(service));
    if (boosted) {
      template = boosted;
      seasonalForced = true;
    }
  }
  const activeTemplates = new Set(useGameStore.getState().missions.filter((m) => m.status !== "completed" && m.status !== "failed").map((m) => m.templateId));
  for (let r = 0; r < 5 && !opts.template && template.difficulty >= 8 && activeTemplates.has(template.id); r++) {
    template = capTemplateRarity(service, cityName);
  }
  // Variety guard (v0.22.18): organic spawns avoid templates from the last few
  // spawns AND templates already live on the board (v0.22.x — a callout must
  // not stack duplicates: the same robbery twice on the board reads as a bug,
  // not a busy city). Seasonal event callouts are exempt (they are supposed to
  // repeat during the event window) and forced templates never re-roll.
  if (!opts.template && !seasonalForced) {
    const recent = recentTemplatesByService[service] ?? [];
    template = avoidRecentTemplate(template, [...recent, ...activeTemplates], getMissionsForService(service));
    recentTemplatesByService[service] = pushRecentTemplate(recent, template.id);
  }
  // Airlift adaptation (v0.22.18): an air-ambulance callout is only meaningful
  // when the city has an EMS unit AND the helipad. In a police-only city with
  // neither, re-roll the airlift template to a road-answerable EMS call so it
  // never piles up unanswerable (mirrors the disaster-wave adaptation). Runs
  // after the variety guard so it is the final word on the picked template;
  // only organic picks — forced templates (chains, traffic duties, waves) are
  // adapted upstream.
  if (!opts.template && service === 'ems') {
    const st = useGameStore.getState();
    template = adaptAirliftTemplate(template, getMissionsForService('ems'), emsAirliftEligible(st.units, st.helipad));
  }
  const extraDifficulty = Math.random() < 0.08 && level > 2 ? 1 : 0;
  const difficulty = Math.min(10, template.difficulty + extraDifficulty);
  // City trait reward multipliers (v0.35.0): harder cities pay better.
  const cityTrait = getCityTrait(cityName);
  const traitCreditsMult = cityTrait?.modifiers.creditsMultiplier ?? 1;
  const traitXpMult = cityTrait?.modifiers.xpMultiplier ?? 1;
  const creditsReward = Math.round(template.baseCredits * (1 + (difficulty - template.difficulty) * 0.15) * traitCreditsMult);
  const xpReward = Math.round(template.baseXp * (1 + (difficulty - template.difficulty) * 0.15) * traitXpMult);

  const location = await pickMissionLocation(service, template.poiTypes, city, opts.origin);

  // ── POI anchoring (v0.22.10) ─────────────────────────────────────────────
  // When a PLAYER-PLACED named place (v0.22.12) suits the call type and sits
  // near the chosen location, the mission attaches to it: the marker sits on
  // the POI, the description names it, and radio traffic references it (see
  // radioDialogueEngine missionName). Pure road calls never anchor. With no
  // landmarks placed yet, calls stay street-level.
  let anchorPoi: Poi | null = null;
  if (!opts.origin) {
    anchorPoi = findAnchorPoi(useGameStore.getState().placedPois, location, template.poiTypes);
  }
  const missionLocation = anchorPoi ? anchorPoi.position : location;

  const name = opts.prefix ? `${opts.prefix}${template.name}` : template.name;
  const description = opts.originDescription
    ? `${template.description} (${opts.originDescription})`
    : anchorPoi
      ? `${template.description} — ${anchorPoi.name} (${POI_TYPE_META[anchorPoi.type].label}).`
      : template.description;

  const mission: Mission = {
    id: `mission_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    templateId: template.id,
    name,
    description,
    category: template.category,
    icon: template.icon,
    status: 'active',
    location: missionLocation,
    poiType: anchorPoi?.type ?? template.poiTypes[0] ?? null,
    poiId: anchorPoi?.id,
    difficulty,
    creditsReward,
    xpReward,
    requirements: template.requirements,
    assignedUnits: [],
    progress: 0,
    timeRemaining: template.estimatedDuration,
    totalTime: template.estimatedDuration,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + template.estimatedDuration * 1000).toISOString(),
    priority: getMissionPriority(difficulty, template.category, template.estimatedDuration),
  };

  if (!opts.skipSuspect) attachSuspectToMission(mission);

  // ~8% of normal spawns seed a chain so staged sequences appear naturally.
  // The first stage must match the city's service (so it lands on the main board)
  // and stay within reach of the player's level — seeding a difficulty-10 opening
  // call (e.g. mass casualty) to a low-level city would be unanswerable.
  if (!opts.template && !opts.prefix && Math.random() < 0.08 && CHAIN_DEFINITIONS.length > 0) {
    const def = CHAIN_DEFINITIONS[Math.floor(Math.random() * CHAIN_DEFINITIONS.length)];
    if (def.stages[0] && def.stages[0].service === service) {
      const firstTemplate = getMissionsForService(service).find((t) => t.id === def.stages[0].templateId);
      const maxOpeningDifficulty = level + 2;
      if (!firstTemplate || firstTemplate.difficulty > maxOpeningDifficulty) return mission;
      mission.chainId = def.id;
      mission.chainStage = 1;
      mission.chainTotal = def.stages.length;
    }
  }

  const cityRadiusKm = Math.min(15, getCityRadiusKm(city?.bounds ?? null));
  const allZones = missionZonesForCity(city, { lat: city?.lat ?? missionLocation.lat, lng: city?.lng ?? missionLocation.lng }, cityRadiusKm);
  // Prefer bounds containment when the grid is aligned to the city, so the hint
  // matches the neighborhood labels painted on the map.
  const gridZone = city?.bounds && Array.isArray(city.bounds) && city.bounds.length === 2
    ? patrolZonesForCity({ bounds: city.bounds, boundary: city?.boundary ?? null }).find((z) =>
        missionLocation.lat >= z.bounds.latMin && missionLocation.lat <= z.bounds.latMax &&
        missionLocation.lng >= z.bounds.lngMin && missionLocation.lng <= z.bounds.lngMax)
    : undefined;
  const zone = gridZone
    ?? allZones.find((z) => haversineKm(missionLocation, z.center) <= z.radiusKm)
    ?? allZones.reduce((a, b) => (haversineKm(missionLocation, a.center) < haversineKm(missionLocation, b.center) ? a : b));
  (mission as any).zoneHint = zone?.name ?? 'Citywide';

  return mission;
}

/**
 * Generate a traffic duty call reported by a field unit. Duties are always traffic
 * incidents or road/highway calls (e.g. EMS accident response) — never arbitrary
 * missions — and are built from the chosen template so difficulty, rewards, and
 * priority stay consistent with the incident.
 */
export async function buildTrafficDutyMission(
  unit: Unit,
  service: ServiceType,
  city: CityData | null,
  level = 1,
): Promise<Mission> {
  const dutyTemplates = getTrafficDutyTemplates(service);
  if (dutyTemplates.length === 0) {
    throw new Error(`No traffic-duty templates for service ${service}`);
  }
  const template = pickWeightedTemplate(dutyTemplates);
  return buildMission(service, city, {
    level,
    origin: unit.position ?? undefined,
    prefix: template.category === 'traffic' ? 'Traffic: ' : undefined,
    originDescription: `reported by ${unit.name}`,
    template,
    // The id is rewritten below, so attach the suspect after the rewrite.
    skipSuspect: true,
  }).then((m) => {
    m.id = `duty_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    attachSuspectToMission(m);
    return m;
  });
}
