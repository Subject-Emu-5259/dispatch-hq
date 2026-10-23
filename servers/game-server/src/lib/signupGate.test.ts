// ============================================
// Dispatch HQ — New-Signup Gate Tests
// ============================================
// Pure-logic coverage of the founder-controlled new-account switch: defaults
// to OPEN (signups allowed — the gate is off out of the box), closes on an
// explicit flip, records the change timestamp, and honors an armed auto-reopen
// (the gate flips itself open the moment reopensAt passes).

import { describe, it, expect } from 'vitest';
import { getSignupGateState, areSignupsOpen, setSignupGate } from './signupGate';

describe('new-signup gate', () => {
  it('starts open (signups allowed) by default — the gate is OFF out of the box', () => {
    expect(areSignupsOpen()).toBe(true);
    expect(getSignupGateState()).toEqual({ open: true, since: null, reopensAt: null });
  });

  it('closes when the founder pauses signups', () => {
    setSignupGate(false);
    const next = getSignupGateState();
    expect(areSignupsOpen()).toBe(false);
    expect(next.open).toBe(false);
    expect(next.reopensAt).toBeNull();
    expect(typeof next.since).toBe('string');
  });

  it('records the timestamp of the LAST change', async () => {
    setSignupGate(false);
    const closed = getSignupGateState();
    await new Promise((r) => setTimeout(r, 5));
    setSignupGate(true);
    const reopened = getSignupGateState();
    expect(reopened.open).toBe(true);
    // The since stamp reflects the reopen, not the close.
    expect(reopened.since !== closed.since).toBe(true);
  });

  it('reopens signups with another flip', () => {
    setSignupGate(false);
    expect(areSignupsOpen()).toBe(false);
    setSignupGate(true);
    expect(areSignupsOpen()).toBe(true);
  });

  it('arms an auto-reopen and flips open lazily once the deadline passes', async () => {
    const inMs = 60;
    const at = new Date(Date.now() + inMs).toISOString();
    setSignupGate(false, at);
    expect(getSignupGateState().reopensAt).toBe(at);
    expect(areSignupsOpen()).toBe(false);
    await new Promise((r) => setTimeout(r, inMs + 20));
    // The next read applies the lazy auto-reopen.
    expect(areSignupsOpen()).toBe(true);
    expect(getSignupGateState().reopensAt).toBeNull();
  });

  it('honors a past deadline as reopen immediately', () => {
    const past = new Date(Date.now() - 5000).toISOString();
    setSignupGate(false, past);
    expect(areSignupsOpen()).toBe(true);
  });

  it('clears the armed reopen when manually reopening', () => {
    const at = new Date(Date.now() + 60000).toISOString();
    setSignupGate(false, at);
    expect(getSignupGateState().reopensAt).toBe(at);
    setSignupGate(true);
    expect(getSignupGateState().reopensAt).toBeNull();
  });
});
