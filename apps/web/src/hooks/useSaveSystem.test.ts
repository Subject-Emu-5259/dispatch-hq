import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SAVE_SLOT_IDS, SLOT_LABELS,
  getActiveSlot, setActiveSlot, normalizeSlot,
  sortLegacyForMigration, pickMigrationTargets,
  derivePreviewFromPayload,
  wasSessionActive, markSessionActive, clearSessionActive,
  saveGame, loadGame,
} from './useSaveSystem';
import { loadSave as mockLoadSave, storeSave as mockStoreSave } from '@/lib/apiClient';
import { useGameStore } from '@/stores/gameStore';
import type { SaveSlot } from '@/lib/apiClient';

// The save/load functions hit the API client — stub it so these tests assert
// the guard logic (never write/load a campaign-less snapshot) without a server.
vi.mock('@/lib/apiClient', () => ({
  getSaveSlots: vi.fn(async () => []),
  loadSave: vi.fn(),
  storeSave: vi.fn(),
  deleteSave: vi.fn(),
  API_BASE: '/api',
}));

// This test environment does not wire up jsdom's localStorage — provide a
// minimal in-memory shim so the active-slot helpers behave like a browser.
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

const ACTIVE_KEY = 'dhq_active_slot_v7';

beforeEach(() => {
  localStorage.clear();
});

function legacyRow(slot: string, updatedAt: string): SaveSlot {
  return { slot, updatedAt };
}

describe('slots 1–3', () => {
  it('exposes exactly three labelled slots', () => {
    expect(SAVE_SLOT_IDS).toEqual(['1', '2', '3']);
    expect(SLOT_LABELS['1']).toBe('Slot 1');
    expect(SLOT_LABELS['3']).toBe('Slot 3');
  });
});

describe('active slot', () => {
  it('defaults to Slot 1', () => {
    expect(getActiveSlot()).toBe('1');
  });

  it('persists the chosen slot and rejects corrupt values', () => {
    setActiveSlot('3');
    expect(getActiveSlot()).toBe('3');
    localStorage.setItem(ACTIVE_KEY, 'banana');
    expect(getActiveSlot()).toBe('1');
  });
});

describe('resumable-session marker (account-aware)', () => {
  it('starts inactive, marks active for the account, and clears', () => {
    clearSessionActive();
    expect(wasSessionActive('player-a')).toBe(false);
    markSessionActive('player-a');
    expect(wasSessionActive('player-a')).toBe(true);
    clearSessionActive();
    expect(wasSessionActive('player-a')).toBe(false);
  });

  it('never auto-resumes a DIFFERENT account (shared browsers)', () => {
    clearSessionActive();
    markSessionActive('player-a');
    // A reload as anyone else must not resume player-a's session.
    expect(wasSessionActive('player-b')).toBe(false);
    // ...and a later session by player-b overwrites the marker cleanly.
    markSessionActive('player-b');
    expect(wasSessionActive('player-b')).toBe(true);
    expect(wasSessionActive('player-a')).toBe(false);
  });

  it('treats legacy bare markers and corrupt values as not-active', () => {
    clearSessionActive();
    localStorage.setItem('dhq_session_active', '1'); // pre-account-aware marker
    expect(wasSessionActive('player-a')).toBe(false);
    localStorage.setItem('dhq_session_active', 'banana');
    expect(wasSessionActive('player-a')).toBe(false);
    localStorage.setItem('dhq_session_active', JSON.stringify({ at: 123 })); // no player id
    expect(wasSessionActive('player-a')).toBe(false);
    localStorage.removeItem('dhq_session_active');
  });
});

describe('normalizeSlot', () => {
  it('maps undefined (autosave/Continue) to the active slot', () => {
    setActiveSlot('2');
    expect(normalizeSlot()).toBe('2');
    expect(normalizeSlot(undefined)).toBe('2');
  });

  it('accepts canonical slot ids and falls back for legacy names', () => {
    setActiveSlot('1');
    expect(normalizeSlot('2')).toBe('2');
    expect(normalizeSlot('3')).toBe('3');
    // Old 'default'/'auto' names no longer exist — they resolve to the active slot.
    expect(normalizeSlot('default')).toBe('1');
    expect(normalizeSlot('alpha')).toBe('1');
  });
});

describe('sortLegacyForMigration', () => {
  it('puts the old autosave rows first, then named slots by recency', () => {
    const rows = [
      legacyRow('bravo', '2026-08-01T10:00:00Z'),
      legacyRow('default', '2026-08-02T10:00:00Z'),
      legacyRow('alpha', '2026-08-03T10:00:00Z'),
      legacyRow('auto', '2026-08-04T10:00:00Z'),
    ];
    const order = sortLegacyForMigration(rows).map((r) => r.slot);
    // Autosaves first (tie → most recent), then named slots by recency.
    expect(order[0]).toBe('auto');
    expect(order[1]).toBe('default');
    expect(order[2]).toBe('alpha');
    expect(order[3]).toBe('bravo');
  });

  it('drops canonical slots from the legacy list', () => {
    const rows = [legacyRow('default', '2026-08-02T10:00:00Z'), legacyRow('2', '2026-08-05T10:00:00Z')];
    expect(sortLegacyForMigration(rows).map((r) => r.slot)).toEqual(['default']);
  });
});

describe('pickMigrationTargets', () => {
  it('fills free slots in priority order and never exceeds them', () => {
    const legacy = [legacyRow('default', 'a'), legacyRow('bravo', 'b'), legacyRow('alpha', 'c')];
    const picks = pickMigrationTargets(legacy, ['1', '2']);
    // 'default' fills slot 1; the next legacy slot is 'alpha' ('c' newer than 'b').
    expect(picks.map((p) => `${p.legacy.slot}->${p.slot}`)).toEqual(['default->1', 'alpha->2']);
  });

  it('returns nothing when no free slots exist (never overwrites)', () => {
    expect(pickMigrationTargets([legacyRow('default', 'a')], [])).toEqual([]);
  });
});

describe('derivePreviewFromPayload', () => {
  it('extracts headline values from a v7 payload', () => {
    expect(derivePreviewFromPayload({
      player: { level: 8, credits: 1234, xp: 500 },
      selectedCity: { name: 'Memphis' },
      selectedService: 'fire',
      career: { missionsCompleted: 21 },
      gameMinutes: 300,
    })).toEqual({
      level: 8, credits: 1234, xp: 500,
      city: 'Memphis', service: 'fire', missionsCompleted: 21, gameMinutes: 300,
      // v0.22.x: legacy payload without a tour marker → treated as done.
      onboardingStep: -1,
    });
  });

  it('degrades malformed values to defaults', () => {
    const p = derivePreviewFromPayload({ player: { level: 'x' }, selectedCity: null });
    expect(p.level).toBe(1);
    expect(p.credits).toBe(0);
    expect(p.city).toBeNull();
    expect(derivePreviewFromPayload(null).service).toBeNull();
  });

  it('carries the saved tour step into the preview (Continue-card chip)', () => {
    expect(derivePreviewFromPayload({ onboardingStep: 5 }).onboardingStep).toBe(5);
    expect(derivePreviewFromPayload({ onboardingStep: 0 }).onboardingStep).toBe(0);
    // Corrupt / absent values degrade to the done sentinel, never to 0.
    expect(derivePreviewFromPayload({ onboardingStep: 'x' }).onboardingStep).toBe(-1);
    expect(derivePreviewFromPayload(null).onboardingStep).toBe(-1);
  });
});

// ── Campaign guard: boot/menu state must never clobber a real save ─────────
function makePlayer(email: string) {
  return {
    id: 'p-' + email,
    username: 'Commander',
    email,
    credits: 10000,
    coins: 0,
    xp: 0,
    level: 1,
    isPremium: false,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

const WM_CITY = { name: 'West Memphis, AR', country: 'US', lat: 35.1465, lng: -90.1845 };

/** The pristine boot-state snapshot the pre-guard tab-close beacon wrote. */
function bootStatePayload(player = makePlayer('guest_abc@dispatchhq.game')) {
  return {
    version: 8,
    timestamp: Date.now(),
    player,
    selectedCity: null,
    selectedService: null,
    mapBounds: null,
    stations: [],
    units: [],
    missions: [],
    patrolRoutes: [],
    career: { missionsCompleted: 0, missionsFailed: 0, totalCreditsEarned: 0, totalXpEarned: 0, bestResponseTime: null, mutualAidAnswered: 0, currentStreak: 0, longestStreak: 0 },
    weekly: { weekKey: '2026-W33', callsRun: 0, cleared: 0, creditsEarned: 0, xpEarned: 0 },
    gameMinutes: 180,
    inmates: [],
    patients: [],
    investigations: [],
    criminalRecords: [],
    techPurchased: [],
  };
}

/** A real campaign snapshot (what the mirror legitimately holds). */
function campaignPayload(player = makePlayer('guest_abc@dispatchhq.game')) {
  return {
    version: 8,
    timestamp: Date.now(),
    player,
    selectedCity: WM_CITY,
    selectedService: 'police' as const,
    mapBounds: [[35.0, -90.3], [35.3, -89.8]] as [[number, number], [number, number]],
    stations: [{ id: 's1', ownerId: 'p-x', type: 'police_station', level: 1, name: 'Precinct 1', position: { lat: 35.1465, lng: -90.1845 }, capacity: 6, unitCount: 0, coverageRadius: 3000, createdAt: new Date().toISOString() }],
    units: [],
    missions: [],
    patrolRoutes: [],
    career: { missionsCompleted: 3, missionsFailed: 0, totalCreditsEarned: 1200, totalXpEarned: 40, bestResponseTime: null, mutualAidAnswered: 0, currentStreak: 1, longestStreak: 1 },
    weekly: { weekKey: '2026-W33', callsRun: 3, cleared: 2, creditsEarned: 1200, xpEarned: 40 },
    gameMinutes: 240,
    inmates: [],
    patients: [],
    investigations: [],
    criminalRecords: [],
    techPurchased: [],
  };
}

describe('campaign guard (save-side)', () => {
  beforeEach(() => {
    vi.mocked(mockStoreSave).mockClear();
  });

  it('never writes the boot/menu state over a real save', async () => {
    // Authenticated but NO campaign loaded (fresh page load → main menu).
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: null });
    const ok = await saveGame('1');
    expect(ok).toBe(true); // "nothing to save" is not a failure
    expect(mockStoreSave).not.toHaveBeenCalled();
  });

  it('persists a loaded campaign', async () => {
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: WM_CITY });
    await saveGame('1');
    expect(mockStoreSave).toHaveBeenCalledWith(
      '1',
      'Slot 1',
      expect.objectContaining({ selectedCity: expect.objectContaining({ name: 'West Memphis, AR' }) }),
    );
  });
});

describe('empty-payload rejection (load-side)', () => {
  beforeEach(() => {
    vi.mocked(mockLoadSave).mockReset();
    localStorage.removeItem('dhq_save_mirror_v7');
  });

  it('treats a campaign-less server row as absent and recovers the mirror', async () => {
    // The server row is the beacon-clobbered empty snapshot…
    vi.mocked(mockLoadSave).mockResolvedValue({ slot: '1', data: bootStatePayload(), updatedAt: '2026-08-12T00:00:00Z' });
    // …but this browser still has the real campaign in its mirror.
    localStorage.setItem('dhq_save_mirror_v7', JSON.stringify(campaignPayload()));
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: null });

    const result = await loadGame('1');
    expect(result).toBe('loaded');
    expect(useGameStore.getState().selectedCity?.name).toBe('West Memphis, AR');
    expect(useGameStore.getState().stations).toHaveLength(1);
  });

  it('lets a REAL account recover the mirror when the row was an empty clobber', async () => {
    vi.mocked(mockLoadSave).mockResolvedValue({ slot: '1', data: bootStatePayload(makePlayer('deandrewh26@gmail.com')), updatedAt: '2026-08-12T00:00:00Z' });
    localStorage.setItem('dhq_save_mirror_v7', JSON.stringify(campaignPayload(makePlayer('deandrewh26@gmail.com'))));
    useGameStore.setState({ player: makePlayer('deandrewh26@gmail.com'), selectedCity: null });

    const result = await loadGame('1');
    expect(result).toBe('loaded');
    expect(useGameStore.getState().selectedCity?.name).toBe('West Memphis, AR');
  });

  it('keeps the clean-slate rule: real account with no server row starts fresh', async () => {
    // Server says "no save" (null) — the mirror must NOT resurrect for a real
    // account (no clobber happened); only guests recover a truly-absent save.
    vi.mocked(mockLoadSave).mockResolvedValue(null);
    localStorage.setItem('dhq_save_mirror_v7', JSON.stringify(campaignPayload(makePlayer('deandrewh26@gmail.com'))));
    useGameStore.setState({ player: makePlayer('deandrewh26@gmail.com'), selectedCity: null });

    const result = await loadGame('1');
    expect(result).toBe('not-found');
  });
});

describe('onboarding tour step persistence (v0.22.x)', () => {
  beforeEach(() => {
    vi.mocked(mockStoreSave).mockClear();
    vi.mocked(mockLoadSave).mockReset();
    localStorage.removeItem('dhq_save_mirror_v7');
  });

  it('saves the current tour step with the campaign', async () => {
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: WM_CITY, onboardingStep: 4 });
    await saveGame('1');
    expect(mockStoreSave).toHaveBeenCalledWith('1', 'Slot 1', expect.objectContaining({ onboardingStep: 4 }));
  });

  it('restores a mid-tour step from the save (resume at the same step)', async () => {
    vi.mocked(mockLoadSave).mockResolvedValue({
      slot: '1',
      data: { ...campaignPayload(), onboardingStep: 6 },
      updatedAt: '2026-08-12T00:00:00Z',
    });
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: null, onboardingStep: 0 });

    const result = await loadGame('1');
    expect(result).toBe('loaded');
    expect(useGameStore.getState().onboardingStep).toBe(6);
  });

  it('treats a legacy save (no step field) as tour-done — no tutorial on Continue', async () => {
    vi.mocked(mockLoadSave).mockResolvedValue({
      slot: '1',
      data: campaignPayload(),
      updatedAt: '2026-08-12T00:00:00Z',
    });
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: null, onboardingStep: 0 });

    const result = await loadGame('1');
    expect(result).toBe('loaded');
    expect(useGameStore.getState().onboardingStep).toBe(-1);
  });

  it('restores a finished-tour marker (done) as-is', async () => {
    vi.mocked(mockLoadSave).mockResolvedValue({
      slot: '1',
      data: { ...campaignPayload(), onboardingStep: -1 },
      updatedAt: '2026-08-12T00:00:00Z',
    });
    useGameStore.setState({ player: makePlayer('guest_abc@dispatchhq.game'), selectedCity: null, onboardingStep: 0 });

    const result = await loadGame('1');
    expect(result).toBe('loaded');
    expect(useGameStore.getState().onboardingStep).toBe(-1);
  });
});
