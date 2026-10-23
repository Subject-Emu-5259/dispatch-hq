// ============================================
// Dispatch HQ — Settings persistence tests
// ============================================
// The settings module keeps module-level cache/hydration state, so every test
// re-imports it fresh (vi.resetModules) against mocked apiClient calls.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/lib/apiClient', () => ({
  getSettings,
  updateSettings,
}));

// Node's test env has no localStorage — provide a minimal in-memory shim.
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

const MIRROR_KEY = 'dhq_settings_v2';

async function freshSettings() {
  return import('./settings');
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  getSettings.mockReset();
  updateSettings.mockReset();
  updateSettings.mockResolvedValue({ success: true, settings: {} });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initSettings hydration', () => {
  it('uses the server row when one exists (authoritative source)', async () => {
    getSettings.mockResolvedValue({ settings: { soundEnabled: false, gameSpeed: 2 } });
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().soundEnabled).toBe(false);
    expect(s.loadSettings().gameSpeed).toBe(2);
    expect(s.getSettingsSource()).toBe('server');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('falls back to the local mirror — not defaults — when the server has no row, and self-heals the row', async () => {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ soundEnabled: false, gameSpeed: 2, darkMode: false }));
    getSettings.mockResolvedValue({ settings: null });
    const s = await freshSettings();
    await s.initSettings();
    // Mirror won over defaults.
    expect(s.loadSettings().soundEnabled).toBe(false);
    expect(s.loadSettings().gameSpeed).toBe(2);
    expect(s.getSettingsSource()).toBe('mirror');
    // The mirror was re-pushed so the next boot is clean.
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings.mock.calls[0][0]).toMatchObject({ soundEnabled: false, gameSpeed: 2 });
  });

  it('falls back to defaults when neither the server nor the mirror has settings', async () => {
    getSettings.mockResolvedValue({ settings: null });
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().soundEnabled).toBe(true); // DEFAULT
    expect(s.getSettingsSource()).toBe('defaults');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('keeps the mirror when hydration fails (offline / unauthenticated)', async () => {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ soundEnabled: false, missionPace: 'intense' }));
    getSettings.mockRejectedValue(new Error('Network down'));
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().soundEnabled).toBe(false);
    expect(s.loadSettings().missionPace).toBe('intense');
    expect(s.getSettingsSource()).toBe('mirror');
  });
});

describe('getMutualAidChance (v0.22.7 mutual-aid pace)', () => {
  it('returns the exact per-pace chance', async () => {
    const s = await freshSettings();
    expect(s.getMutualAidChance('off')).toBe(0);
    expect(s.getMutualAidChance('rare')).toBe(0.15);
    expect(s.getMutualAidChance('normal')).toBe(0.4);
    expect(s.getMutualAidChance('frequent')).toBe(0.7);
  });

  it('defaults to the normal pace when none is set (and off is a hard 0)', async () => {
    const s = await freshSettings();
    await s.initSettings();
    expect(s.getMutualAidChance()).toBe(0.4); // DEFAULTS.mutualAidPace === 'normal'
    s.saveSettings({ mutualAidPace: 'off' });
    expect(s.getMutualAidChance()).toBe(0);
  });

  it('falls back to normal for an unknown stored pace (legacy blob)', async () => {
    const s = await freshSettings();
    s.saveSettings({ mutualAidPace: 'sometimes' as never });
    expect(s.getMutualAidChance()).toBe(0.4);
  });
});

describe('mute-button behavior — subscribeSettings fan-out (v0.22 fix)', () => {
  it('toggling the sound setting updates the icon state on every subscribed surface', async () => {
    const s = await freshSettings();
    const topBarIcon = vi.fn();
    const cadIcon = vi.fn();
    const settingsToggle = vi.fn();
    const unsubTop = s.subscribeSettings((st) => topBarIcon(st.soundEnabled));
    const unsubCad = s.subscribeSettings((st) => cadIcon(st.soundEnabled));
    const unsubSettings = s.subscribeSettings((st) => settingsToggle(st.soundEnabled));

    // TopBar toggles mute → every surface's icon flips in the same tick.
    s.toggleSoundEnabled();
    expect(topBarIcon).toHaveBeenLastCalledWith(false);
    expect(cadIcon).toHaveBeenLastCalledWith(false);
    expect(settingsToggle).toHaveBeenLastCalledWith(false);

    // CAD console toggles back → fan-out again.
    s.toggleSoundEnabled();
    expect(topBarIcon).toHaveBeenLastCalledWith(true);
    expect(cadIcon).toHaveBeenLastCalledWith(true);
    expect(settingsToggle).toHaveBeenLastCalledWith(true);

    // Unsubscribed surfaces stop receiving (component unmount cleanup).
    unsubTop(); unsubCad(); unsubSettings();
    const callsBefore = topBarIcon.mock.calls.length;
    s.toggleSoundEnabled();
    expect(topBarIcon.mock.calls.length).toBe(callsBefore); // no further updates
  });

  it('fan-out delivers the merged live settings, not stale defaults', async () => {
    const s = await freshSettings();
    const seen: boolean[] = [];
    const unsub = s.subscribeSettings((st) => seen.push(st.soundEnabled));
    s.saveSettings({ soundEnabled: false });
    s.saveSettings({ soundEnabled: true });
    unsub();
    expect(seen).toEqual([false, true]);
  });
});

describe('mute-button behavior — toggleSoundEnabled reads the LIVE setting (v0.22 fix)', () => {
  it('computes the next value from loadSettings(), not a stale local state', async () => {
    const s = await freshSettings();
    // Default is ON.
    expect(s.loadSettings().soundEnabled).toBe(true);
    // Simulate the stale-local-state trap: the component's useState snapshot
    // (false) disagrees with the live cache (true) because hydration landed
    // after mount. handleSoundToggle must flip the LIVE value — not the stale
    // one.
    const staleLocalState = false; // what the icon's useState holds
    expect(staleLocalState).toBe(false);
    const next = s.toggleSoundEnabled();
    // If it had flipped staleLocalState, next would be true; live is true →
    // toggle must produce false.
    expect(next.soundEnabled).toBe(false);
    expect(s.loadSettings().soundEnabled).toBe(false);
    // And toggling again flips back to true (from live, again).
    expect(s.toggleSoundEnabled().soundEnabled).toBe(true);
  });

  it('returns the persisted settings so surfaces can update their icon state', async () => {
    const s = await freshSettings();
    const result = s.toggleSoundEnabled();
    expect(result.soundEnabled).toBe(false);
    expect(s.loadSettings().soundEnabled).toBe(false);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ soundEnabled: false }),
    );
  });
});

describe('saveSettings resilient writes', () => {
  it('writes through to the cache and mirror immediately and marks the source server', async () => {
    const s = await freshSettings();
    s.saveSettings({ soundEnabled: false });
    expect(s.loadSettings().soundEnabled).toBe(false);
    expect(s.getSettingsSource()).toBe('server');
    const mirrored = JSON.parse(localStorage.getItem(MIRROR_KEY)!);
    expect(mirrored.soundEnabled).toBe(false);
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

  it('retries a failed server write with backoff until it lands', async () => {
    updateSettings
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true, settings: {} });
    vi.useFakeTimers();
    const s = await freshSettings();
    s.saveSettings({ soundVolume: 0.25 });
    expect(updateSettings).toHaveBeenCalledTimes(1); // first attempt failed
    await vi.runAllTimersAsync(); // backoff timer fires → retry
    expect(updateSettings).toHaveBeenCalledTimes(2);
    expect(updateSettings.mock.calls[1][0]).toMatchObject({ soundVolume: 0.25 });
  });

  it('never drops the newest snapshot when writes overlap', async () => {
    let releaseFirst!: () => void;
    updateSettings.mockImplementationOnce(() => new Promise<void>((r) => { releaseFirst = r; }));
    const s = await freshSettings();
    s.saveSettings({ soundEnabled: false }); // write 1 starts, hangs
    s.saveSettings({ soundEnabled: true });  // supersedes while in flight
    releaseFirst();
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
    // The second write carried the newest value.
    expect(updateSettings.mock.calls[1][0]).toMatchObject({ soundEnabled: true });
  });
});
