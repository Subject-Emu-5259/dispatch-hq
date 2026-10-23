// ============================================
// Dispatch HQ — Spawn System
// ============================================

import type { Mission, GeoPoint } from '@dispatch-hq/shared';
import { FIRE_MISSIONS, MISSION_SPAWN_CONFIG } from '@dispatch-hq/shared';

export class SpawnSystem {
  /**
   * Select a random mission template weighted by difficulty
   */
  static selectTemplate(regionLevel: number = 1) {
    // Filter missions appropriate for the region's level
    const appropriate = FIRE_MISSIONS.filter(
      (m) => m.difficulty <= regionLevel + 3
    );

    // Weighted random selection (easier missions more common)
    const weights = appropriate.map((m) => 
      Math.max(1, 10 - m.difficulty)
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < appropriate.length; i++) {
      random -= weights[i];
      if (random <= 0) return appropriate[i];
    }

    return appropriate[0];
  }

  /**
   * Generate a random location near a center point
   */
  static generateLocation(center: GeoPoint, radiusKm: number = 5): GeoPoint {
    const lat = center.lat + (Math.random() - 0.5) * (radiusKm / 111);
    const lng = center.lng + (Math.random() - 0.5) * (radiusKm / (111 * Math.cos(center.lat * Math.PI / 180)));
    return { lat, lng };
  }

  /**
   * Check if a new mission should spawn based on current active count
   */
  static shouldSpawn(activeCount: number, isUrban: boolean = true): boolean {
    if (activeCount >= MISSION_SPAWN_CONFIG.maxActiveMissions) return false;
    
    const rate = isUrban 
      ? MISSION_SPAWN_CONFIG.urbanRate 
      : MISSION_SPAWN_CONFIG.suburbanRate;
    
    return Math.random() < (1 / rate);
  }
}
