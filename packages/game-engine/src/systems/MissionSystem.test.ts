import { describe, it, expect } from 'vitest';
import { MissionSystem } from './MissionSystem';
import type { Mission } from '@dispatch-hq/shared';

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-mission',
    templateId: 'test',
    name: 'Test Mission',
    description: 'Test description',
    category: 'fire',
    icon: '🔥',
    status: 'active',
    location: { lat: 40.7128, lng: -74.006 },
    poiType: null,
    difficulty: 5,
    creditsReward: 500,
    xpReward: 100,
    requirements: [{ unitType: 'engine', count: 2, minTrainingLevel: 1 }],
    assignedUnits: [],
    progress: 0,
    timeRemaining: 300,
    totalTime: 300,
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MissionSystem', () => {
  describe('canCompleteMission', () => {
    it('returns canComplete true with empty missing array when requirements met', () => {
      const mission = makeMission({ requirements: [{ unitType: 'engine', count: 2, minTrainingLevel: 1 }] });
      const result = MissionSystem.canCompleteMission(mission, ['engine', 'engine']);
      expect(result.canComplete).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns canComplete false when insufficient units of required type', () => {
      const mission = makeMission({ requirements: [{ unitType: 'engine', count: 2, minTrainingLevel: 1 }] });
      const result = MissionSystem.canCompleteMission(mission, ['engine']);
      expect(result.canComplete).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].unitType).toBe('engine');
      expect(result.missing[0].count).toBe(1);
    });

    it('handles no requirements', () => {
      const mission = makeMission({ requirements: [] });
      const result = MissionSystem.canCompleteMission(mission, []);
      expect(result.canComplete).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('handles multiple requirement types with mixed availability', () => {
      const mission = makeMission({
        requirements: [
          { unitType: 'engine', count: 2, minTrainingLevel: 1 },
          { unitType: 'ladder', count: 1, minTrainingLevel: 1 },
        ],
      });
      const result = MissionSystem.canCompleteMission(mission, ['engine', 'engine']);
      expect(result.canComplete).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].unitType).toBe('ladder');
      expect(result.missing[0].count).toBe(1);
    });

    it('returns all missing requirements when no units available', () => {
      const mission = makeMission({
        requirements: [
          { unitType: 'engine', count: 3, minTrainingLevel: 1 },
          { unitType: 'ladder', count: 2, minTrainingLevel: 1 },
        ],
      });
      const result = MissionSystem.canCompleteMission(mission, []);
      expect(result.canComplete).toBe(false);
      expect(result.missing).toHaveLength(2);
      expect(result.missing[0].count).toBe(3);
      expect(result.missing[1].count).toBe(2);
    });

    it('ignores units of wrong type', () => {
      const mission = makeMission({ requirements: [{ unitType: 'engine', count: 1, minTrainingLevel: 1 }] });
      const result = MissionSystem.canCompleteMission(mission, ['patrol_car', 'ambulance']);
      expect(result.canComplete).toBe(false);
      expect(result.missing).toHaveLength(1);
    });
  });

  describe('calculateCompletionTime', () => {
    it('returns base time when 0 units assigned', () => {
      const mission = makeMission({ totalTime: 300 });
      expect(MissionSystem.calculateCompletionTime(mission, 0)).toBe(300);
    });

    it('reduces time by 10% per unit', () => {
      const mission = makeMission({ totalTime: 300 });
      expect(MissionSystem.calculateCompletionTime(mission, 1)).toBe(270);
      expect(MissionSystem.calculateCompletionTime(mission, 2)).toBe(240);
      expect(MissionSystem.calculateCompletionTime(mission, 3)).toBe(210);
    });

    it('caps reduction at 50% with 5+ units', () => {
      const mission = makeMission({ totalTime: 300 });
      expect(MissionSystem.calculateCompletionTime(mission, 5)).toBe(150);
      expect(MissionSystem.calculateCompletionTime(mission, 10)).toBe(150);
      expect(MissionSystem.calculateCompletionTime(mission, 100)).toBe(150);
    });

    it('returns floored integer', () => {
      const mission = makeMission({ totalTime: 301 });
      expect(MissionSystem.calculateCompletionTime(mission, 1)).toBe(270); // 301 * 0.9 = 270.9 -> 270
    });
  });

  describe('calculateCredits', () => {
    it('applies level bonus multiplier', () => {
      expect(MissionSystem.calculateCredits(100, 1.0)).toBe(100);
      expect(MissionSystem.calculateCredits(100, 1.5)).toBe(150);
      expect(MissionSystem.calculateCredits(100, 2.0)).toBe(200);
    });

    it('floors the result', () => {
      expect(MissionSystem.calculateCredits(101, 1.05)).toBe(106);
      expect(MissionSystem.calculateCredits(77, 1.15)).toBe(88);
    });

    it('handles zero credits', () => {
      expect(MissionSystem.calculateCredits(0, 1.5)).toBe(0);
    });
  });
});