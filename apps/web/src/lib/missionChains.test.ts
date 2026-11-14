import { describe, it, expect, vi } from 'vitest';
import { spawnChainStage, chainRewardBonus, chainBonusForStage, skipChainStage } from './missionChains';

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

  it('a skipped chain pays no bonus at any stage', () => {
    expect(chainRewardBonus({ chainStage: 2, chainSkipped: true } as any)).toBe(1);
    expect(chainRewardBonus({ chainStage: 3, chainSkipped: true } as any)).toBe(1);
    expect(chainBonusForStage(2, true)).toBe(1);
    expect(chainBonusForStage(2, false)).toBe(1.25);
    expect(chainBonusForStage(2)).toBe(1.25);
  });

  it('spawnChainStage propagates the skipped marker to the next stage', async () => {
    const addMission = vi.fn();
    const m = await spawnChainStage(
      { id: 'a', chainId: 'fire_chain', chainStage: 1, chainTotal: 3, chainSkipped: true, name: 'X', location: { lat: 35.1, lng: -90.1 } } as any,
      null,
      1,
      addMission,
    );
    expect(m).not.toBeNull();
    expect(m!.chainSkipped).toBe(true);
    expect(m!.chainStage).toBe(2);
  });

  it('skipChainStage removes the current stage and spawns a bonus-less next stage', async () => {
    const addMission = vi.fn();
    const removeMission = vi.fn();
    const result = await skipChainStage(
      { id: 'a', chainId: 'fire_chain', chainStage: 1, chainTotal: 3, name: 'X', location: { lat: 35.1, lng: -90.1 } } as any,
      null,
      1,
      addMission,
      removeMission,
    );
    expect(result.skipped).toBe(true);
    expect(result.chainEnded).toBe(false);
    expect(removeMission).toHaveBeenCalledWith('a');
    expect(addMission).toHaveBeenCalled();
    expect(result.next).not.toBeNull();
    expect(result.next!.chainStage).toBe(2);
    expect(result.next!.chainSkipped).toBe(true);
    expect(chainRewardBonus(result.next!)).toBe(1);
  });

  it('skipping the final stage ends the chain with no next spawn', async () => {
    const addMission = vi.fn();
    const removeMission = vi.fn();
    const result = await skipChainStage(
      { id: 'a', chainId: 'fire_chain', chainStage: 3, chainTotal: 3, name: 'X' } as any,
      null,
      1,
      addMission,
      removeMission,
    );
    expect(result.skipped).toBe(true);
    expect(result.chainEnded).toBe(true);
    expect(result.next).toBeNull();
    expect(removeMission).toHaveBeenCalledWith('a');
    expect(addMission).not.toHaveBeenCalled();
  });

  it('skipChainStage is a no-op for a non-chain mission', async () => {
    const addMission = vi.fn();
    const removeMission = vi.fn();
    const result = await skipChainStage({ id: 'a' } as any, null, 1, addMission, removeMission);
    expect(result.skipped).toBe(false);
    expect(removeMission).not.toHaveBeenCalled();
    expect(addMission).not.toHaveBeenCalled();
  });
});
