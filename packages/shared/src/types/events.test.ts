import { describe, it, expect } from 'vitest';
import { isUnitPositionBroadcast, isNewerSeq } from './events';

describe('unit position messages', () => {
  it('accepts a valid broadcast shape', () => {
    expect(isUnitPositionBroadcast({ type: 'unit_position', unitId: 'u', playerId: 'p', lat: 1, lng: 2, heading: 90, seq: 3 })).toBe(true);
  });

  it('rejects non-broadcast messages', () => {
    expect(isUnitPositionBroadcast({ type: 'presence', count: 2 } as any)).toBe(false);
    expect(isUnitPositionBroadcast(null)).toBe(false);
    expect(isUnitPositionBroadcast('unit_position')).toBe(false);
    expect(isUnitPositionBroadcast({ type: 'unit_position', unitId: 'u' })).toBe(false);
  });

  it('isNewerSeq drops stale', () => {
    expect(isNewerSeq(5, 3)).toBe(true);
    expect(isNewerSeq(3, 5)).toBe(false);
    expect(isNewerSeq(0, 0)).toBe(true);
    expect(isNewerSeq(1, undefined)).toBe(true);
  });
});
