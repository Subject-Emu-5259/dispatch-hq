// ============================================
// Dispatch HQ — Station Coverage Gap (v0.21.1)
// ============================================
// Pure math behind the Coverage Gaps map overlay: which neighborhoods sit
// beyond every station's effective response radius. Zones are sampled at their
// polygon vertices + center; a zone with ~0% of samples in reach is a full gap,
// partially-reached zones are partial gaps, fully-covered zones are dropped.

import type { Station, GeoPoint } from '@dispatch-hq/shared';
import type { CityZone } from '@/lib/patrol/patrolZones';
import { haversineKm } from '@/utils/roadPathfinding';

export type GapSeverity = 'full' | 'partial';

/** A station's effective response radius in km (the Response Radius perk is baked in). */
export function stationRadiusKm(station: Station): number {
  return station.coverageRadius || 5;
}

/** Sample points for a zone: polygon vertices + center, or bbox corners + center. */
export function zoneSamplePoints(zone: CityZone): GeoPoint[] {
  if (zone.polygon && zone.polygon.length >= 3) return [...zone.polygon, zone.center];
  const b = zone.bounds;
  return [
    { lat: b.latMin, lng: b.lngMin },
    { lat: b.latMin, lng: b.lngMax },
    { lat: b.latMax, lng: b.lngMax },
    { lat: b.latMax, lng: b.lngMin },
    zone.center,
  ];
}

/** 0..1 fraction of a zone's sample points within any station's effective radius. */
export function zoneCoverageRatio(zone: CityZone, stations: Station[]): number {
  if (stations.length === 0) return 0;
  const samples = zoneSamplePoints(zone);
  if (samples.length === 0) return 0;
  const covered = samples.filter((p) =>
    stations.some((s) => haversineKm(s.position, p) <= stationRadiusKm(s)),
  ).length;
  return covered / samples.length;
}

/**
 * Severity for the overlay: 'full' when nothing reaches the zone, 'partial'
 * when only some of it is covered, null when it is effectively covered.
 * Landless bbox cells (`covered === false`) are always null.
 */
export function gapSeverityFor(zone: CityZone, stations: Station[]): GapSeverity | null {
  if (!zone.covered) return null;
  const ratio = zoneCoverageRatio(zone, stations);
  if (ratio >= 0.99) return null;
  return ratio === 0 ? 'full' : 'partial';
}
