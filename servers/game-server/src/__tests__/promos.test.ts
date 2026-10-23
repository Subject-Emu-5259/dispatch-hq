// ============================================
// Dispatch HQ — Promo / Reward Helpers Tests
// ============================================

import { describe, expect, it } from 'vitest';
import { parseRewards, applyRewards } from '../routes/admin';
import { normalizeCode } from '../routes/promos';

describe('parseRewards', () => {
  it('accepts a valid reward payload', () => {
    expect(parseRewards({ xp: 500, credits: 2500, coins: 10, level: 1 })).toEqual({ xp: 500, credits: 2500, coins: 10, level: 1 });
  });

  it('rejects empty payloads', () => {
    expect(parseRewards({})).toBeNull();
    expect(parseRewards(null)).toBeNull();
    expect(parseRewards('xp')).toBeNull();
  });

  it('clamps negatives and floors floats', () => {
    expect(parseRewards({ xp: -100, credits: 12.9 })).toEqual({ credits: 12 });
    expect(parseRewards({ level: 0 })).toBeNull();
  });

  it('rejects non-numeric values', () => {
    expect(parseRewards({ xp: 'lots' })).toBeNull();
  });
});

describe('applyRewards', () => {
  it('adds each reward to the player row', () => {
    const player = { credits: 1000, coins: 5, xp: 200, level: 3 };
    const granted = applyRewards(player, { xp: 300, credits: 500, level: 2 });
    expect(granted).toEqual({ xp: 300, credits: 500, level: 2 });
    expect(player).toEqual({ credits: 1500, coins: 5, xp: 500, level: 5 });
  });

  it('reports only the rewards actually granted', () => {
    const player = { credits: 0, coins: 0, xp: 0, level: 1 };
    expect(applyRewards(player, {})).toEqual({});
    expect(player).toEqual({ credits: 0, coins: 0, xp: 0, level: 1 });
  });
});

describe('normalizeCode', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeCode('  dhq-love  ')).toBe('DHQ-LOVE');
  });

  it('handles empty input', () => {
    expect(normalizeCode('')).toBe('');
  });
});
