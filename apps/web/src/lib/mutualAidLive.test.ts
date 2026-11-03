// Batch 3c — live mutual aid: split math, CLEARED BY credit, accept/clear guards.
// Real behavior on the pure rules (the WS relay itself is server code, covered
// by the route/handler reading + Dre's live playtest, not by this file).
import { describe, it, expect } from 'vitest';
import {
  splitAidReward, clearedByCredit, validateAidRequest, acceptAidRequest, clearAidRequest,
  type AidRequest,
} from './mutualAidLive';

const base: AidRequest = {
  missionId: 'm1', missionName: 'Structure Fire', city: 'Memphis, TN',
  requesterId: 'p1', requesterName: 'Alice', helperIds: [], helperNames: [], status: 'open',
};

describe('splitAidReward', () => {
  it('no helper: requester keeps everything', () => {
    expect(splitAidReward(1000, 100, 0)).toEqual({ requester: { credits: 1000, xp: 100 }, helpers: [] });
  });
  it('one helper: 60/40 split, totals never exceed the reward', () => {
    const s = splitAidReward(1000, 100, 1);
    expect(s.requester).toEqual({ credits: 600, xp: 60 });
    expect(s.helpers).toEqual([{ credits: 400, xp: 40 }]);
    expect(s.requester.credits + s.helpers[0].credits).toBe(1000);
    expect(s.requester.xp + s.helpers[0].xp).toBe(100);
  });
  it('two helpers: 40% split evenly, flooring remainder to requester', () => {
    const s = splitAidReward(1001, 101, 2);
    expect(s.helpers).toEqual([{ credits: 200, xp: 20 }, { credits: 200, xp: 20 }]);
    expect(s.requester.credits + 400).toBeLessThanOrEqual(1001);
    expect(s.requester.credits).toBe(601);
    expect(s.requester.xp).toBe(61);
  });
});

describe('clearedByCredit', () => {
  it('renders the card credit line', () => {
    expect(clearedByCredit(['Bob'])).toBe('CLEARED BY Bob');
    expect(clearedByCredit([])).toBe('');
  });
});

describe('aid request lifecycle', () => {
  it('validation rejects blank fields', () => {
    expect(validateAidRequest({ missionId: '', missionName: 'X', city: 'Y', requesterId: 'p' })).toBeTruthy();
    expect(validateAidRequest({ missionId: 'm', missionName: 'X', city: 'Y', requesterId: 'p' })).toBeNull();
  });
  it('self-accept and double-accept are rejected', () => {
    expect(acceptAidRequest(base, 'p1', 'Alice')).toHaveProperty('error');
    const ok = acceptAidRequest(base, 'p2', 'Bob');
    expect('request' in ok && ok.request.status).toBe('accepted');
    const again = acceptAidRequest((ok as { request: AidRequest }).request, 'p2', 'Bob');
    expect(again).toHaveProperty('error');
  });
  it('only an accepted helper can clear; full flow ends cleared', () => {
    const accepted = (acceptAidRequest(base, 'p2', 'Bob') as { request: AidRequest }).request;
    expect(clearAidRequest(accepted, 'Carol')).toHaveProperty('error');
    expect(clearAidRequest(base, 'Bob')).toHaveProperty('error'); // still open, not accepted
    const cleared = clearAidRequest(accepted, 'Bob') as { request: AidRequest };
    expect(cleared.request.status).toBe('cleared');
    expect(clearedByCredit(cleared.request.helperNames)).toBe('CLEARED BY Bob');
  });
});
