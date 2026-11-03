// ============================================
// Dispatch HQ — loadGame / resumeOrder unit tests
// ============================================
// Covers the fallback ladder a Continue (or explicit slot load) walks:
//   server save → (clean absence → guest mirror) → (transient error → mirror)
//   → all-absent guest mirror recovery → 'error' vs 'not-found' classification.
// apiClient and the gameStore are mocked so every branch is driven
// deterministically; localStorage (active slot + mirror keys) is the only real
// dependency exercised.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const apiMock = vi.hoisted(() => ({
  getSaveSlots: vi.fn(),
  loadSave: vi.fn(),
  storeSave: vi.fn(),
  deleteSave: vi.fn(),
}));

const storeMock = vi.hoisted(() => {
  const SETTERS = [
    'setPlayer', 'setSelectedCity', 'setSelectedService', 'setMapBounds',
    'setStations', 'setUnits', 'setMissions', 'setTechPurchased',
    'setCriminalRecords', 'setInmates', 'setPatients', 'setInvestigations',
    'advanceGameClock', 'setWeekly', 'setCareer', 'setPatrolRoutes',
    'setDefaultPostMissionBehavior', 'setDefaultPatrolMode',
    // Batch 3b: restoreSave's batch3b guard calls these — mock them so the
    // guard actually runs instead of being swallowed like placedPois is.
    'setDistrictSatisfaction', 'setAdoptedCities', 'setDisasterWave',
  ] as const;
  const setters: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of SETTERS) setters[name] = vi.fn();
  // getState() must return the object restoreSave calls setters on.
  const state: Record<string, unknown> = { player: null, gameMinutes: 0, ...setters };
  return { state, setters, getState: () => state, EMPTY_CAREER: {} };
});

vi.mock('@/lib/apiClient', () => ({
  getSaveSlots: apiMock.getSaveSlots,
  loadSave: apiMock.loadSave,
  storeSave: apiMock.storeSave,
  deleteSave: apiMock.deleteSave,
  API_BASE: '/api',
}));

vi.mock('@/stores/gameStore', () => ({
  useGameStore: { getState: storeMock.getState },
  EMPTY_CAREER: storeMock.EMPTY_CAREER,
}));

import { loadGame, refreshSaveSlots, setActiveSlot, clearLocalSaveCache } from './useSaveSystem';
import type { SaveSlot } from '@/lib/apiClient';

// This test environment does not wire up jsdom's localStorage — provide the
// same in-memory shim useSaveSystem.test.ts uses.
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
const MIRROR_KEY = 'dhq_save_mirror_v7';

beforeEach(() => {
  localStorage.clear();
  clearLocalSaveCache();
  apiMock.getSaveSlots.mockReset();
  apiMock.loadSave.mockReset();
  apiMock.storeSave.mockReset();
  apiMock.deleteSave.mockReset();
  for (const fn of Object.values(storeMock.setters)) fn.mockReset();
  storeMock.state.player = null;
});

// ── Fixtures ───────────────────────────────────────────────────────────────
function savePayload(overrides: Record<string, unknown> = {}) {
  return {
    version: 7,
    timestamp: 1700000000000,
    player: { id: 'p1', email: 'guest_abc', username: 'Guest', level: 5, credits: 100, xp: 10 },
    stations: [{ id: 'st-1' }],
    units: [],
    missions: [],
    selectedCity: { name: 'West Memphis' },
    selectedService: 'fire',
    mapBounds: [[35.13, -90.21], [35.16, -90.15]],
    career: { missionsCompleted: 3 },
    techPurchased: [],
    criminalRecords: [],
    inmates: [],
    patrolRoutes: [],
    patients: [],
    investigations: [],
    ...overrides,
  };
}

const MIRROR = savePayload();
const SAVE_3 = savePayload({ stations: [{ id: 'st-3' }], units: [{ id: 'u-3' }], career: { missionsCompleted: 9 } });
const SAVE_1 = savePayload({ stations: [{ id: 'st-1b' }], units: [{ id: 'u-1b' }] });

function writeMirror(payload: Record<string, unknown> = MIRROR): void {
  localStorage.setItem(MIRROR_KEY, JSON.stringify(payload));
}

/** Seed the cached slot cards (slotsInfo) that resumeOrder sorts by. */
async function seedSlots(rows: SaveSlot[]): Promise<void> {
  apiMock.getSaveSlots.mockResolvedValue(rows);
  await refreshSaveSlots();
}

type Behavior =
  | { kind: 'save'; data: Record<string, unknown> }
  | { kind: 'absent' }
  | { kind: 'error' };

/** Drive loadSave per slot: a save payload, a clean absent (null), or a throw. */
function mockLoadSave(behaviors: Record<string, Behavior>): void {
  apiMock.loadSave.mockImplementation(async (slot: string) => {
    const b = behaviors[slot] ?? { kind: 'absent' };
    if (b.kind === 'error') throw new Error('network down');
    if (b.kind === 'save') return { slot, data: b.data, updatedAt: '2026-08-01T00:00:00Z' };
    return null; // server answered cleanly: no save in this slot
  });
}

// ── Explicit slot: not-found vs error ladder ───────────────────────────────
describe('loadGame — explicit slot (not-found vs error ladder)', () => {
  it('recovers from the local mirror when the server answers cleanly with no save (guest)', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    writeMirror();
    mockLoadSave({ '1': { kind: 'absent' } });

    const result = await loadGame('1');

    expect(result).toBe('loaded');
    // Restored from the mirror — not an empty campaign.
    expect(storeMock.setters.setStations).toHaveBeenCalledWith(MIRROR.stations);
    expect(storeMock.setters.setCareer).toHaveBeenCalledWith(expect.objectContaining({ missionsCompleted: 3 }));
    // Explicit loads always mark the slot active.
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('1');
    // The mirror is rewritten on restore (campaign stays recoverable).
    expect(JSON.parse(localStorage.getItem(MIRROR_KEY)!)).toMatchObject({ version: 7 });
  });

  it('returns not-found for a clean absent save when no mirror exists', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    mockLoadSave({ '1': { kind: 'absent' } });

    expect(await loadGame('1')).toBe('not-found');
    expect(storeMock.setters.setStations).not.toHaveBeenCalled();
  });

  it('does NOT recover from the mirror on a clean absent save for a real account', async () => {
    storeMock.state.player = { id: 'p1', email: 'real@example.com', username: 'R' };
    writeMirror();
    mockLoadSave({ '1': { kind: 'absent' } });

    // A real account whose server slot is empty starts clean — it must not
    // silently inherit whatever a previous device user left in the browser.
    expect(await loadGame('1')).toBe('not-found');
    expect(storeMock.setters.setStations).not.toHaveBeenCalled();
  });

  it('recovers from the mirror on a transient server failure (any identity)', async () => {
    storeMock.state.player = { id: 'p1', email: 'real@example.com', username: 'R' };
    writeMirror();
    mockLoadSave({ '1': { kind: 'error' } });

    // Offline play must not be lost — on a network/auth failure the mirror is
    // the only source, for guests AND real accounts alike.
    expect(await loadGame('1')).toBe('loaded');
    expect(storeMock.setters.setStations).toHaveBeenCalledWith(MIRROR.stations);
  });

  it('returns error when the server fails and no mirror exists', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    mockLoadSave({ '1': { kind: 'error' } });

    expect(await loadGame('1')).toBe('error');
  });
});

// ── Continue: resumeOrder fallback ladder ──────────────────────────────────
describe('loadGame — Continue (resumeOrder fallback ladder)', () => {
  it('walks resumeOrder (active first, then recency) and adopts the first slot with a save', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    setActiveSlot('2');
    await seedSlots([
      { slot: '1', updatedAt: '2026-08-01T00:00:00Z' },
      { slot: '3', updatedAt: '2026-08-03T00:00:00Z' },
    ]);
    mockLoadSave({ '3': { kind: 'save', data: SAVE_3 } });

    const result = await loadGame();

    expect(result).toBe('loaded');
    // Active slot (2) tried first, then the most recent (3) — 1 is never reached.
    expect(apiMock.loadSave.mock.calls.map(([slot]) => slot)).toEqual(['2', '3']);
    expect(storeMock.setters.setUnits).toHaveBeenCalledWith([{ id: 'u-3', veterancyXp: 0, certs: [], academy: null }]);
    // A resume that lands on a non-active slot makes it the campaign home.
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('3');
  });

  it('keeps walking past a transient error on an earlier candidate', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    setActiveSlot('2');
    await seedSlots([
      { slot: '1', updatedAt: '2026-08-01T00:00:00Z' },
      { slot: '3', updatedAt: '2026-08-03T00:00:00Z' },
    ]);
    // Active errors; the newest (3) is cleanly absent; the oldest (1) has a save.
    mockLoadSave({
      '2': { kind: 'error' },
      '1': { kind: 'save', data: SAVE_1 },
    });

    const result = await loadGame();

    expect(result).toBe('loaded');
    expect(apiMock.loadSave.mock.calls.map(([slot]) => slot)).toEqual(['2', '3', '1']);
    expect(storeMock.setters.setUnits).toHaveBeenCalledWith([{ id: 'u-1b', veterancyXp: 0, certs: [], academy: null }]);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('1');
  });

  it('recovers the guest mirror when every slot is cleanly absent', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    writeMirror();
    mockLoadSave({});

    const result = await loadGame();

    expect(result).toBe('loaded');
    expect(storeMock.setters.setStations).toHaveBeenCalledWith(MIRROR.stations);
    // Mirror stays intact after the recovery.
    expect(JSON.parse(localStorage.getItem(MIRROR_KEY)!)).toMatchObject({ version: 7 });
  });

  it('returns not-found for a real account with every slot absent (mirror is guest-only)', async () => {
    storeMock.state.player = { id: 'p1', email: 'real@example.com', username: 'R' };
    writeMirror();
    mockLoadSave({});

    const result = await loadGame();

    expect(result).toBe('not-found');
    expect(apiMock.loadSave).toHaveBeenCalledTimes(3); // every candidate was cleanly absent
    expect(storeMock.setters.setStations).not.toHaveBeenCalled();
  });

  it('returns error when every candidate fails and no mirror exists', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    mockLoadSave({ '1': { kind: 'error' }, '2': { kind: 'error' }, '3': { kind: 'error' } });

    expect(await loadGame()).toBe('error');
    expect(apiMock.loadSave).toHaveBeenCalledTimes(3);
  });

  it('tries the active slot first, then the fixed rest order, with no slot metadata cached', async () => {
    storeMock.state.player = { id: 'p1', email: 'guest_abc', username: 'Guest' };
    setActiveSlot('2');
    mockLoadSave({});

    expect(await loadGame()).toBe('not-found');
    expect(apiMock.loadSave.mock.calls.map(([slot]) => slot)).toEqual(['2', '1', '3']);
  });
});
