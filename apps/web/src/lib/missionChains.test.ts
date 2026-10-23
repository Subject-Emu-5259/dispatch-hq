import { describe, it, expect, vi } from 'vitest';
import { spawnChainStage, chainRewardBonus } from './missionChains';

vi.mock('./spawn', () => ({
  buildMission: vi.fn(async (_svc, _city, opts) => ({
    id: 'chain_next',
    templateId: opts?.template?.id ?? 't',
    name: 'Next',
    category: 'fire',
    icon: '🔥',
    status: 'active',
    location: { lat: 35.1, lng: -90.1 },
    poiType: null,
    difficulty: 3,
    creditsReward: 100,
    xpReward: 20,
    requirements: [],
    assignedUnits: [],
    progress: 0,
    timeRemaining: 120,
    totalTime: 120,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  })),
}));

describe('missionChains', () => {
  it('chainRewardBonus applies only past stage 1', () => {
    expect(chainRewardBonus({ chainStage: 1 } as any)).toBe(1);
    expect(chainRewardBonus({ chainStage: 2 } as any)).toBe(1.25);
    expect(chainRewardBonus({ chainStage: undefined } as any)).toBe(1);
  });

  it('spawnChainStage builds the next stage at the same location', async () => {
    const addMission = vi.fn();
    const m = await spawnChainStage(
      { id: 'a', chainId: 'fire_chain', chainStage: 1, chainTotal: 3, name: 'X', location: { lat: 35.1, lng: -90.1 } } as any,
      null,
      1,
      addMission,
    );
    expect(m).not.toBeNull();
    expect(m!.chainId).toBe('fire_chain');
    expect(m!.chainStage).toBe(2);
    expect(m!.chainTotal).toBe(3);
    expect(addMission).toHaveBeenCalled();
  });

  it('does nothing when the mission is not part of a chain', async () => {
    const addMission = vi.fn();
    const m = await spawnChainStage({ id: 'a' } as any, null, 1, addMission);
    expect(m).toBeNull();
    expect(addMission).not.toHaveBeenCalled();
  });

  it('does nothing after the final stage', async () => {
    const addMission = vi.fn();
    const m = await spawnChainStage(
      { id: 'a', chainId: 'fire_chain', chainStage: 3, chainTotal: 3, name: 'X' } as any,
      null,
      1,
      addMission,
    );
    expect(m).toBeNull();
    expect(addMission).not.toHaveBeenCalled();
  });
});
