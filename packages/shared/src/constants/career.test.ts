import { describe, it, expect } from 'vitest';
import { RANKS, rankForLevel, nextRank } from './career';

describe('career ranks', () => {
  it('RANKS are ordered by minLevel', () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].minLevel).toBeGreaterThan(RANKS[i - 1].minLevel);
  });
  it('rankForLevel picks the highest rank <= level', () => {
    expect(rankForLevel(1).title).toBe(RANKS[0].title);
    expect(rankForLevel(99).title).toBe(RANKS[RANKS.length - 1].title);
  });
  it('service titles override default when provided', () => {
    const r = RANKS.find((x) => x.serviceTitles.fire) ?? RANKS[0];
    if (r.serviceTitles.fire) expect(rankForLevel(r.minLevel, 'fire').title).toBe(r.serviceTitles.fire);
  });
  it('nextRank returns null at max', () => {
    expect(nextRank(99)).toBeNull();
  });
  it('reward bonuses increase monotonically from 1.0', () => {
    expect(RANKS[0].rewardBonus).toBe(1.0);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].rewardBonus).toBeGreaterThan(RANKS[i - 1].rewardBonus);
  });
});
