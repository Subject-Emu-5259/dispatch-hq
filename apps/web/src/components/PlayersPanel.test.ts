import { describe, it, expect } from 'vitest';
import { presenceIsNear, sortPresenceNearYou } from './PlayersPanel';
import type { OnlinePlayerPresence } from '@dispatch-hq/shared';

// West Memphis downtown (player's viewport: center 35.15/-90.05, radius 4 km).
const ME = { city: 'West Memphis', view: { lat: 35.15, lng: -90.05, radiusKm: 4 } };

const p = (id: string, over: Partial<OnlinePlayerPresence> = {}): OnlinePlayerPresence => ({
  playerId: id,
  username: id,
  allianceId: null,
  level: 5,
  city: null,
  activity: 'idle',
  ...over,
});

describe('presenceIsNear — "near you" test (v0.22.18)', () => {
  it('flags same-city commanders regardless of viewport', () => {
    // Far away in the same city (no viewport at all) → still near.
    expect(presenceIsNear(p('x', { city: 'West Memphis' }), ME)).toBe(true);
  });

  it('flags viewport-overlapping commanders in a different city', () => {
    // ~3.5 km from my center → inside my 4 km radius → near.
    const overlapping = p('y', { city: 'Marion', view: { lat: 35.18, lng: -90.05, radiusKm: 3 } });
    expect(presenceIsNear(overlapping, ME)).toBe(true);
  });

  it('rejects commanders far away in another city', () => {
    // ~1000 km away in Nashville → far.
    const far = p('z', { city: 'Nashville', view: { lat: 36.16, lng: -86.78, radiusKm: 10 } });
    expect(presenceIsNear(far, ME)).toBe(false);
  });

  it('falls back to false when neither city nor viewport is known', () => {
    expect(presenceIsNear(p('q'), { city: null, view: null })).toBe(false);
  });
});

describe('sortPresenceNearYou — nearby first, level desc within groups', () => {
  it('orders near before far and keeps each group level-sorted', () => {
    const nearLow = p('a', { city: 'West Memphis', level: 3 });
    const nearHigh = p('b', { city: 'West Memphis', level: 12 });
    const farHigh = p('c', { city: 'Nashville', level: 20, view: { lat: 36.16, lng: -86.78, radiusKm: 10 } });
    const { near, far } = sortPresenceNearYou([farHigh, nearLow, nearHigh], ME);
    expect(near.map((x) => x.playerId)).toEqual(['b', 'a']);
    expect(far.map((x) => x.playerId)).toEqual(['c']);
  });

  it('puts viewport-overlapping strangers in the near group too', () => {
    const overlapper = p('o', { city: 'Marion', level: 8, view: { lat: 35.18, lng: -90.05, radiusKm: 2 } });
    const stranger = p('s', { city: 'Nashville', level: 9, view: { lat: 36.16, lng: -86.78, radiusKm: 10 } });
    const { near, far } = sortPresenceNearYou([stranger, overlapper], ME);
    expect(near.map((x) => x.playerId)).toEqual(['o']);
    expect(far.map((x) => x.playerId)).toEqual(['s']);
  });
});
