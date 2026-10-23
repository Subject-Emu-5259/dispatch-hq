import { describe, it, expect } from 'vitest';
import { getWeatherEffects, weatherSecondsLeft, weatherProgress } from './weather';

describe('weather effects', () => {
  it('storm boosts road + water calls', () => {
    const e = getWeatherEffects('storm');
    expect(e.roadBias).toBeGreaterThan(1);
    expect(e.waterBias).toBeGreaterThan(1);
    expect(e.responseSpeedMult).toBe(1);
  });

  it('fog slows response', () => {
    expect(getWeatherEffects('fog').responseSpeedMult).toBeLessThan(1);
  });

  it('heatwave boosts medical + fire', () => {
    const e = getWeatherEffects('heatwave');
    expect((e.spawnWeights.ems ?? 1)).toBeGreaterThan(1);
    expect((e.spawnWeights.fire ?? 1)).toBeGreaterThan(1);
  });

  it('clear is neutral', () => {
    const e = getWeatherEffects('clear');
    expect(e.roadBias).toBe(1);
    expect(e.waterBias).toBe(1);
    expect(e.responseSpeedMult).toBe(1);
    expect(e.spawnWeights).toEqual({});
  });
});

describe('weather status strip helpers (v0.22.16)', () => {
  const event = {
    id: 'storm' as const,
    name: 'Severe Thunderstorm',
    icon: '⛈️',
    effect: '+30% response time',
    startedAt: 0,
    duration: 120, // seconds
  };

  it('counts down from the spawn time and clamps at zero', () => {
    expect(weatherSecondsLeft(event, 0)).toBe(120);
    expect(weatherSecondsLeft(event, 30_000)).toBe(90);
    expect(weatherSecondsLeft(event, 119_999)).toBe(1);
    expect(weatherSecondsLeft(event, 120_000)).toBe(0);
    expect(weatherSecondsLeft(event, 5 * 60_000)).toBe(0);
    expect(weatherSecondsLeft(null, 0)).toBe(0);
  });

  it('tracks elapsed progress 0 → 100', () => {
    expect(weatherProgress(event, 0)).toBe(0);
    expect(weatherProgress(event, 60_000)).toBe(50);
    expect(weatherProgress(event, 120_000)).toBe(100);
    expect(weatherProgress(event, 3 * 60_000)).toBe(100); // clamped
    expect(weatherProgress(null, 0)).toBe(0);
  });
});
