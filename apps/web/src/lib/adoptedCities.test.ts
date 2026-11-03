import { describe, it, expect } from 'vitest';
import {
  MAX_ADOPTED_CITIES, ADOPTED_CITY_MISSIONS_PER_LEVEL, adoptedCityLevel, isAdopted,
  adoptCity, recordAdoptedCityMission, adoptedCityProgress, parseAdoptedCities,
  type AdoptedCity,
} from './adoptedCities';

describe('adoptedCities (Batch 3b)', () => {
  it('adopts, dedups, and tracks local progression', () => {
    const t0 = '2026-11-03T00:00:00.000Z';
    let list = adoptCity([], { name: 'Springfield', lat: 39.7, lng: -89.6 }, t0);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Springfield', missionsCompleted: 0, localLevel: 1 });
    expect(isAdopted(list, 'springfield')).toBe(true);
    // Re-adopt refreshes lastPlayedAt, never resets progression.
    list = recordAdoptedCityMission(list, 'Springfield', t0);
    list = adoptCity(list, { name: 'SPRINGFIELD', lat: 39.7, lng: -89.6 }, '2026-11-04T00:00:00.000Z');
    expect(list).toHaveLength(1);
    expect(list[0].missionsCompleted).toBe(1);
    expect(list[0].lastPlayedAt).toBe('2026-11-04T00:00:00.000Z');
    expect(adoptedCityProgress(list, 'Springfield')?.localLevel).toBe(1);
  });

  it('levels locally every 25 missions and ignores unadopted cities', () => {
    expect(ADOPTED_CITY_MISSIONS_PER_LEVEL).toBe(25);
    expect(adoptedCityLevel(0)).toBe(1);
    expect(adoptedCityLevel(24)).toBe(1);
    expect(adoptedCityLevel(25)).toBe(2);
    expect(adoptedCityLevel(50)).toBe(3);
    const list = adoptCity([], { name: 'A-Town', lat: 1, lng: 2 });
    const untouched = recordAdoptedCityMission(list, 'Nowhere');
    expect(untouched).toEqual(list);
    expect(adoptedCityProgress(list, 'Nowhere')).toBeNull();
  });

  it('caps the atlas by retiring the least-recently-played base', () => {
    let list: AdoptedCity[] = [];
    for (let i = 0; i < MAX_ADOPTED_CITIES; i++) {
      list = adoptCity(list, { name: `City${i}`, lat: i, lng: i }, `2026-11-0${(i % 9) + 1}T00:00:00.000Z`);
    }
    expect(list).toHaveLength(MAX_ADOPTED_CITIES);
    list = adoptCity(list, { name: 'New City', lat: 0, lng: 0 }, '2026-11-09T00:00:00.000Z');
    expect(list).toHaveLength(MAX_ADOPTED_CITIES);
    expect(isAdopted(list, 'New City')).toBe(true);
  });

  it('survives a JSON save/load round-trip and drops malformed rows', () => {
    const list = adoptCity([], { name: 'Springfield', lat: 39.7, lng: -89.6 }, '2026-11-03T00:00:00.000Z');
    const roundTripped = parseAdoptedCities(JSON.parse(JSON.stringify(list)));
    expect(roundTripped).toEqual(list);
    expect(parseAdoptedCities([{ name: 'Bad' }, null, 'x', { name: 'Good', lat: 1, lng: 2 }])).toHaveLength(1);
    expect(parseAdoptedCities(undefined)).toEqual([]);
  });
});
