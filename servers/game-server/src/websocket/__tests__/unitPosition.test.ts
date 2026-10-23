import { describe, it, expect } from 'vitest';
import { unitSpeedOk, withinThrottle, viewportContains, haversineKm } from '../unitPosition';

describe('unit position validation', () => {
  it('accepts a legit highway move', () => {
    // 1.5 km in 90s at ~60 km/h
    expect(unitSpeedOk({ lat: 35.1, lng: -90.1, at: 0 }, { lat: 35.1135, lng: -90.1, at: 90000 })).toBe(true);
  });

  it('rejects teleports over the speed cap', () => {
    // ~22 km in 0.1s
    expect(unitSpeedOk({ lat: 35.1, lng: -90.1, at: 0 }, { lat: 35.3, lng: -90.1, at: 100 })).toBe(false);
  });

  it('throttles to one update per 500ms', () => {
    expect(withinThrottle(1000, 1100)).toBe(true);   // 100ms since last → throttled
    expect(withinThrottle(1000, 1600)).toBe(false);  // 600ms → allowed
    expect(withinThrottle(undefined, 0)).toBe(false); // first ever update → allowed
  });

  it('viewportContains is radius-aware', () => {
    const v = { lat: 35.1, lng: -90.1, radiusKm: 5 };
    expect(viewportContains(v, { lat: 35.11, lng: -90.1 })).toBe(true);
    expect(viewportContains(v, { lat: 35.2, lng: -90.1 })).toBe(false);
  });

  it('haversineKm returns ~1km for a 0.01 deg lat step', () => {
    const km = haversineKm({ lat: 35.0, lng: -90.0 }, { lat: 35.01, lng: -90.0 });
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.2);
  });
});
