// Batch 1 (main menu change): the Facebook entry is DELETED (not hidden) and
// the Reddit button spans the full row width (single-column section).
// Renders the real menu and asserts on the real anchors + layout class —
// not on the source text.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MainMenu } from './MainMenu';
import { useGameStore } from '@/stores/gameStore';

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

const props = {
  onContinue: () => {},
  onPlay: () => {},
  onSettings: () => {},
  onLoadGame: () => {},
  onDeleteSlot: () => {},
  onLogout: () => {},
};

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ player: { id: 'p1', username: 'tester', level: 1, credits: 100, coins: 0, xp: 0 } as never });
});

describe('MainMenu community section (Batch 1)', () => {
  it('has NO Facebook link anywhere in the menu', () => {
    const { container } = render(<MainMenu {...props} />);
    const anchors = [...container.querySelectorAll('a[href]')];
    expect(anchors.some((a) => (a.getAttribute('href') ?? '').includes('facebook.com'))).toBe(false);
  });

  it('has exactly one community link: Reddit, with the unchanged href', () => {
    const { container } = render(<MainMenu {...props} />);
    const reddit = [...container.querySelectorAll('a[href]')].filter(
      (a) => a.getAttribute('href') === 'https://www.reddit.com/r/DispatchHQ/',
    );
    expect(reddit).toHaveLength(1);
    expect(reddit[0].textContent).toMatch(/Reddit/);
  });

  it('the community link grid is single-column (Reddit spans the full row)', () => {
    const { container } = render(<MainMenu {...props} />);
    const reddit = container.querySelector('a[href="https://www.reddit.com/r/DispatchHQ/"]');
    expect(reddit).toBeTruthy();
    const grid = reddit!.parentElement!;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).not.toMatch(/grid-cols-2/);
  });

  it('the section comment copy no longer promises Facebook', () => {
    render(<MainMenu {...props} />);
    expect(screen.queryByText(/Facebook & Reddit/)).toBeNull();
  });
});
