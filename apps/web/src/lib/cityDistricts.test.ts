import { describe, it, expect } from 'vitest';
import {
  DISTRICTS, districtUnlockLevel, isDistrictUnlocked, unlockedDistricts, lockedDistricts,
  DEFAULT_SATISFACTION, satisfactionKey, satisfactionFor, satisfactionDeltaForResponse,
  applySatisfaction, callVolumeMultiplier, districtRewardMultiplier, pickDistrictForSpawn,
} from './cityDistricts';

describe('cityDistricts (Batch 3b)', () => {
  it('unlocks districts on the city level + offset (Nashville L4 pattern generalized)', () => {
    expect(districtUnlockLevel('Nashville, TN', 'Downtown')).toBe(4);
    expect(districtUnlockLevel('Nashville, TN', 'Northside')).toBe(6);
    expect(districtUnlockLevel('Nashville, TN', 'Uptown')).toBe(18);
    expect(districtUnlockLevel('West Memphis, AR', 'Downtown')).toBe(1);
    expect(isDistrictUnlocked('Nashville, TN', 'Eastside', 7)).toBe(false);
    expect(isDistrictUnlocked('Nashville, TN', 'Eastside', 8)).toBe(true);
    expect(unlockedDistricts('Nashville, TN', 4)).toEqual(['Downtown']);
    expect(unlockedDistricts('Nashville, TN', 8)).toEqual(['Downtown', 'Northside', 'Eastside']);
    expect(lockedDistricts('Nashville, TN', 4)[0]).toEqual({ name: 'Northside', unlockLevel: 6 });
    expect(DISTRICTS).toHaveLength(8);
  });

  it('moves satisfaction with response times and clamps 0..100', () => {
    expect(satisfactionDeltaForResponse(120, false)).toBe(3);
    expect(satisfactionDeltaForResponse(240, false)).toBe(1);
    expect(satisfactionDeltaForResponse(500, false)).toBe(-2);
    expect(satisfactionDeltaForResponse(900, false)).toBe(-5);
    expect(satisfactionDeltaForResponse(10, true)).toBe(-8);
    expect(satisfactionFor({}, 'Memphis, TN', 'Downtown')).toBe(DEFAULT_SATISFACTION);
    const r1 = applySatisfaction({}, 'Memphis, TN', 'Downtown', 3);
    expect(satisfactionFor(r1, 'Memphis, TN', 'Downtown')).toBe(53);
    expect(satisfactionFor(applySatisfaction(r1, 'Memphis, TN', 'Downtown', 100), 'Memphis, TN', 'Downtown')).toBe(100);
    expect(satisfactionFor(applySatisfaction({}, 'Memphis, TN', 'Downtown', -100), 'Memphis, TN', 'Downtown')).toBe(0);
    expect(satisfactionKey('Memphis, TN', 'Downtown')).toBe('Memphis, TN::Downtown');
  });

  it('turns satisfaction into call-volume and reward effects', () => {
    expect(callVolumeMultiplier(90)).toBe(1.25);
    expect(callVolumeMultiplier(70)).toBe(1.1);
    expect(callVolumeMultiplier(50)).toBe(1.0);
    expect(callVolumeMultiplier(30)).toBe(0.85);
    expect(callVolumeMultiplier(5)).toBe(0.7);
    expect(districtRewardMultiplier(50)).toBe(1);
    expect(districtRewardMultiplier(100)).toBe(1.25);
    expect(districtRewardMultiplier(0)).toBe(0.75);
  });

  it('picks spawn districts weighted by satisfaction (deterministic random)', () => {
    const rec = { 'Memphis, TN::Downtown': 100, 'Memphis, TN::Northside': 0 };
    // Weights 1.25 vs 0.70, total 1.95: roll 0.5 → 0.975 lands in Downtown.
    expect(pickDistrictForSpawn(['Downtown', 'Northside'], rec, 'Memphis, TN', () => 0.5)).toBe('Downtown');
    // Roll 0.99 → 1.93 lands in Northside.
    expect(pickDistrictForSpawn(['Downtown', 'Northside'], rec, 'Memphis, TN', () => 0.99)).toBe('Northside');
    expect(pickDistrictForSpawn([], rec, 'Memphis, TN')).toBeNull();
  });
});
