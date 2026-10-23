import { describe, it, expect } from 'vitest';
import { CITY_TRAITS, getCityTrait, TRAIT_COUNT, type CityTrait } from './cityTraits';

describe('cityTraits', () => {
  it('has exactly ten registered traits (Paris, London, Berlin, Chicago, Houston, NYC, LA, Toronto, Sydney, Tokyo)', () => {
    expect(TRAIT_COUNT).toBe(10);
    expect(CITY_TRAITS['Paris']).toBeDefined();
    expect(CITY_TRAITS['London']).toBeDefined();
    expect(CITY_TRAITS['Berlin']).toBeDefined();
    expect(CITY_TRAITS['Chicago']).toBeDefined();
    expect(CITY_TRAITS['Houston']).toBeDefined();
    expect(CITY_TRAITS['New York City']).toBeDefined();
    expect(CITY_TRAITS['Los Angeles']).toBeDefined();
    expect(CITY_TRAITS['Toronto']).toBeDefined();
    expect(CITY_TRAITS['Sydney']).toBeDefined();
    expect(CITY_TRAITS['Tokyo']).toBeDefined();
  });

  it('Paris trait has all modifier fields defined', () => {
    const paris = CITY_TRAITS['Paris']!;
    expect(paris.name).toBe('Urban Density');
    expect(paris.description).toContain('Dense');
    expect(paris.modifiers.fireSpawnWeight).toBeGreaterThan(1);
    expect(paris.modifiers.emsSpawnWeight).toBeGreaterThan(1);
    expect(paris.modifiers.responseTimeDelta).toBeGreaterThan(0);
    expect(paris.modifiers.travelTimeMultiplier).toBeGreaterThan(1);
    expect(paris.modifiers.spawnRateMultiplier).toBeGreaterThan(1);
    expect(paris.modifiers.creditsMultiplier).toBeGreaterThan(1);
    expect(paris.modifiers.xpMultiplier).toBeGreaterThan(1);
  });

  it('Paris modifier values are within sane bounds', () => {
    const m = CITY_TRAITS['Paris']!.modifiers;
    // No modifier should double the baseline or halve it
    expect(m.fireSpawnWeight!).toBeLessThanOrEqual(2.0);
    expect(m.emsSpawnWeight!).toBeLessThanOrEqual(2.0);
    expect(m.travelTimeMultiplier!).toBeLessThanOrEqual(1.5);
    expect(m.spawnRateMultiplier!).toBeLessThanOrEqual(1.5);
    expect(m.creditsMultiplier!).toBeLessThanOrEqual(1.5);
    expect(m.xpMultiplier!).toBeLessThanOrEqual(1.3);
    // Response delta should be modest (seconds, not minutes)
    expect(m.responseTimeDelta!).toBeLessThanOrEqual(10);
  });
});

describe('getCityTrait', () => {
  it('returns the Paris trait for "Paris"', () => {
    const trait = getCityTrait('Paris');
    expect(trait).toBeDefined();
    expect(trait!.name).toBe('Urban Density');
  });

  it('returns the Paris trait for "Paris, FR"', () => {
    const trait = getCityTrait('Paris, FR');
    expect(trait).toBeDefined();
    expect(trait!.name).toBe('Urban Density');
  });

  it('returns the Paris trait for "Paris, France"', () => {
    const trait = getCityTrait('Paris, France');
    expect(trait).toBeDefined();
  });

  it('returns undefined for cities with no trait', () => {
    expect(getCityTrait('West Memphis, AR')).toBeUndefined();
    expect(getCityTrait('Memphis, TN')).toBeUndefined();
    expect(getCityTrait('Nashville, TN')).toBeUndefined();
    expect(getCityTrait('Little Rock, AR')).toBeUndefined();
    expect(getCityTrait('Toronto')).toBeDefined();
    expect(getCityTrait('Sydney')).toBeDefined();
    expect(getCityTrait('Tokyo')).toBeDefined();
  });

  it('returns undefined for null/undefined/empty', () => {
    expect(getCityTrait(null)).toBeUndefined();
    expect(getCityTrait(undefined)).toBeUndefined();
    expect(getCityTrait('')).toBeUndefined();
  });

  it('is case-sensitive (canonical names only)', () => {
    // The trait registry uses exact keys from cityProgression.ts
    expect(getCityTrait('paris')).toBeUndefined();
    expect(getCityTrait('PARIS')).toBeUndefined();
    expect(getCityTrait('Paris')).toBeDefined();
    expect(getCityTrait('London')).toBeDefined();
    expect(getCityTrait('Berlin')).toBeDefined();
    expect(getCityTrait('Chicago')).toBeDefined();
    expect(getCityTrait('Houston')).toBeDefined();
    expect(getCityTrait('New York City')).toBeDefined();
    expect(getCityTrait('Los Angeles')).toBeDefined();
    expect(getCityTrait('Toronto')).toBeDefined();
    expect(getCityTrait('Sydney')).toBeDefined();
  });
});

describe('cityTraits — trait structure', () => {
  it('every trait has a non-empty name and description', () => {
    for (const [city, trait] of Object.entries(CITY_TRAITS)) {
      expect(trait.name.length, `${city} name`).toBeGreaterThan(0);
      expect(trait.description.length, `${city} description`).toBeGreaterThan(0);
    }
  });

  it('every trait has at least one modifier defined', () => {
    for (const [city, trait] of Object.entries(CITY_TRAITS)) {
      const modCount = Object.values(trait.modifiers).filter(v => v !== undefined).length;
      expect(modCount, `${city} modifiers`).toBeGreaterThanOrEqual(1);
    }
  });

  it('fire/ems/police spawn weights are positive when defined', () => {
    for (const [city, trait] of Object.entries(CITY_TRAITS)) {
      const m = trait.modifiers;
      if (m.fireSpawnWeight !== undefined) expect(m.fireSpawnWeight, `${city} fire`).toBeGreaterThan(0);
      if (m.emsSpawnWeight !== undefined) expect(m.emsSpawnWeight, `${city} ems`).toBeGreaterThan(0);
      if (m.policeSpawnWeight !== undefined) expect(m.policeSpawnWeight, `${city} police`).toBeGreaterThan(0);
    }
  });

  it('multiplier fields are >= 0.5 when defined (no extreme debuffs)', () => {
    for (const [city, trait] of Object.entries(CITY_TRAITS)) {
      const m = trait.modifiers;
      for (const [key, val] of Object.entries(m)) {
        if (key === 'responseTimeDelta') continue; // additive, can be 0
        if (typeof val === 'number') {
          expect(val, `${city}.${key}`).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });
});
