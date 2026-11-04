// City-select fix (Dre's live report, r/DispatchHQ screenshot): the "Choose
// Your City" screen clipped at both ends (heading cut at the top, cities
// unreachable at the bottom), had NO back control on the city step, and
// search was dead (Enter did nothing, empty results rendered nothing).
// Renders the real screen and asserts on the real DOM — not on source text.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CitySelectionScreen } from './CitySelectionScreen';
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

const baseProps = {
  onGameStart: () => {},
};

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({
    player: { id: 'p1', username: 'tester', level: 1, credits: 10000, coins: 0, xp: 0 } as never,
    stations: [] as never,
    units: [] as never,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CitySelectionScreen scroll + heading', () => {
  it('the screen root scrolls (overflow-y-auto, no flex-centering clip)', () => {
    const { container } = render(<CitySelectionScreen {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/overflow-y-auto/);
    expect(root.className).not.toMatch(/flex items-center justify-center/);
  });

  it('no overflow-hidden ancestor stands between the heading and the scroll root', () => {
    const { container } = render(<CitySelectionScreen {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    const heading = screen.getByText('Choose Your City');
    let el: HTMLElement | null = heading.parentElement;
    while (el && el !== root) {
      expect(el.className).not.toMatch(/overflow-hidden/);
      el = el.parentElement;
    }
    expect(el).toBe(root);
  });

  it('search box and the full popular roster render (18 cities incl. the ones cut off in the screenshot)', () => {
    render(<CitySelectionScreen {...baseProps} />);
    expect(screen.getByPlaceholderText('Search for a city...')).toBeTruthy();
    for (const name of ['West Memphis, AR', 'Memphis, TN', 'St. Louis, MO', 'Seattle, WA', 'Paris', 'Sydney', 'Toronto', 'Berlin']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });
});

describe('CitySelectionScreen back control', () => {
  it('shows a Back button on the city step and it calls onBack', () => {
    const onBack = vi.fn();
    render(<CitySelectionScreen {...baseProps} onBack={onBack} />);
    const back = screen.getByText('← Back');
    expect(back).toBeTruthy();
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows no Back button on the city step when no onBack is wired', () => {
    render(<CitySelectionScreen {...baseProps} />);
    expect(screen.queryByText('← Back')).toBeNull();
  });
});

describe('CitySelectionScreen search', () => {
  it('typing filters the roster instantly (no network needed)', () => {
    render(<CitySelectionScreen {...baseProps} />);
    const input = screen.getByPlaceholderText('Search for a city...');
    fireEvent.change(input, { target: { value: 'toronto' } });
    // Grid card + dropdown match: Toronto appears twice.
    expect(screen.getAllByText('Toronto')).toHaveLength(2);
  });

  it('Enter confirms the first match (city step advances to service)', () => {
    render(<CitySelectionScreen {...baseProps} />);
    const input = screen.getByPlaceholderText('Search for a city...');
    fireEvent.change(input, { target: { value: 'toronto' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Choose Your Service')).toBeTruthy();
  });

  it('remote results render for a non-roster city', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{
        place_id: 1,
        display_name: 'Springfield, Greene County, Missouri, United States',
        lat: '37.2089',
        lon: '-93.2923',
        address: { state: 'Missouri', country: 'United States' },
      }],
    })));
    render(<CitySelectionScreen {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('Search for a city...'), { target: { value: 'springfield' } });
    expect(await screen.findByText('Springfield', {}, { timeout: 3000 })).toBeTruthy();
  });

  it('a search with no matches says so honestly instead of showing nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<CitySelectionScreen {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('Search for a city...'), { target: { value: 'zqxjk' } });
    expect(await screen.findByText(/No cities found/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it('a failed remote search still shows local matches plus the error line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    render(<CitySelectionScreen {...baseProps} />);
    fireEvent.change(screen.getByPlaceholderText('Search for a city...'), { target: { value: 'toronto' } });
    expect(screen.getAllByText('Toronto')).toHaveLength(2);
    expect(await screen.findByText(/Search failed/, {}, { timeout: 3000 })).toBeTruthy();
  });
});
