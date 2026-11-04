// ============================================
// Dispatch HQ — Settings (server-persisted)
// ============================================
// Settings are stored in the backend PostgreSQL player_settings table,
// not browser localStorage. A module-level cache keeps reads synchronous
// for components; call initSettings() once at app boot to hydrate it.

import { getSettings, updateSettings } from '@/lib/apiClient';
import type { Player } from '@dispatch-hq/shared';

/**
 * Email to show on profile surfaces. Synthetic guest accounts get
 * `guest_xxx@dispatchhq.game` emails — hide those behind a friendly label
 * so the dropdown and profile modal always show a real address (or a
 * plain "Guest account").
 */
export function displayEmailFor(player: Player | null | undefined): string | null {
  const email = player?.email;
  if (!email || email.startsWith('guest_')) return null;
  return email;
}

export type PostMissionDefault = 'auto' | 'return' | 'patrol';
export type MissionPace = 'relaxed' | 'normal' | 'intense';
export type DisasterFrequency = 'off' | 'rare' | 'normal' | 'frequent';
export type FatigueMode = 'off' | 'gentle' | 'full';
/** How often partner-agency (mutual aid) calls spawn vs the player's own. */
export type MutualAidPace = 'off' | 'rare' | 'normal' | 'frequent';

export type SoundCategory = 'ui' | 'dispatch' | 'alert' | 'ambient';

export interface SoundCategoryVolumes {
  ui: number;       // clicks, hovers, radio beeps
  dispatch: number; // tones, sirens, station-built
  alert: number;    // mission alerts, chain complete, level up
  ambient: number;  // looping weather/radio pad
}

export const DEFAULT_SOUND_CATEGORY_VOLUMES: SoundCategoryVolumes = {
  ui: 1,
  dispatch: 1,
  alert: 1,
  ambient: 0.5,
};

export interface DispatchSettings {
  soundEnabled: boolean;
  soundVolume: number;
  musicEnabled: boolean;
  soundCategoryVolumes: SoundCategoryVolumes;
  gameSpeed: number;
  darkMode: boolean;
  // Patrol lifecycle tuning (v0.10.1)
  patrolShiftMinutes: number; // 2–8 min patrol shift before an auto rest break
  defaultPostMissionBehavior: PostMissionDefault;
  // Mission pacing (v0.13.1)
  missionPace: MissionPace;   // spawn cadence: relaxed 20s / normal 12s / intense 6s
  maxActiveMissions: number;  // hard cap on concurrent active calls (4-15)
  // Disaster events (v0.14.0)
  disasterFrequency: DisasterFrequency; // off / rare / normal / frequent
  // Push notifications (v0.14.1)
  pushEnabled: boolean; // desktop notifications for critical calls while away
  // Profile identity (v0.14.1)
  profileName: string;  // display name shown on your profile (defaults to username)
  avatarEmoji: string;  // avatar shown on your profile button
  // Accessibility (v0.18.0)
  colorblindHeat: boolean; // colorblind-safe crime-heat palette (blue→orange instead of green→red)
  // Personnel shift pressure (v0.20.2): off = crews never tire, gentle = half
  // rates, full = the complete fatigue & morale simulation.
  fatigueMode: FatigueMode;
  // CPU Mutual Aid (v0.22.2): when on, partner-agency (cross-service) calls are
  // answered by simulated city units for a token payout instead of sitting in
  // the queue. Off by default — building partner stations pays the full +25%.
  cpuMutualAid: boolean;
  // Simulated Cross-Service Incidents (v0.22.8): when on AND no partner station
  // exists AND CPU aid is off, cross-service calls still appear in the city and
  // the CPU city resolves them itself — the city feels alive without ever
  // piling up unanswerable missions. Off by default.
  citySimCrossService: boolean;
  // Mutual Aid Pace (v0.22.7): how often organic partner-agency calls spawn
  // relative to the player's own department's calls (per spawn tick).
  mutualAidPace: MutualAidPace;
  // Co-op dispatch auto-respond (v0.40.0): when on, the game automatically
  // dispatches the nearest available unit to shared alliance missions as soon
  // as they appear on the board. Off by default — lets the player triage
  // manually.
  autoRespondAlliance: boolean;
  // Online Gameplay (v0.23): multiplayer layer — see other commanders and
  // their units on the map, live chat, presence. Off runs a private
  // single-player session (no WebSocket, no relay, no presence).
  onlineMode: boolean;
  // Anonymous analytics (v0.24.0): share session/mission counts (no PII). Off
  // by default — when off the client makes zero analytics network calls.
  analyticsEnabled: boolean;
  // Staged batch (Addition 5): recency stamp. Every saveSettings() call
  // stamps Date.now() here so hydration and save-restore can tell NEWER
  // from OLDER instead of guessing by source. Absent = pre-fix era row
  // (treated as older than any stamped row, newer than nothing).
  updatedAtMs?: number;
}

const DEFAULTS: DispatchSettings = {
  soundEnabled: true,
  soundVolume: 0.5,
  musicEnabled: false,
  soundCategoryVolumes: DEFAULT_SOUND_CATEGORY_VOLUMES,
  gameSpeed: 1,
  darkMode: true,
  patrolShiftMinutes: 4.5,
  defaultPostMissionBehavior: 'auto',
  missionPace: 'normal',
  maxActiveMissions: 10,
  disasterFrequency: 'normal',
  pushEnabled: false,
  profileName: '',
  avatarEmoji: '🚨',
  colorblindHeat: false,
  fatigueMode: 'full',
  cpuMutualAid: false,
  citySimCrossService: false,
  mutualAidPace: 'normal',
  autoRespondAlliance: false,
  onlineMode: true,
  analyticsEnabled: false,
};

export function getPatrolShiftMs(): number {
  const minutes = cache.patrolShiftMinutes || DEFAULTS.patrolShiftMinutes;
  return Math.round(Math.min(8, Math.max(2, minutes)) * 60 * 1000);
}

/** Spawn interval in ms for each mission-pace setting. */
export function getMissionPaceMs(pace?: MissionPace): number {
  const p = pace ?? cache.missionPace ?? DEFAULTS.missionPace;
  return p === 'relaxed' ? 20000 : p === 'intense' ? 6000 : 12000;
}

/** Per-tick spawn chance for partner-agency (mutual aid) calls, per pace. */
export const MUTUAL_AID_CHANCE: Record<MutualAidPace, number> = {
  off: 0,
  rare: 0.15,
  normal: 0.4,
  frequent: 0.7,
};

/** Chance this spawn tick produces a partner-agency call. Off is a hard 0. */
export function getMutualAidChance(pace?: MutualAidPace): number {
  const p = pace ?? cache.mutualAidPace ?? DEFAULTS.mutualAidPace;
  return MUTUAL_AID_CHANCE[p] ?? MUTUAL_AID_CHANCE.normal;
}

const LOCAL_CACHE_KEY = 'dhq_settings_v2';

/** Where the hydrated settings came from. 'server' rows are authoritative;
 * 'mirror'/'defaults' mean the save blob may offer a better snapshot (used by
 * the save system's settings restore). */
export type SettingsSource = 'server' | 'mirror' | 'defaults';

let cache: DispatchSettings = { ...DEFAULTS };
let source: SettingsSource = 'defaults';
let hydratePromise: Promise<DispatchSettings> | null = null;

/** Best-effort browser mirror so settings survive a lost session identity
 * (expired guest cookie), an offline boot, or a server row that never landed.
 * The server stays authoritative; the mirror is the recovery layer. */
function readLocalCache(): DispatchSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalCache(settings: DispatchSettings): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(settings));
  } catch { /* quota/availability — server sync still stands */ }
}

function emitChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dispatch-settings-change', { detail: cache }));
  }
}

// ── Resilient server writes ────────────────────────────────────────────────
// saveSettings used to fire-and-forget the POST: one transient failure (network
// blip, 401 window after a deploy restart) silently lost the write, and the
// next boot hydrated defaults. Writes now queue — the newest snapshot always
// lands, retrying with backoff until it does (or a newer value supersedes it).
let pendingWrite: { settings: DispatchSettings; attempts: number } | null = null;
let writing = false;

async function flushServerWrite(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pendingWrite) {
      const snapshot = pendingWrite.settings;
      const attempts = pendingWrite.attempts;
      try {
        await updateSettings(snapshot);
        // Only clear when nothing newer was queued while this write was in
        // flight — otherwise the loop picks up the superseding snapshot.
        if (pendingWrite && pendingWrite.settings === snapshot) {
          pendingWrite = null;
        }
      } catch (err) {
        console.warn('Failed to sync settings to server (will retry):', err);
        if (pendingWrite) pendingWrite.attempts = attempts + 1;
        break;
      }
    }
  } finally {
    writing = false;
    if (pendingWrite) {
      // Backoff: 5s, 10s, 20s, 40s, then capped at 60s between attempts.
      const delay = Math.min(5000 * 2 ** Math.min(pendingWrite.attempts, 4), 60000);
      setTimeout(() => { void flushServerWrite(); }, delay);
    }
  }
}

function queueServerWrite(settings: DispatchSettings): void {
  if (pendingWrite) {
    // A newer snapshot supersedes the queued one (never drop the newest).
    pendingWrite.settings = settings;
    return;
  }
  pendingWrite = { settings, attempts: 0 };
  void flushServerWrite();
}

export function loadSettings(): DispatchSettings {
  return { ...cache };
}

/**
 * Flip the global sound flag and persist it. The next value is computed from
 * the LIVE settings cache (never from a component's local state, which can be
 * stale if hydration landed after mount — the v0.22 mute-sync fix), and the
 * change fans out through emitChange so every subscribed surface (TopBar,
 * CAD console, Settings) updates its icon in the same tick.
 */
export function toggleSoundEnabled(): DispatchSettings {
  const next = !loadSettings().soundEnabled;
  return saveSettings({ soundEnabled: next });
}

/** Where the hydrated settings came from — used by the save system to decide
 * whether a save's settings snapshot is a better source than what we have. */
export function getSettingsSource(): SettingsSource {
  return source;
}

/**
 * Staged batch (Addition 5) — the root-cause fix for Dre's "settings reset
 * on return" bug. The old code picked by SOURCE priority (any non-empty
 * server row beat the mirror; any non-'server' hydration let a save
 * snapshot overwrite live settings) and nothing carried a timestamp, so a
 * stale row or an older snapshot could always beat newer settings.
 * Recency rule for replacing `current` with `candidate`:
 * - both stamped → newer stamp wins;
 * - only candidate stamped → candidate wins (stamped = post-fix era,
 *   hence newer than any unstamped row);
 * - only current stamped → current wins;
 * - neither stamped → keep current (server-first priority preserved).
 */
export function shouldReplaceSettings(
  current: Partial<DispatchSettings> | null | undefined,
  candidate: Partial<DispatchSettings> | null | undefined,
): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const cStamp = typeof candidate.updatedAtMs === 'number' && Number.isFinite(candidate.updatedAtMs) ? candidate.updatedAtMs : undefined;
  const uStamp = current && typeof current.updatedAtMs === 'number' && Number.isFinite(current.updatedAtMs) ? current.updatedAtMs : undefined;
  if (cStamp !== undefined && uStamp !== undefined) return cStamp > uStamp;
  if (cStamp !== undefined) return true;
  if (uStamp !== undefined) return false;
  return false;
}

/**
 * Save-restore decision (used by useSaveSystem): a save's settings
 * snapshot applies only when it beats the live settings by recency — or
 * when live settings are untouched defaults (fresh identity: any snapshot
 * is better than defaults). The old rule (apply whenever source !==
 * 'server') let an older save snapshot clobber newer mirror settings on
 * every return where the server row had never landed.
 */
export function shouldApplySaveSnapshot(save: Partial<DispatchSettings> | null | undefined): boolean {
  if (!save || typeof save !== 'object') return false;
  if (source === 'defaults') return true;
  return shouldReplaceSettings(cache, save);
}

export async function loadSettingsAsync(): Promise<DispatchSettings> {
  await initSettings();
  return loadSettings();
}

/** Forget the cached hydration so the next initSettings() re-fetches from the
 * server — called after login/guest so the authenticated player's own settings
 * load instead of a stale pre-auth defaults snapshot. */
export function resetSettingsCache(): void {
  hydratePromise = null;
  source = 'defaults';
}

export async function initSettings(): Promise<DispatchSettings> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const server = await getSettings<DispatchSettings>();
      const row = server.settings;
      const mirror = readLocalCache();
      if (row && typeof row === 'object' && Object.keys(row).length > 0) {
        // Staged batch (Addition 5): recency, not source priority. A stale
        // server row must NOT beat a newer mirror — the old code took the
        // row unconditionally, which reset players whose last settings
        // change never landed server-side (tab closed before the queued
        // write flushed) back to previous values on every return.
        if (mirror && shouldReplaceSettings(row, mirror)) {
          cache = { ...DEFAULTS, ...mirror };
          source = 'mirror';
          writeLocalCache(cache);
          queueServerWrite(cache);
        } else {
          cache = { ...DEFAULTS, ...row };
          source = 'server';
          writeLocalCache(cache);
        }
      } else {
        // The server answered but has no row for this identity (first boot,
        // a lost write, a fresh guest). Prefer the browser mirror over
        // defaults so preferences never reset — and re-push the mirror to
        // the server so the row self-heals and the next boot is clean.
        cache = { ...DEFAULTS, ...(mirror ?? {}) };
        source = mirror ? 'mirror' : 'defaults';
        writeLocalCache(cache);
        if (mirror) queueServerWrite(cache);
      }
    } catch (err) {
      console.warn('Settings hydrate failed; falling back to local cache:', err);
      // Unauthenticated or offline — prefer the browser mirror over defaults so
      // returning players keep their preferences instead of being reset.
      const mirror = readLocalCache();
      cache = { ...DEFAULTS, ...(mirror ?? {}) };
      source = mirror ? 'mirror' : 'defaults';
      writeLocalCache(cache);
    }
    emitChange();
    return loadSettings();
  })();
  return hydratePromise;
}

export function saveSettings(patch: Partial<DispatchSettings>): DispatchSettings {
  // Staged batch (Addition 5): stamp every live write so later hydration
  // and save-restore decisions compare recency instead of source. The
  // stamp is set here — not taken from the patch — because saveSettings
  // means "these settings are live NOW" (including when applying a save
  // snapshot: once applied, it IS the live setting).
  cache = { ...cache, ...patch, updatedAtMs: Date.now() };
  // Optimistic 'server': the queued write retries until it lands, so the live
  // settings are authoritative immediately (a save-load must not overwrite
  // them with an older snapshot from a save blob).
  source = 'server';
  writeLocalCache(cache);
  queueServerWrite(cache);
  emitChange();
  return loadSettings();
}

export function subscribeSettings(callback: (settings: DispatchSettings) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<DispatchSettings | undefined>).detail;
    callback(detail ? { ...DEFAULTS, ...detail } : loadSettings());
  };
  window.addEventListener('dispatch-settings-change', handler);
  return () => window.removeEventListener('dispatch-settings-change', handler);
}
