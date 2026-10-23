import { describe, it, expect } from 'vitest';
import {
  ALLIANCE_LEVELS,
  allianceLevelFor,
  nextAllianceLevel,
  allianceMemberCap,
  allianceRevealKm,
  allianceCommanderBonus,
  allianceProgress,
} from './alliances';

describe('alliance levels', () => {
  it('starts at level 1 with the base cap and no reveal', () => {
    expect(allianceLevelFor(0).level).toBe(1);
    expect(allianceLevelFor(1999).level).toBe(1);
    expect(allianceMemberCap(0)).toBe(5);
    expect(allianceRevealKm(0)).toBe(0);
    expect(allianceCommanderBonus(0)).toBe(1.0);
  });

  it('promotes at each threshold and perks scale up', () => {
    expect(allianceLevelFor(2000).level).toBe(2);
    expect(allianceLevelFor(6000).level).toBe(3);
    expect(allianceLevelFor(14000).level).toBe(4);
    expect(allianceLevelFor(26000).level).toBe(5);
    expect(allianceLevelFor(999999).level).toBe(5);
    expect(allianceMemberCap(26000)).toBe(20);
    expect(allianceRevealKm(14000)).toBe(10);
    expect(allianceCommanderBonus(6000)).toBe(1.1);
  });

  it('nextAllianceLevel returns null when maxed', () => {
    expect(nextAllianceLevel(0)?.level).toBe(2);
    expect(nextAllianceLevel(25000)?.level).toBe(5);
    expect(nextAllianceLevel(26000)).toBeNull();
  });

  it('progress is 0 at threshold and 1 when maxed', () => {
    expect(allianceProgress(0)).toBe(0);
    expect(allianceProgress(2000)).toBe(0); // exactly at next threshold → next level
    expect(allianceProgress(26000)).toBe(1);
  });

  it('ladder is monotonically increasing', () => {
    let prev = -1;
    for (const l of ALLIANCE_LEVELS) {
      expect(l.xpThreshold).toBeGreaterThan(prev);
      expect(l.memberCap).toBeGreaterThanOrEqual(prev >= 0 ? 5 : 0);
      prev = l.xpThreshold;
    }
  });
});
