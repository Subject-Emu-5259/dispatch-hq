import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasCompletedTutorial, markTutorialCompleted } from './tutorialSeen';

// Node's test env has no localStorage — provide a minimal in-memory shim
// (same pattern as utils/settings.test.ts / releaseSeen.test.ts).
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('tutorialSeen marker', () => {
  it('starts incomplete for every account', () => {
    expect(hasCompletedTutorial('p1')).toBe(false);
    expect(hasCompletedTutorial(null)).toBe(false);
    expect(hasCompletedTutorial(undefined)).toBe(false);
  });

  it('marks complete idempotently and per account', () => {
    markTutorialCompleted('p1');
    markTutorialCompleted('p1'); // second call is a no-op, not an error
    expect(hasCompletedTutorial('p1')).toBe(true);
    // A different account on the same browser still gets the tour.
    expect(hasCompletedTutorial('p2')).toBe(false);
    expect(hasCompletedTutorial(null)).toBe(false);
  });

  it('treats the guest fallback as its own key', () => {
    markTutorialCompleted(null);
    expect(hasCompletedTutorial(null)).toBe(true);
    expect(hasCompletedTutorial(undefined)).toBe(true); // same 'guest' key
    expect(hasCompletedTutorial('guest_abc@dispatchhq.game')).toBe(false);
  });

  it('survives a reload (localStorage round-trip)', () => {
    markTutorialCompleted('p1');
    // Simulate reload: fresh read hits localStorage again.
    expect(hasCompletedTutorial('p1')).toBe(true);
  });
});
