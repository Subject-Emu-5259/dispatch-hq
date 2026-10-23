import { describe, it, expect } from 'vitest';
import type { Station } from '@dispatch-hq/shared';
import { generateEmployee, generateTraits } from './employees';

function station(over: Partial<Station> = {}): Station {
  return {
    id: 's1',
    ownerId: 'p1',
    type: 'fire_station',
    level: 2,
    name: 'Station 1',
    position: { lat: 35.14, lng: -90.18 },
    capacity: 5,
    unitCount: 1,
    coverageRadius: 5,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe('generateTraits', () => {
  it('returns 0–2 unique traits drawn from the pool', () => {
    for (let i = 0; i < 200; i++) {
      const traits = generateTraits();
      expect(traits.length).toBeLessThanOrEqual(2);
      expect(new Set(traits).size).toBe(traits.length);
    }
  });

  it('eventually produces the mechanical traits (Hardened / Steady / Energized)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const t of generateTraits()) seen.add(t);
    }
    expect(seen.has('Hardened')).toBe(true);
    expect(seen.has('Steady')).toBe(true);
    expect(seen.has('Energized')).toBe(true);
  });
});

describe('generateEmployee — trait defaults', () => {
  it('always initializes fatigue 0 / morale 100 and valid traits', () => {
    for (let i = 0; i < 50; i++) {
      const e = generateEmployee(station());
      expect(e.fatigue).toBe(0);
      expect(e.morale).toBe(100);
      expect(e.traits!.length).toBeLessThanOrEqual(2);
    }
  });
});
