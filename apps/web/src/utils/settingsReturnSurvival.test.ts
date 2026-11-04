// ============================================
// Settings return-survival tests (staged batch, Addition 5)
// ============================================
// Dre's live bug: change settings, leave the game, come back — settings
// are reset and must be re-entered. Each test simulates a full return:
// fresh module state (tab close/reopen) against the same browser mirror
// and the same server row, then checks the four Settings-modal surfaces
// Dre named: Audio, Simulation Speed, Patrol Lifecycle, Accessibility.
//
// The two failing-before-fix scenarios name the broken links:
//  A. Save-snapshot clobber: boot hydrates from the mirror (server row
//     never landed), then the campaign save's OLDER settings snapshot
//     overwrites the live settings because the guard only checks
//     source !== 'server' — never recency.
//  B. Stale server row beats newer mirror: boot prefers any non-empty
//     server row over the mirror with no recency comparison, so a row
//     older than the mirror resets the player to previous values.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('@/lib/apiClient', () => ({
  getSettings,
  updateSettings,
}));

const MIRROR_KEY = 'dhq_settings_v2';

// Dre's four surfaces, changed away from defaults.
const NEW_SETTINGS = {
  soundVolume: 0.2, // Audio
  gameSpeed: 2, // Simulation Speed
  patrolShiftMinutes: 6, // Patrol Lifecycle
  colorblindHeat: true, // Accessibility
};
const OLD_SETTINGS = {
  soundVolume: 0.5,
  gameSpeed: 1,
  patrolShiftMinutes: 4.5,
  colorblindHeat: false,
};

async function freshSettings() {
  return import('./settings');
}

/** The save-load guard exactly as useSaveSystem applies it (production helper). */
function applySaveSnapshot(s: Awaited<ReturnType<typeof freshSettings>>, saveSettings: Record<string, unknown>) {
  if (s.shouldApplySaveSnapshot(saveSettings as never)) {
    s.saveSettings(saveSettings as never);
  }
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  getSettings.mockReset();
  updateSettings.mockReset();
  updateSettings.mockResolvedValue({ success: true, settings: {} });
});

describe('settings return survival (Dre live bug)', () => {
  it('A. save snapshot must NOT clobber newer mirror settings on return', async () => {
    // Boot 1: no server row, no mirror → defaults. Player changes settings.
    getSettings.mockResolvedValue({ settings: null });
    // Simulate tab close before the server write lands: the POST never
    // resolves, so the server row stays empty and the retry timer dies
    // with the page. The mirror is the only copy of the new settings.
    updateSettings.mockImplementation(() => new Promise(() => {}));
    const boot1 = await freshSettings();
    await boot1.initSettings();
    boot1.saveSettings(NEW_SETTINGS);
    expect(boot1.loadSettings().gameSpeed).toBe(2);

    // Return: fresh module state, same mirror, server row still empty.
    vi.resetModules();
    getSettings.mockResolvedValue({ settings: null });
    updateSettings.mockResolvedValue({ success: true, settings: {} });
    const boot2 = await freshSettings();
    await boot2.initSettings();
    // Mirror hydrated correctly at this point.
    expect(boot2.loadSettings().gameSpeed).toBe(2);
    // Then the campaign save loads with its OLDER settings snapshot.
    applySaveSnapshot(boot2, OLD_SETTINGS);
    // The live (newer) settings must survive the save load.
    expect(boot2.loadSettings().soundVolume).toBe(0.2);
    expect(boot2.loadSettings().gameSpeed).toBe(2);
    expect(boot2.loadSettings().patrolShiftMinutes).toBe(6);
    expect(boot2.loadSettings().colorblindHeat).toBe(true);
  });

  it('B. newer mirror must beat a stale server row on return', async () => {
    // Server row holds the OLD settings (last write that landed before the
    // player changed them again); the mirror holds NEW ones. Post-fix both
    // copies carry stamps (saveSettings stamps every write); the mirror's
    // stamp is newer, so recency — not source priority — picks the mirror.
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...NEW_SETTINGS, updatedAtMs: 2000 }));
    getSettings.mockResolvedValue({ settings: { ...OLD_SETTINGS, updatedAtMs: 1000 } });
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().soundVolume).toBe(0.2);
    expect(s.loadSettings().gameSpeed).toBe(2);
    expect(s.loadSettings().patrolShiftMinutes).toBe(6);
    expect(s.loadSettings().colorblindHeat).toBe(true);
  });

  it('C. control: newer server row still wins over an older mirror', async () => {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ ...OLD_SETTINGS, updatedAtMs: 1000 }));
    getSettings.mockResolvedValue({ settings: { ...NEW_SETTINGS, updatedAtMs: 2000 } });
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().gameSpeed).toBe(2);
    expect(s.loadSettings().colorblindHeat).toBe(true);
  });

  it('D. legacy tie: unstamped server row still wins (old priority preserved)', async () => {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(OLD_SETTINGS));
    getSettings.mockResolvedValue({ settings: NEW_SETTINGS });
    const s = await freshSettings();
    await s.initSettings();
    expect(s.loadSettings().gameSpeed).toBe(2);
  });
});
