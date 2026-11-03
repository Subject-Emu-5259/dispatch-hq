// ============================================
// Dispatch HQ — Fog-of-War Exploration, Deepened (Batch 3d)
// ============================================
// Deterministic zone grid (no Math.random — the same city center always
// yields the same zones, so revealed ids survive save/load). Zones reveal
// from ANY travelled point: stations, mission sites, AND unit positions
// (the travel trail), not just stations/missions as before. Fully
// explored zones pay a small dispatch bonus through the mission reward
// multiplier (see lib/rewards.ts fogRewardMult).

export interface FogZone {
  id: string;
  lat: number;
  lng: number;
  /** Reveal radius in degrees (~1.1 km per 0.01). */
  radius: number;
}

export const FOG_ZONE_COUNT = 20;
/** Reveal radius for a travelled point, in degrees. */
export const FOG_REVEAL_RADIUS = 0.015;
/** Bonus per revealed zone (percent), capped; full-map clear adds a bonus. */
export const FOG_BONUS_PER_ZONE_PCT = 0.5;
export const FOG_BONUS_CAP_PCT = 10;
export const FOG_FULL_CLEAR_BONUS_PCT = 5;

/** Deterministic zones ringing the map center (replaces the old random ring). */
export function fogZonesForCenter(center: [number, number]): FogZone[] {
  const zones: FogZone[] = [];
  for (let i = 0; i < FOG_ZONE_COUNT; i++) {
    const angle = (i / FOG_ZONE_COUNT) * Math.PI * 2;
    const distance = 0.01 + (i % 5) * 0.008;
    zones.push({
      id: `fog_${i}`,
      lat: center[0] + Math.cos(angle) * distance,
      lng: center[1] + Math.sin(angle) * distance,
      radius: 0.005 + (i % 4) * 0.0025,
    });
  }
  return zones;
}

function distDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return Math.sqrt((aLat - bLat) ** 2 + (aLng - bLng) ** 2);
}

/**
 * Ids newly revealed by `points` (stations + missions + unit trail) that
 * are not already in `revealed`. Pure — the caller merges the result.
 */
export function newlyRevealedZones(
  zones: FogZone[],
  revealed: readonly string[],
  points: ReadonlyArray<{ lat: number; lng: number }>,
  radius: number = FOG_REVEAL_RADIUS,
): string[] {
  const have = new Set(revealed);
  const fresh: string[] = [];
  for (const zone of zones) {
    if (have.has(zone.id)) continue;
    const near = points.some((p) => distDeg(p.lat, p.lng, zone.lat, zone.lng) < radius + zone.radius);
    if (near) fresh.push(zone.id);
  }
  return fresh;
}

/** Dispatch bonus percent from explored zones: +0.5% each (cap 10%), +5% on full clear. */
export function exploredBonusPct(revealedCount: number, totalZones: number = FOG_ZONE_COUNT): number {
  if (totalZones <= 0) return 0;
  const capped = Math.min(FOG_BONUS_CAP_PCT, revealedCount * FOG_BONUS_PER_ZONE_PCT);
  return revealedCount >= totalZones ? capped + FOG_FULL_CLEAR_BONUS_PCT : capped;
}

/** Multiplier form for the reward stack (1.0 = no bonus). */
export function fogBonusMultiplier(revealedCount: number, totalZones: number = FOG_ZONE_COUNT): number {
  return 1 + exploredBonusPct(revealedCount, totalZones) / 100;
}

/** Defensive parse of the saved revealed-id list. */
export function parseFogRevealed(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.startsWith('fog_'));
}
