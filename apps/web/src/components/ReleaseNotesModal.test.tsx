import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { useGameStore } from '@/stores/gameStore';
import { hasSeenRelease } from '@/lib/releaseSeen';
import { currentVersion } from '@/data/releaseNotes';

// These tests lock the v0.23.1 hotfix: before the fix the modal accepted
// `isOpen` but never read it, so it was permanently mounted over the main
// menu and gameplay and could never be closed ("stuck, can't exit, cleared
// cookies, still there"). Opening the notes must also mark the version seen
// so the What's New unread dot clears (the releaseSeen contract).

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
  useGameStore.setState({ player: null });
});

describe('ReleaseNotesModal', () => {
  it('renders nothing when closed (isOpen=false) — the stuck-modal regression', () => {
    const { container } = render(<ReleaseNotesModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the notes when open', () => {
    render(<ReleaseNotesModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Release Notes' })).toBeTruthy();
    // The version chip in the header comes from the shipped release notes.
    expect(screen.getByText(currentVersion())).toBeTruthy();
  });

  it('unmounts when isOpen flips to false (close actually closes)', () => {
    const { rerender, container } = render(<ReleaseNotesModal isOpen={true} onClose={() => {}} />);
    expect(container.firstChild).not.toBeNull();
    rerender(<ReleaseNotesModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('marks the version seen on open so the What\'s New dot clears', () => {
    useGameStore.setState({ player: { id: 'p1' } as never });
    const shipped = currentVersion();
    expect(hasSeenRelease('p1', shipped)).toBe(false);

    const { rerender } = render(<ReleaseNotesModal isOpen={false} onClose={() => {}} />);
    rerender(<ReleaseNotesModal isOpen={true} onClose={() => {}} />);
    expect(hasSeenRelease('p1', shipped)).toBe(true);
  });
});
