import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectionManager } from '../connectionManager';

/** Minimal fake WSContext that records JSON payloads sent through it. */
function fakeWs() {
  const sent: string[] = [];
  const ws = {
    send: (s: string) => { sent.push(s); },
    close: () => {},
  };
  return { ws, sent };
}

const pos = { type: 'unit_position' as const, unitId: 'u1', lat: 35.1, lng: -90.1, speedKmh: 40, heading: 90 };

describe('connectionManager unit-position relay', () => {
  const near = fakeWs();
  const far = fakeWs();
  const sender = fakeWs();

  beforeAll(() => {
    connectionManager.addConnection('near', near.ws as any, { username: 'N', allianceId: null });
    connectionManager.addConnection('far', far.ws as any, { username: 'F', allianceId: null });
    connectionManager.addConnection('sender', sender.ws as any, { username: 'S', allianceId: null });
    connectionManager.updateViewport('near', { lat: 35.1, lng: -90.1 }, 5);
    connectionManager.updateViewport('far', { lat: 40.0, lng: -100.0 }, 5);
    // The sender's own viewport contains the unit — delivery must still skip them.
    connectionManager.updateViewport('sender', { lat: 35.105, lng: -90.1 }, 5);
  });

  afterAll(() => {
    connectionManager.removeConnection('near');
    connectionManager.removeConnection('far');
    connectionManager.removeConnection('sender');
  });

  it('validates and assigns a monotonic seq per unit', () => {
    const b1 = connectionManager.validateUnitPosition('sender', pos, 1000);
    expect(b1).not.toBeNull();
    expect(b1!.seq).toBe(1);
    expect(b1!.playerId).toBe('sender');

    // Inside the 500ms throttle window → dropped.
    expect(connectionManager.validateUnitPosition('sender', pos, 1300)).toBeNull();

    // Next allowed update continues the sequence.
    const b2 = connectionManager.validateUnitPosition('sender', pos, 1600);
    expect(b2).not.toBeNull();
    expect(b2!.seq).toBe(2);
  });

  it('drops teleports over the speed cap (after an accepted first sample)', () => {
    const unitId = 'u-tp';
    // First ever sample is always accepted (no baseline to compare against).
    expect(connectionManager.validateUnitPosition('sender', { ...pos, unitId }, 4000)).not.toBeNull();
    // 600ms later (past the throttle) a ~33km jump fails the speed cap.
    const teleport = { ...pos, unitId, lat: 35.4, lng: -90.1 };
    expect(connectionManager.validateUnitPosition('sender', teleport, 4600)).toBeNull();
  });

  it('delivers only to local viewport-covered players, never the sender', () => {
    const b = connectionManager.validateUnitPosition('sender', { ...pos, unitId: 'u2' }, 2000)!;
    expect(b).not.toBeNull();
    connectionManager.deliverUnitPosition(b);

    expect(near.sent).toHaveLength(1);   // inside the viewport
    expect(sender.sent).toHaveLength(0); // sender excluded despite own viewport
    expect(far.sent).toHaveLength(0);    // outside the viewport

    const delivered = JSON.parse(near.sent[0]);
    expect(delivered).toMatchObject({ type: 'unit_position', unitId: 'u2', playerId: 'sender', seq: b.seq });
  });

  it('carries each commander\'s viewport in the presence roster for near-you sorting', () => {
    // 'near' and 'far' have viewports set in beforeAll; 'sender' too.
    const byId = new Map(connectionManager.getPresence().map((p) => [p.playerId, p]));
    expect(byId.get('near')?.view).toEqual({ lat: 35.1, lng: -90.1, radiusKm: 5 });
    expect(byId.get('far')?.view).toEqual({ lat: 40.0, lng: -100.0, radiusKm: 5 });
    expect(byId.get('sender')?.view).toEqual({ lat: 35.105, lng: -90.1, radiusKm: 5 });
  });
});
