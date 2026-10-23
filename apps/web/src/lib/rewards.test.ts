import { describe, it, expect } from 'vitest';
import { computeMissionRewards, missionService, type MissionRewardInput } from './rewards';

// Neutral baseline: police call, full time remaining (speed bonus ×1.5),
// level 1, no alliance, no tech — so individual factors can be isolated.
function base(overrides: Partial<MissionRewardInput['mission']> = {}, input: Partial<MissionRewardInput> = {}): MissionRewardInput {
  return {
    mission: {
      category: 'police',
      creditsReward: 1000,
      xpReward: 100,
      timeRemaining: 120,
      totalTime: 120,
      disasterId: undefined,
      recovery: false,
      chainStage: undefined,
      ...overrides,
    },
    playerLevel: 1,
    service: 'police',
    allianceXp: null,
    ...input,
  };
}

describe('missionService', () => {
  it('maps fire/rescue/hazmat to fire', () => {
    expect(missionService({ category: 'fire' } as any)).toBe('fire');
    expect(missionService({ category: 'rescue' } as any)).toBe('fire');
    expect(missionService({ category: 'hazmat' } as any)).toBe('fire');
  });

  it('maps ems to ems and everything else (police + traffic) to police', () => {
    expect(missionService({ category: 'ems' } as any)).toBe('ems');
    expect(missionService({ category: 'police' } as any)).toBe('police');
    expect(missionService({ category: 'traffic' } as any)).toBe('police');
  });
});

describe('computeMissionRewards — speed bonus', () => {
  it('pays ×1.5 with full time remaining', () => {
    const r = computeMissionRewards(base());
    expect(r.speedBonus).toBe(1.5);
    expect(r.earnedCredits).toBe(1500);
    expect(r.earnedXp).toBe(150);
  });

  it('scales linearly with the remaining-time ratio (half → ×1.25)', () => {
    const r = computeMissionRewards(base({ timeRemaining: 60, totalTime: 120 }));
    expect(r.speedBonus).toBe(1.25);
    expect(r.earnedCredits).toBe(1250);
  });

  it('pays no speed bonus with no time left', () => {
    const r = computeMissionRewards(base({ timeRemaining: 0 }));
    expect(r.speedBonus).toBe(1);
    expect(r.earnedCredits).toBe(1000);
  });
});

describe('computeMissionRewards — mutual aid', () => {
  it('adds +25% for an organic partner-department call', () => {
    const r = computeMissionRewards(base({ category: 'police' }, { service: 'fire' }));
    expect(r.isMutualAid).toBe(true);
    expect(r.finalMult).toBeCloseTo(1.5 * 1.25);
    expect(r.earnedCredits).toBe(1875);
  });

  it('never applies to same-service calls', () => {
    const r = computeMissionRewards(base());
    expect(r.isMutualAid).toBe(false);
    expect(r.earnedCredits).toBe(1500);
  });

  it('excludes disaster waves and recovery calls even across services', () => {
    const disaster = computeMissionRewards(base({ category: 'police', disasterId: 'tornado' }, { service: 'fire' }));
    expect(disaster.isMutualAid).toBe(false);

    const recovery = computeMissionRewards(base({ category: 'police', recovery: true }, { service: 'fire' }));
    expect(recovery.isMutualAid).toBe(false);
  });

  it('never applies when the player has no selected service', () => {
    const r = computeMissionRewards(base({ category: 'police' }, { service: null }));
    expect(r.isMutualAid).toBe(false);
  });
});

describe('computeMissionRewards — level bonus (ECONOMY.levelBonus, v0.22.0)', () => {
  it('is neutral at level 1 (×1.0)', () => {
    const r = computeMissionRewards(base({}, { playerLevel: 1 }));
    expect(r.levelBonus).toBe(1.0);
    expect(r.earnedCredits).toBe(1500); // unchanged baseline
  });

  it('scales credits by the declared per-level curve, leaving XP untouched', () => {
    // Level 10 = Lieutenant (rank ×1.15) + level curve ×1.5 on credits.
    const r = computeMissionRewards(base({}, { playerLevel: 10 }));
    expect(r.levelBonus).toBe(1.5);
    expect(r.rankBonus).toBe(1.15);
    expect(r.earnedCredits).toBe(2588); // 1000 × 1.5 × 1.15 × 1.5 (rounds up)
    expect(r.earnedXp).toBe(173); // 100 × 1.5 × 1.15 — rank + speed, no level bonus
  });

  it('caps at ×2.0 at level 20 and above', () => {
    expect(computeMissionRewards(base({}, { playerLevel: 20 })).levelBonus).toBe(2.0);
    expect(computeMissionRewards(base({}, { playerLevel: 99 })).levelBonus).toBe(2.0);
  });

  it('floors at ×1.0 below level 1', () => {
    expect(computeMissionRewards(base({}, { playerLevel: 0 })).levelBonus).toBe(1.0);
  });

  it('never feeds the alliance XP credit (XP side is level-bonus free)', () => {
    const r = computeMissionRewards(base({}, { playerLevel: 10, allianceXp: 0 }));
    // alliance credit = round(round(100 × 1.5 × 1.15) × 0.25) = round(172.5 × 0.25) = 43
    expect(r.allianceXp).toBe(43);
  });
});

describe('computeMissionRewards — premium membership (v0.31.0)', () => {
  it('defaults to ×1 (no premium)', () => {
    const r = computeMissionRewards(base());
    expect(r.premiumMult).toBe(1);
    expect(r.earnedCredits).toBe(1500); // baseline unchanged
  });

  it('doubles credits only — XP is untouched', () => {
    const r = computeMissionRewards(base({}, { premiumMult: 2 }));
    expect(r.premiumMult).toBe(2);
    expect(r.earnedCredits).toBe(3000); // 1000 × 1.5 × 2
    expect(r.earnedXp).toBe(150); // 100 × 1.5 — no premium on XP
  });
});

describe('computeMissionRewards — chain, rank, commander, tech', () => {
  it('pays ×1.25 from chain stage 2 onward (not stage 1)', () => {
    const stage1 = computeMissionRewards(base({ chainStage: 1 }));
    expect(stage1.chainBonus).toBe(1);
    const stage2 = computeMissionRewards(base({ chainStage: 2 }));
    expect(stage2.chainBonus).toBe(1.25);
    expect(stage2.earnedCredits).toBe(1875); // 1000 × 1.5 × 1.25
  });

  it('scales rank bonus with the player level ladder', () => {
    expect(computeMissionRewards(base({}, { playerLevel: 1 })).rankBonus).toBe(1.0);
    expect(computeMissionRewards(base({}, { playerLevel: 6 })).rankBonus).toBe(1.1); // Sergeant
    expect(computeMissionRewards(base({}, { playerLevel: 20 })).rankBonus).toBe(1.4); // Commissioner
  });

  it('applies the alliance commander bonus only when allied', () => {
    expect(computeMissionRewards(base({}, { allianceXp: null })).commanderBonus).toBe(1);
    expect(computeMissionRewards(base({}, { allianceXp: 0 })).commanderBonus).toBe(1);
    expect(computeMissionRewards(base({}, { allianceXp: 2000 })).commanderBonus).toBe(1.05); // alliance level 2
  });

  it('applies the tech reward multiplier when provided', () => {
    const r = computeMissionRewards(base({}, { techRewardMult: 1.25 }));
    expect(r.earnedCredits).toBe(1875); // 1000 × 1.5 × 1.25
  });

  it('applies the station specialization reward multiplier (v0.20.1)', () => {
    const r = computeMissionRewards(base({}, { stationRewardMult: 1.1 }));
    expect(r.finalMult).toBeCloseTo(1.5 * 1.1);
    expect(r.earnedCredits).toBe(1650); // 1000 × 1.5 × 1.1
    expect(r.earnedXp).toBe(165);
  });

  it('applies the seasonal-event reward multiplier (v0.21.0)', () => {
    const baseNoSpeed = base({}, { seasonalMult: 1.5 });
    // Baseline without seasonal: credits = 1000 × speed 1.5 = 1500.
    expect(computeMissionRewards(base()).earnedCredits).toBe(1500);
    const r = computeMissionRewards(baseNoSpeed);
    expect(r.earnedCredits).toBe(Math.round(1000 * 1.5 * 1.5));
    expect(r.earnedXp).toBe(Math.round(100 * 1.5 * 1.5));
  });

  it('defaults the seasonal multiplier to 1 when omitted', () => {
    expect(computeMissionRewards(base()).earnedCredits).toBe(1500);
  });

  it('defaults the station multiplier to 1 when omitted', () => {
    const r = computeMissionRewards(base());
    expect(r.earnedCredits).toBe(1500);
  });

  it('rounds payouts to whole credits/XP', () => {
    const r = computeMissionRewards(base({ creditsReward: 1001 }, { service: 'fire' }));
    // 1001 × 1.5 × 1.25 = 1876.875 → rounds up
    expect(r.earnedCredits).toBe(1877);
  });
});

describe('computeMissionRewards — alliance XP credit', () => {
  it('credits 25% of the pre-commander XP when allied and XP was earned', () => {
    const r = computeMissionRewards(base({}, { allianceXp: 0 }));
    // base = round(100 × 1.5) = 150 → round(150 × 0.25) = 38
    expect(r.allianceXp).toBe(38);
  });

  it('returns null when not in an alliance', () => {
    expect(computeMissionRewards(base()).allianceXp).toBeNull();
  });

  it('returns null when the mission earned no XP', () => {
    const r = computeMissionRewards(base({ xpReward: 0 }, { allianceXp: 0 }));
    expect(r.earnedXp).toBe(0);
    expect(r.allianceXp).toBeNull();
  });
});

describe('computeMissionRewards — full multiplier stack', () => {
  it('compounds every factor in order', () => {
    const r = computeMissionRewards(base(
      { category: 'police', chainStage: 2 }, // mutual aid against fire + chain ×1.25
      {
        service: 'fire',
        playerLevel: 6,      // rank ×1.1, level ×1.25 (credits only)
        allianceXp: 2000,    // commander ×1.05
        techRewardMult: 1.25,
      },
    ));
    // Credits: 1.25 (tech) × 1.5 (speed) × 1.25 (chain) × 1.1 (rank) × 1.25 (level) × 1.05 (commander) × 1.25 (mutual aid)
    expect(r.levelBonus).toBe(1.25);
    expect(r.finalMult).toBeCloseTo(4.229736328125);
    expect(r.earnedCredits).toBe(4230); // round(1000 × 4.229736328125)
    // XP: same stack without the level bonus.
    expect(r.earnedXp).toBe(338);       // round(100 × 3.3837890625)
    // Alliance credit excludes the commander bonus: round(100 × 1.25 × 1.5 × 1.25 × 1.1 × 1.25) = 322 → ×0.25 = 80.5 → 81
    expect(r.allianceXp).toBe(81);
  });
});
