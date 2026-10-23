// ============================================
// Dispatch HQ — Unit Position Relay Validation
// ============================================
// Pure, socket-free helpers for the live unit-movement relay. Kept separate
// from connectionManager so every rule is unit-testable without a socket.

export const MAX_SPEED_KMH = 60;
export const SPEED_TOLERANCE = 1.4;   // legit moves pass, teleports fail
export const THROTTLE_MS = 500;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface PositionSample {
  lat: number;
  lng: number;
  at: number;   // epoch ms
}

/** True when the move between two samples respects the speed cap (with tolerance). */
export function unitSpeedOk(prev: PositionSample, next: PositionSample): boolean {
  const elapsedH = (next.at - prev.at) / 3600_000;
  if (elapsedH <= 0) return false;
  const speedKmh = haversineKm(prev, next) / elapsedH;
  return speedKmh <= MAX_SPEED_KMH * SPEED_TOLERANCE;
}

/** True when an update is NOT yet allowed (inside the throttle window). */
export function withinThrottle(lastAt: number | undefined, now: number): boolean {
  if (lastAt === undefined) return false; // first ever update → allowed
  return now - lastAt < THROTTLE_MS;
}

export interface Viewport {
  lat: number;
  lng: number;
  radiusKm: number;
}

export function viewportContains(v: Viewport, p: { lat: number; lng: number }): boolean {
  return haversineKm(v, p) <= v.radiusKm;
}
