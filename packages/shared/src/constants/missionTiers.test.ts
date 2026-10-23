import { describe, it, expect } from 'vitest';
import { difficultyTierFor, TIER_META } from './missionTiers';

describe('difficultyTierFor', () => {
  it('maps boundaries to tiers', () => {
    expect(difficultyTierFor(1)).toBe('routine');
    expect(difficultyTierFor(3)).toBe('routine');
    expect(difficultyTierFor(4)).toBe('moderate');
    expect(difficultyTierFor(5)).toBe('moderate');
    expect(difficultyTierFor(6)).toBe('serious');
    expect(difficultyTierFor(8)).toBe('serious');
    expect(difficultyTierFor(9)).toBe('critical');
    expect(difficultyTierFor(10)).toBe('critical');
  });
  it('clamps out-of-range input', () => {
    expect(difficultyTierFor(0)).toBe('routine');
    expect(difficultyTierFor(99)).toBe('critical');
  });
  it('provides label+color metadata for every tier', () => {
    for (const tier of ['routine', 'moderate', 'serious', 'critical'] as const) {
      expect(TIER_META[tier].label.length).toBeGreaterThan(0);
      expect(TIER_META[tier].chipClass).toContain('text-');
    }
  });
});
