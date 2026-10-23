// ============================================
// Dispatch HQ — Unit telemetry helpers
// ============================================

import type { Unit, GeoPoint } from '@dispatch-hq/shared';
import { haversineKm } from '@/utils/roadPathfinding';

export function recordActualSpeed(
  unit: Unit,
  newPos: GeoPoint,
  updateUnit: (id: string, partial: Partial<Unit>) => void,
): void {
  const now = Date.now();
  let currentSpeed = 0;
  if (unit.lastPosition && unit.lastPositionAt && now > unit.lastPositionAt + 50) {
    const dt = (now - unit.lastPositionAt) / 1000;
    const distM = haversineKm(unit.lastPosition, newPos) * 1000;
    currentSpeed = distM / dt;
  }
  updateUnit(unit.id, {
    position: { ...newPos },
    currentSpeed,
    lastPosition: { ...newPos },
    lastPositionAt: now,
  });
}

export function zeroSpeed(unit: Unit, updateUnit: (id: string, partial: Partial<Unit>) => void): void {
  updateUnit(unit.id, {
    currentSpeed: 0,
    lastPosition: unit.position ? { ...unit.position } : unit.lastPosition,
    lastPositionAt: Date.now(),
  });
}
