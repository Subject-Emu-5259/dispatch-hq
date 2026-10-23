import { describe, it, expect } from 'vitest';
import { CITY_ACCESS, cityUnlockLevel, isCityUnlocked, lockedUntilLabel, relocateCost, RELOCATE_BASE_COST, RELOCATE_PER_STATION, RELOCATE_PER_UNIT } from './cityProgression';

describe('cityProgression', () => {
  it('covers every popular city with a level gate', () => {
    expect(CITY_ACCESS['West Memphis, AR']).toBeDefined();
    expect(CITY_ACCESS['Memphis, TN']).toBeDefined();
    expect(CITY_ACCESS['Little Rock, AR']).toBeDefined();
    expect(Object.keys(CITY_ACCESS).length).toBeGreaterThanOrEqual(10);
    for (const [name, access] of Object.entries(CITY_ACCESS)) {
      expect(access.minLevel).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('starts everyone in West Memphis and gates the rest', () => {
    expect(cityUnlockLevel('West Memphis, AR')).toBe(1);
    expect(cityUnlockLevel('Memphis, TN')).toBeGreaterThan(1);
    expect(cityUnlockLevel('Nashville, TN')).toBe(4);
    expect(cityUnlockLevel('Tokyo')).toBe(20);
  });

  it('precise-boundary cities sit on the ladder (WM L1 → Paris L16 → Berlin L18)', () => {
    expect(cityUnlockLevel('West Memphis, AR')).toBe(1);
    expect(cityUnlockLevel('Memphis, TN')).toBe(3);
    expect(cityUnlockLevel('Nashville, TN')).toBe(4);
    expect(cityUnlockLevel('Little Rock, AR')).toBe(5);
    expect(cityUnlockLevel('New York City')).toBe(6);
    expect(cityUnlockLevel('Los Angeles')).toBe(8);
    expect(cityUnlockLevel('Chicago')).toBe(10);
    expect(cityUnlockLevel('Houston')).toBe(12);
    expect(cityUnlockLevel('London')).toBe(14);
    expect(cityUnlockLevel('Paris')).toBe(16);
    expect(cityUnlockLevel('Berlin')).toBe(18);
  });

  it('isCityUnlocked is inclusive at the gate', () => {
    const memphis = cityUnlockLevel('Memphis, TN');
    expect(isCityUnlocked('Memphis, TN', memphis - 1)).toBe(false);
    expect(isCityUnlocked('Memphis, TN', memphis)).toBe(true);
    expect(isCityUnlocked('Memphis, TN', memphis + 5)).toBe(true);
  });

  it('labels only locked cities', () => {
    expect(lockedUntilLabel('West Memphis, AR')).toBeNull();
    expect(lockedUntilLabel('Memphis, TN')).toBe(`Requires Level ${cityUnlockLevel('Memphis, TN')}`);
  });

  it('unknown cities default to unlocked', () => {
    expect(cityUnlockLevel('Somewhere Else')).toBe(1);
    expect(isCityUnlocked('Somewhere Else', 1)).toBe(true);
  });

  it('relocateCost scales with fleet size (v0.21.1)', () => {
    // Base only — no fleet.
    expect(relocateCost(0, 0)).toBe(RELOCATE_BASE_COST);
    // Early fleet: 1 station + 2 units.
    expect(relocateCost(1, 2)).toBe(RELOCATE_BASE_COST + RELOCATE_PER_STATION + 2 * RELOCATE_PER_UNIT);
    // Late-game fleet: bigger operation costs more.
    const small = relocateCost(1, 2);
    const big = relocateCost(5, 12);
    expect(big).toBeGreaterThan(small);
    expect(big).toBe(RELOCATE_BASE_COST + 5 * RELOCATE_PER_STATION + 12 * RELOCATE_PER_UNIT);
    // Every added unit raises the price by exactly the per-unit rate.
    expect(relocateCost(2, 3) - relocateCost(2, 2)).toBe(RELOCATE_PER_UNIT);
  });
});
