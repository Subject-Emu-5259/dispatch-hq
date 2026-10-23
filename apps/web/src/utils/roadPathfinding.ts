// ============================================
// Dispatch HQ — Road Pathfinding System
// ============================================
// Generates road-following waypoints between two geo points.
// Real road data comes from OSRM via ./routing.ts. This file provides the
// fallback geometry and interpolation helpers.

import type { GeoPoint } from '@dispatch-hq/shared';

export interface RoadPath {
  waypoints: GeoPoint[];
  totalDistanceKm: number;
}

// Maximum spacing between straight-line fallback waypoints (~100m)
const STRAIGHT_STEP_M = 50;

/**
 * Generate a fallback path between two points.
 * Previously this generated a fake Manhattan grid zigzag; that caused units to
 * drive through blocks instead of following real roads. The new fallback is a
 * simple straight line with evenly spaced intermediate points so the unit still
 * animates smoothly while we wait for/retry the real OSRM route.
 */
export function generateRoadPath(start: GeoPoint, end: GeoPoint, _seed?: number): RoadPath {
  const totalDistKm = haversineKm(start, end);
  if (totalDistKm === 0) return { waypoints: [{ ...start }, { ...end }], totalDistanceKm: 0 };

  const totalDistM = totalDistKm * 1000;
  const steps = Math.max(1, Math.ceil(totalDistM / STRAIGHT_STEP_M));

  const waypoints: GeoPoint[] = [{ ...start }];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    waypoints.push({
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    });
  }
  waypoints.push({ ...end });

  return { waypoints, totalDistanceKm: totalDistKm };
}

/**
 * Get position along a path at a given progress fraction (0-1).
 */
export function getPositionOnPath(waypoints: GeoPoint[], progress: number): GeoPoint {
  if (waypoints.length === 0) return { lat: 0, lng: 0 };
  if (waypoints.length === 1) return { ...waypoints[0] };
  if (progress <= 0) return { ...waypoints[0] };
  if (progress >= 1) return { ...waypoints[waypoints.length - 1] };

  const segmentDistances: number[] = [];
  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineKm(waypoints[i - 1], waypoints[i]);
    segmentDistances.push(d);
    totalDist += d;
  }

  if (totalDist === 0) return { ...waypoints[0] };

  const targetDist = progress * totalDist;
  let traveled = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    if (traveled + segmentDistances[i] >= targetDist) {
      const segProgress = segmentDistances[i] > 0
        ? (targetDist - traveled) / segmentDistances[i]
        : 0;
      return {
        lat: waypoints[i].lat + (waypoints[i + 1].lat - waypoints[i].lat) * segProgress,
        lng: waypoints[i].lng + (waypoints[i + 1].lng - waypoints[i].lng) * segProgress,
      };
    }
    traveled += segmentDistances[i];
  }

  return { ...waypoints[waypoints.length - 1] };
}

/**
 * Haversine distance in km between two geo points.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Split a polyline by arc-length progress (0..1) into [traveled, remaining].
 */
export function splitPathByProgress(
  waypoints: GeoPoint[],
  progress: number,
): { traveled: GeoPoint[]; remaining: GeoPoint[] } {
  if (waypoints.length === 0) return { traveled: [], remaining: [] };
  if (progress <= 0) return { traveled: [{ ...waypoints[0] }], remaining: waypoints.map((w) => ({ ...w })) };
  if (progress >= 1) return { traveled: waypoints.map((w) => ({ ...w })), remaining: [{ ...waypoints[waypoints.length - 1] }] };

  const segDist: number[] = [];
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineKm(waypoints[i - 1], waypoints[i]);
    segDist.push(d);
    total += d;
  }
  if (total === 0) return { traveled: [{ ...waypoints[0] }], remaining: waypoints.map((w) => ({ ...w })) };

  const target = progress * total;
  let traveledDist = 0;
  for (let i = 0; i < segDist.length; i++) {
    if (traveledDist + segDist[i] >= target) {
      const segProgress = segDist[i] > 0 ? (target - traveledDist) / segDist[i] : 0;
      const split: GeoPoint = {
        lat: waypoints[i].lat + (waypoints[i + 1].lat - waypoints[i].lat) * segProgress,
        lng: waypoints[i].lng + (waypoints[i + 1].lng - waypoints[i].lng) * segProgress,
      };
      const traveled = [waypoints[0], ...waypoints.slice(1, i + 1), split];
      const remaining = [split, ...waypoints.slice(i + 1)];
      return { traveled, remaining };
    }
    traveledDist += segDist[i];
  }
  return { traveled: waypoints.map((w) => ({ ...w })), remaining: [{ ...waypoints[waypoints.length - 1] }] };
}

/**
 * Alias for getPositionOnPath for legacy callers.
 */
export function interpolateAlongWaypoints(waypoints: GeoPoint[], progress: number): GeoPoint {
  return getPositionOnPath(waypoints, progress);
}
