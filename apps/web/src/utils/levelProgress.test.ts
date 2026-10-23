import { describe, it, expect } from 'vitest';
import { levelProgress, lifetimeXpOf } from './levelProgress';

describe('levelProgress (v0.19 curve display)', () => {
  it('derives the fraction from the stored remainder', () => {
    // Level 5 needs 1500 for level 6; 900 into the level → 60%.
    const p = levelProgress({ level: 5, xp: 900 });
    expect(p.level).toBe(5);
    expect(p.levelXp).toBe(900);
    expect(p.xpForNext).toBe(1500);
    expect(p.atMaxLevel).toBe(false);
    expect(p.pct).toBe(60);
  });

  it('handles level 1 with zero xp', () => {
    const p = levelProgress({ level: 1, xp: 0 });
    expect(p.xpForNext).toBe(100);
    expect(p.pct).toBe(0);
  });

  it('clamps the percentage at 100 when the remainder matches the requirement', () => {
    const p = levelProgress({ level: 2, xp: 300 });
    expect(p.pct).toBe(100);
  });

  it('flags the level-20 cap as max level', () => {
    const p = levelProgress({ level: 20, xp: 12345 });
    expect(p.atMaxLevel).toBe(true);
    expect(p.xpForNext).toBe(Infinity);
    expect(p.pct).toBe(100);
  });

  it('defaults a missing player to level 1', () => {
    const p = levelProgress(null);
    expect(p.level).toBe(1);
    expect(p.levelXp).toBe(0);
    expect(p.xpForNext).toBe(100);
  });
});

describe('lifetimeXpOf (leaderboard total)', () => {
  it('is the curve total to reach the level plus the remainder', () => {
    // Cumulative to reach level 5 is 2000 (0+100+300+600+1000); +900 into it.
    expect(lifetimeXpOf({ level: 5, xp: 900 })).toBe(2900);
    expect(lifetimeXpOf({ level: 1, xp: 0 })).toBe(0);
  });

  it('out-ranks a higher remainder at the same level', () => {
    expect(lifetimeXpOf({ level: 5, xp: 1400 })).toBeGreaterThan(lifetimeXpOf({ level: 5, xp: 900 }));
  });

  it('is always below a player one level higher (level-first ordering)', () => {
    const bestL5 = lifetimeXpOf({ level: 5, xp: 1499 });
    const worstL6 = lifetimeXpOf({ level: 6, xp: 0 });
    expect(bestL5).toBeLessThan(worstL6);
  });

  it('handles null and negative/zero remainders', () => {
    expect(lifetimeXpOf(null)).toBe(0);
    expect(lifetimeXpOf({ level: 10, xp: -5 })).toBe(cumulativeToLevel10());
  });
});

function cumulativeToLevel10(): number {
  // 0+100+300+600+1000+1500+2200+3000+4000+5500 = 18200
  return 18200;
}
