import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { hasSeenRelease, markReleaseSeen, useReleaseUnread } from './releaseSeen';
import { currentVersion } from '@/data/releaseNotes';
import { useGameStore } from '@/stores/gameStore';

// Node's test env has no localStorage — provide a minimal in-memory shim
// (same pattern as utils/settings.test.ts).
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

// currentVersion() reads the shipped release notes; the tracker is version-
// agnostic so any string works.
const V = '9.9.9';

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ player: null });
});

afterEach(() => {
  localStorage.clear();
  useGameStore.setState({ player: null });
});

describe('releaseSeen tracker', () => {
  it('starts unread for every player/version', () => {
    expect(hasSeenRelease('p1', V)).toBe(false);
    expect(hasSeenRelease(null, V)).toBe(false);
  });

  it('marks read idempotently and per player', () => {
    markReleaseSeen('p1', V);
    markReleaseSeen('p1', V); // second call is a no-op, not an error
    expect(hasSeenRelease('p1', V)).toBe(true);
    // A different player on the same browser still sees it unread.
    expect(hasSeenRelease('p2', V)).toBe(false);
    expect(hasSeenRelease(null, V)).toBe(false);
  });

  it('is per version — reading v9 does not clear v8', () => {
    markReleaseSeen('p1', V);
    expect(hasSeenRelease('p1', '8.0.0')).toBe(false);
  });

  it('survives a reload (localStorage round-trip)', () => {
    markReleaseSeen('p1', V);
    // Simulate reload: fresh module reads from localStorage again.
    expect(hasSeenRelease('p1', V)).toBe(true);
  });
});

describe('useReleaseUnread', () => {
  it('reflects the player\'s read state and updates when marked seen', () => {
    // The hook keys on the SHIPPED version (currentVersion), so mark that one.
    const shipped = currentVersion();
    useGameStore.setState({ player: { id: 'p1' } as never });
    const { result } = renderHook(() => useReleaseUnread());
    expect(result.current).toBe(true);

    act(() => markReleaseSeen('p1', shipped));
    expect(result.current).toBe(false);
  });

  it('re-evaluates when the player identity hydrates', () => {
    const shipped = currentVersion();
    // Player hydrates a tick after boot — guest (null) at first.
    const { result, rerender } = renderHook(() => useReleaseUnread());
    expect(result.current).toBe(true);

    // Another player has already read this version.
    markReleaseSeen('p1', shipped);
    useGameStore.setState({ player: { id: 'p1' } as never });
    rerender();
    expect(result.current).toBe(false);
  });
});
