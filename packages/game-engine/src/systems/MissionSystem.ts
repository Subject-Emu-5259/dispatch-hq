// ============================================
// Dispatch HQ — Mission System
// ============================================

import type { Mission, MissionRequirement } from '@dispatch-hq/shared';

export class MissionSystem {
  /**
   * Check if a set of unit types satisfies mission requirements
   */
  static canCompleteMission(
    mission: Mission,
    unitTypes: string[]
  ): { canComplete: boolean; missing: MissionRequirement[] } {
    const missing: MissionRequirement[] = [];

    for (const req of mission.requirements) {
      const available = unitTypes.filter((t) => t === req.unitType).length;
      if (available < req.count) {
        missing.push({
          ...req,
          count: req.count - available,
        });
      }
    }

    return {
      canComplete: missing.length === 0,
      missing,
    };
  }

  /**
   * Calculate mission completion time based on assigned units
   */
  static calculateCompletionTime(
    mission: Mission,
    unitCount: number
  ): number {
    const baseTime = mission.totalTime;
    const unitBonus = Math.min(unitCount * 0.1, 0.5); // Max 50% reduction
    return Math.floor(baseTime * (1 - unitBonus));
  }

  /**
   * Calculate credits earned with level bonus
   */
  static calculateCredits(baseCredits: number, levelBonus: number): number {
    return Math.floor(baseCredits * levelBonus);
  }
}
