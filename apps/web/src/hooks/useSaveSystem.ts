// ============================================
// Dispatch HQ — Save System v7 (Slots 1–3)
// ============================================
// Campaigns live server-side (keyed by player) in three fixed slots — Slot 1,
// Slot 2, Slot 3. Autosave, the tab-close beacon, and manual saves all target
// the ACTIVE slot: the slot the current campaign belongs to. Slot management
// (load / delete / start-new) lives in the main-menu "Load Game" screen.
//
// Migration (v6 → v7, no data loss):
//  - Legacy server rows (the old 'default'/'auto' autosave and any custom
//    names like 'alpha'/'bravo') are copied into empty slots 1–3 on first run,
//    most-recent first. Migration never overwrites an occupied slot and never
//    deletes the legacy rows — they stay in the DB as a backup.
//  - The v6 browser mirror is recovered into a free slot when the server has
//    nothing for this identity (e.g. a guest whose cookie expired).
//
// Reliability (kept from the v0.14.0 audit):
//  - Saves never overlap (in-flight guard) and skip when nothing changed
//    (dirty-signature) so the 60s autosave doesn't hammer the server.
//  - Failed autosaves retry with backoff and report status via onStatus.
//  - A best-effort beacon save fires on pagehide so tab-close rarely loses
//    more than a minute of play.

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ensureUnitStaffDefaults } from '@/lib/unitsStaff';
import {
  getSaveSlots,
  loadSave as loadSaveFromServer,
  storeSave,
  deleteSave as deleteSaveOnServer,
  API_BASE,
  type SaveSlot,
  type SavePreview,
} from '@/lib/apiClient';
import type { Player, Station, Unit, Mission, ServiceType, CriminalRecord, Inmate, Patient, FireInvestigation, WeeklySnapshot } from '@dispatch-hq/shared';
import { emptyWeekly } from '@dispatch-hq/shared';
import { EMPTY_CAREER, type CityData, type PatrolRoute, type PostMissionBehavior, type PatrolMode, type CareerStats } from '@/stores/gameStore';
import { getUnitServiceType } from '@/utils/routing';
import { loadSettings, saveSettings, getSettingsSource } from '@/utils/settings';
import type { DispatchSettings } from '@/utils/settings';
import type { Poi } from '@/lib/pois';
import type { Hospital, Helipad } from '@/lib/hospital';
import type { SatisfactionRecord } from '@/lib/cityDistricts';
import { parseAdoptedCities, type AdoptedCity } from '@/lib/adoptedCities';
import type { DisasterWaveState } from '@/lib/disasterWaves';
import { parseChallengeState, type ChallengeState } from '@/lib/challenges';
import { parseFogRevealed } from '@/lib/fogExploration';
import {
  parsePhotoGallery, parseTutorialCampaign,
  type MissionHistoryEntry, type PhotoSnapshot, type TutorialCampaignState,
} from '@/lib/batch3e';
import { classifySaveError, dispatchSaveQueued, type SaveFailureKind } from '@/lib/saveFailure';

const AUTOSAVE_INTERVAL = 60000; // 60 seconds
const RETRY_BASE_MS = 10000;     // first retry after a failed autosave
const RETRY_BACKOFF_MS = 45000;  // subsequent retries grow toward this
const MAX_CONSECUTIVE_FAILURES = 5; // stop retrying a dead server; the 60s tick re-attempts
const SAVE_VERSION = 8;          // v8: fixed slots 1–3 + active-slot model + settings snapshot

// ── Canonical slots ─────────────────────────────────────────────────────────
export const SAVE_SLOT_IDS = ['1', '2', '3'] as const;
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

export const SLOT_LABELS: Record<SaveSlotId, string> = {
  '1': 'Slot 1',
  '2': 'Slot 2',
  '3': 'Slot 3',
};

function isCanonicalSlot(name: string): boolean {
  return (SAVE_SLOT_IDS as readonly string[]).includes(name);
}

// ── Persisted per-device state ──────────────────────────────────────────────
const ACTIVE_SLOT_KEY = 'dhq_active_slot_v7';       // which slot the current campaign uses
const LOCAL_MIRROR_KEY = 'dhq_save_mirror_v7';      // browser mirror of the most recent write
const LEGACY_MIRROR_KEY = 'dhq_save_mirror_v6';     // old key, read once for migration
const MIGRATION_KEY_PREFIX = 'dhq_save_migrated_v7_'; // per-player one-shot migration marker

export function getActiveSlot(): SaveSlotId {
  try {
    const v = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (v && isCanonicalSlot(v)) return v as SaveSlotId;
  } catch { /* noop */ }
  return '1';
}

export function setActiveSlot(slot: SaveSlotId): void {
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, slot);
  } catch { /* noop */ }
}

// ── Resumable-session marker ────────────────────────────────────────────────
// Set while a play session is live so a page reload can boot straight back
// into the saved game instead of landing on the main menu. Cleared on explicit
// exits (quit to menu, logout, starting a new campaign) and when an auto-
// resume finds nothing to restore.
//
// The marker records WHICH account was playing, so a reload under a different
// identity (shared browsers, guest↔account switches) never auto-resumes
// someone else's session. Pre-account-aware markers stored a bare '1' with no
// player id — those are unverifiable and therefore treated as not-active; the
// next play session overwrites them with the full marker.
const SESSION_ACTIVE_KEY = 'dhq_session_active';

interface SessionMarker {
  playerId: string;
  at: number;
}

/** True when the last marked play session belongs to this exact player id. */
export function wasSessionActive(playerId: string): boolean {
  try {
    const raw = localStorage.getItem(SESSION_ACTIVE_KEY);
    if (!raw) return false;
    const marker = JSON.parse(raw) as SessionMarker;
    return typeof marker?.playerId === 'string' && marker.playerId === playerId;
  } catch {
    // Corrupt value — the account can't be verified, so never resumable; the
    // next play session overwrites it. (A legacy bare '1' doesn't throw here:
    // it parses to the number 1 and is rejected by the playerId type check.)
    return false;
  }
}

export function markSessionActive(playerId: string): void {
  try {
    const marker: SessionMarker = { playerId, at: Date.now() };
    localStorage.setItem(SESSION_ACTIVE_KEY, JSON.stringify(marker));
  } catch { /* noop */ }
}

export function clearSessionActive(): void {
  try {
    localStorage.removeItem(SESSION_ACTIVE_KEY);
  } catch { /* noop */ }
}

// ── Local save mirror ───────────────────────────────────────────────────────
// A browser-local mirror of the most recent write makes progress recoverable
// when the session identity is lost (expired guest cookie, cleared cookies) or
// the server is unreachable. It is consulted only as a fallback — the server
// remains the source of truth.
function readLocalMirror(): SaveData | null {
  for (const key of [LOCAL_MIRROR_KEY, LEGACY_MIRROR_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as SaveData;
      if (data && typeof data === 'object') return data;
    } catch { /* malformed mirror — try the next key */ }
  }
  return null;
}

function writeLocalMirror(data: SaveData): void {
  try {
    localStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(data));
    // A fresh write supersedes the legacy mirror — drop it so a stale v6 copy
    // can never be re-migrated over newer progress later.
    localStorage.removeItem(LEGACY_MIRROR_KEY);
  } catch {
    // localStorage full/unavailable — the server save still stands.
  }
}

function clearLocalMirror(): void {
  try {
    localStorage.removeItem(LOCAL_MIRROR_KEY);
  } catch { /* noop */ }
}

/** Status of the most recent autosave attempt, for surfacing to the player. */
export type SaveStatus = 'ok' | 'failed' | 'recovered';

interface SaveData {
  version: number;
  timestamp: number;
  player: Player | null;
  stations: Station[];
  units: Unit[];
  missions: Mission[];
  selectedCity: CityData | null;
  selectedService: ServiceType | null;
  mapBounds: [[number, number], [number, number]] | null;
  career: CareerStats;
  techPurchased: string[];
  criminalRecords: CriminalRecord[];
  inmates: Inmate[];
  // v2: patrol persistence
  patrolRoutes: PatrolRoute[];
  defaultPostMissionBehavior: PostMissionBehavior;
  defaultPatrolMode: PatrolMode;
  // v4: EMS patients + fire marshal investigations
  patients: Patient[];
  investigations: FireInvestigation[];
  // v5: virtual game clock
  gameMinutes?: number;
  // v6: weekly stats snapshot (Friends leaderboard "who's ahead this week")
  weekly?: WeeklySnapshot;
  // v8: player-preferences snapshot so a save load can restore them when the
  // account row is absent (lost identity / new device / offline boot).
  settings?: DispatchSettings;
  // v10: player-placed Points of Interest + the City General Hospital
  // (v0.22.12) — all are built on the map and must survive a reload.
  placedPois?: Poi[];
  hospital?: Hospital | null;
  helipad?: Helipad | null;
  // v11: onboarding tour position — 0..N-1 mid-tour, -1 done/skipped. A
  // mid-tour reload resumes at the same step instead of restarting the
  // tutorial (v0.22.x). Absent in legacy saves → treated as done on restore.
  onboardingStep?: number;
  // Batch 3b: district satisfaction + adopted cities + live disaster wave.
  // All optional — legacy saves restore to defaults (neutral / empty / none).
  districtSatisfaction?: SatisfactionRecord;
  adoptedCities?: AdoptedCity[];
  disasterWave?: DisasterWaveState | null;
  // Batch 3d: challenge progress + revealed fog zones. Optional — legacy
  // saves restore to fresh challenges / no zones revealed.
  challenges?: ChallengeState;
  fogRevealed?: string[];
  // Batch 3e: shift replay history + photo gallery + tutorial campaign.
  // All optional — legacy saves restore to empty history/gallery and an
  // inactive campaign. The replay history is per-shift (resetShift clears
  // it); the gallery is a profile record and is kept across campaigns.
  missionHistory?: MissionHistoryEntry[];
  snapshots?: PhotoSnapshot[];
  tutorialCampaign?: TutorialCampaignState;
}

/** Card preview shown on the main-menu Load Game screen. */
export interface SaveSlotInfo {
  slot: SaveSlotId;
  label: string;
  exists: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  preview: SavePreview | null;
}

const EMPTY_PREVIEW: SavePreview = {
  level: 1, credits: 0, xp: 0,
  city: null, service: null, missionsCompleted: 0, gameMinutes: 0,
  // Tour position: -1 (done) for absent/empty — a slot with no tour marker
  // must never read as "Step 1 of N waiting" on the Continue card.
  onboardingStep: -1,
};

/** Client-side twin of the server's deriveSavePreview (used for the mirror). */
export function derivePreviewFromPayload(data: unknown): SavePreview {
  const d = (data ?? {}) as Record<string, unknown>;
  const player = (d.player ?? {}) as Record<string, unknown>;
  const career = (d.career ?? {}) as Record<string, unknown>;
  const city = d.selectedCity as Record<string, unknown> | undefined;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    level: num(player.level, 1),
    credits: num(player.credits, 0),
    xp: num(player.xp, 0),
    city: typeof city?.name === 'string' && city.name ? city.name : null,
    service: typeof d.selectedService === 'string' ? d.selectedService : null,
    missionsCompleted: num(career.missionsCompleted, 0),
    gameMinutes: num(d.gameMinutes, 0),
    // 0..N-1 mid-tour, -1 done/skipped; legacy saves (no field) → -1 so a
    // veteran campaign never shows a phantom "tour waiting" chip.
    onboardingStep: num(d.onboardingStep, -1),
  };
}

let slotsInfo: Record<SaveSlotId, SaveSlotInfo> | null = null;
let slotsPromise: Promise<SaveSlotInfo[]> | null = null;
// Legacy server rows captured on refresh — the migration source. null means the
// server never answered, so a later refresh gets another chance.
let legacyRows: SaveSlot[] | null = null;
let migrationRunning = false;

function makeEmptySlotInfo(slot: SaveSlotId): SaveSlotInfo {
  return { slot, label: SLOT_LABELS[slot], exists: false, createdAt: null, updatedAt: null, preview: null };
}

function buildSlotInfo(slot: SaveSlotId, rows: SaveSlot[]): SaveSlotInfo {
  const row = rows.find((r) => r.slot === slot);
  if (!row) return makeEmptySlotInfo(slot);
  return {
    slot,
    label: row.label || SLOT_LABELS[slot],
    exists: true,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    preview: row.preview ?? EMPTY_PREVIEW,
  };
}

/** True when the current session is a guest or not yet authenticated. Mirror
 * recovery (and its implicit migration of gameplay data) is only offered to
 * these identities — a real account whose server save is empty should start
 * clean rather than silently inherit whatever a previous device user left. */
function isGuestSession(): boolean {
  const email = useGameStore.getState().player?.email ?? '';
  return !email || email.startsWith('guest_');
}

export function normalizeSlot(slot?: string): SaveSlotId {
  if (slot && isCanonicalSlot(slot)) return slot as SaveSlotId;
  return getActiveSlot();
}

/**
 * Legacy → new-slot ordering: the old autosave ('default'/'auto' — every
 * existing campaign's most recent state) first, then named slots by recency.
 */
export function sortLegacyForMigration(rows: SaveSlot[]): SaveSlot[] {
  const rank = (s: string) => (/^(default|auto)$/i.test(s) ? 0 : 1);
  return [...rows]
    .filter((r) => !isCanonicalSlot(r.slot))
    .sort((a, b) => {
      const r = rank(a.slot) - rank(b.slot);
      if (r !== 0) return r;
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    });
}

/**
 * Pick which legacy saves fill which free slots. Only EMPTY slots are ever
 * targets — occupied slots are never overwritten by migration, so re-runs are
 * safe and user data always wins.
 */
export function pickMigrationTargets(legacy: SaveSlot[], freeSlots: SaveSlotId[]): { legacy: SaveSlot; slot: SaveSlotId }[] {
  // Copy so the caller's array is never mutated.
  const free = [...freeSlots];
  const out: { legacy: SaveSlot; slot: SaveSlotId }[] = [];
  for (const item of sortLegacyForMigration(legacy)) {
    if (free.length === 0) break;
    const slot = free.shift()!;
    out.push({ legacy: item, slot });
  }
  return out;
}

/** True when a save exists for the slot (or any slot when omitted). */
export function hasSaveGame(slot?: string): boolean {
  if (slot && isCanonicalSlot(slot)) {
    return slotsInfo?.[slot as SaveSlotId]?.exists ?? false;
  }
  return SAVE_SLOT_IDS.some((id) => slotsInfo?.[id]?.exists ?? false);
}

/** The three slot cards (server state + previews) for the Load Game screen. */
export function listSaveSlots(): SaveSlotInfo[] {
  const info = slotsInfo;
  if (!info) return SAVE_SLOT_IDS.map(makeEmptySlotInfo);
  return SAVE_SLOT_IDS.map((id) => info[id]);
}

function setSlotInfo(slot: SaveSlotId, info: SaveSlotInfo): void {
  const current = slotsInfo ?? {
    '1': makeEmptySlotInfo('1'),
    '2': makeEmptySlotInfo('2'),
    '3': makeEmptySlotInfo('3'),
  };
  slotsInfo = {
    '1': slot === '1' ? info : current['1'],
    '2': slot === '2' ? info : current['2'],
    '3': slot === '3' ? info : current['3'],
  };
}

/**
 * Refresh the slot list from the server and run the one-shot legacy migration.
 * Resolves to the three slot cards; network failures degrade to the previous
 * cache (or empty cards) so the menu always renders.
 */
export async function refreshSaveSlots(): Promise<SaveSlotInfo[]> {
  slotsPromise = (async () => {
    let rows: SaveSlot[] = [];
    let fetched = false;
    try {
      rows = await getSaveSlots();
      fetched = true;
    } catch (err) {
      console.error('Failed to refresh save slots:', err);
    }
    const next: Record<SaveSlotId, SaveSlotInfo> = {
      '1': buildSlotInfo('1', rows),
      '2': buildSlotInfo('2', rows),
      '3': buildSlotInfo('3', rows),
    };
    slotsInfo = next;
    legacyRows = fetched ? rows : null;
    // Migration only runs when the server actually answered; otherwise a later
    // refresh (or the next session) retries.
    if (fetched) await migrateLegacySaves();
    return SAVE_SLOT_IDS.map((id) => slotsInfo![id]);
  })();
  return slotsPromise;
}

export function clearLocalSaveCache(): void {
  slotsInfo = null;
  slotsPromise = null;
  legacyRows = null;
  clearLocalMirror();
  setActiveSlot('1');
}

/**
 * One-shot per-identity migration of v6-era saves into the fixed slots.
 * Idempotent by construction (only fills empty slots) and guarded by a
 * per-player marker so it runs at most once per identity. A copied legacy row
 * is then deleted server-side (move semantics) so a campaign the player later
 * deletes can't resurrect from a stale legacy source after a browser-data wipe.
 */
async function migrateLegacySaves(): Promise<void> {
  if (migrationRunning || !legacyRows) return;
  const playerId = useGameStore.getState().player?.id ?? 'anon';
  try {
    if (localStorage.getItem(MIGRATION_KEY_PREFIX + playerId)) return;
  } catch { /* noop */ }
  migrationRunning = true;
  try {
    const targets = SAVE_SLOT_IDS.filter((id) => !slotsInfo?.[id]?.exists);
    const picks = pickMigrationTargets(legacyRows, targets);
    let migratedAny = false;

    for (const { legacy, slot } of picks) {
      // Re-check the target is still empty right before writing — a concurrent
      // save/beacon must never be clobbered by stale legacy data.
      if (slotsInfo?.[slot]?.exists) continue;
      const data = await loadSaveFromServer(legacy.slot);
      if (!data || !data.data) continue;
      if (slotsInfo?.[slot]?.exists) continue;
      await storeSave(slot, legacy.label || SLOT_LABELS[slot], data.data);
      setSlotInfo(slot, {
        ...(slotsInfo?.[slot] ?? makeEmptySlotInfo(slot)),
        exists: true,
        label: legacy.label || SLOT_LABELS[slot],
        createdAt: null,
        updatedAt: data.updatedAt ?? null,
        preview: derivePreviewFromPayload(data.data),
      });
      // The copy is complete — drop the source so it can never re-migrate.
      try {
        await deleteSaveOnServer(legacy.slot);
      } catch { /* row stays as a harmless backup */ }
      migratedAny = true;
    }

    // Server empty for this identity but the browser still remembers a
    // campaign (guest whose cookie expired / cleared) → recover it into a
    // free slot. Real accounts get a clean slate.
    if (migratedAny === false && SAVE_SLOT_IDS.every((id) => !slotsInfo?.[id]?.exists) && isGuestSession()) {
      const mirror = readLocalMirror();
      if (mirror) {
        const slot = targets[0] ?? '1';
        await storeSave(slot, SLOT_LABELS[slot], mirror);
        setSlotInfo(slot, {
          ...(slotsInfo?.[slot] ?? makeEmptySlotInfo(slot)),
          exists: true,
          label: SLOT_LABELS[slot],
          createdAt: new Date(mirror.timestamp ?? Date.now()).toISOString(),
          updatedAt: new Date(mirror.timestamp ?? Date.now()).toISOString(),
          preview: derivePreviewFromPayload(mirror),
        });
        migratedAny = true;
      }
    }

    // Only a clean run (server reachable) gets marked; failures retry later.
    if (migratedAny || legacyRows.length === 0) {
      try {
        localStorage.setItem(MIGRATION_KEY_PREFIX + playerId, '1');
      } catch { /* noop */ }
    }
  } catch (err) {
    console.warn('Legacy save migration deferred (will retry next session):', err);
  } finally {
    migrationRunning = false;
  }
}

/** Snapshot of the current game state as a save payload. */
function buildSaveData(): SaveData {
  const state = useGameStore.getState();
  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    player: state.player,
    stations: state.stations,
    units: state.units,
    missions: state.missions,
    selectedCity: state.selectedCity,
    selectedService: state.selectedService,
    mapBounds: state.mapBounds,
    career: state.career,
    techPurchased: [...state.techPurchased],
    criminalRecords: state.criminalRecords,
    inmates: state.inmates,
    patrolRoutes: state.patrolRoutes,
    defaultPostMissionBehavior: state.defaultPostMissionBehavior,
    defaultPatrolMode: state.defaultPatrolMode,
    patients: state.patients,
    investigations: state.investigations,
    placedPois: state.placedPois,
    hospital: state.hospital,
    helipad: state.helipad,
    gameMinutes: state.gameMinutes,
    weekly: state.weekly,
    onboardingStep: state.onboardingStep,
    districtSatisfaction: state.districtSatisfaction,
    adoptedCities: state.adoptedCities,
    disasterWave: state.disasterWave,
    challenges: state.challenges,
    fogRevealed: [...state.fogRevealed],
    missionHistory: [...state.missionHistory],
    snapshots: [...state.snapshots],
    tutorialCampaign: { ...state.tutorialCampaign },
    settings: loadSettings(),
  };
}

/**
 * Cheap signature of "the stuff that matters" — skips autosaves when nothing
 * changed (idle players don't write to the DB every minute). The game clock is
 * deliberately excluded: it advances every second, which would defeat the
 * skip. Mission/unit states are hashed coarsely so an active session still
 * saves on schedule.
 */
function stateSignature(): string {
  const s = useGameStore.getState();
  const missionState = s.missions
    .map((m) => `${m.status}:${Math.round((m.timeRemaining ?? 0) / 60)}:${m.assignedUnits.length}`)
    .join(',');
  const unitState = s.units.map((u) => `${u.status}:${u.missionId ?? ''}`).join(',');
  // Settings changes ride into the next autosave so a save's snapshot stays
  // fresh enough to restore preferences in a fallback scenario.
  const st = loadSettings();
  const settingsState = [
    st.soundEnabled, st.soundVolume, st.musicEnabled, st.gameSpeed, st.darkMode,
    st.missionPace, st.maxActiveMissions, st.disasterFrequency, st.fatigueMode,
    st.cpuMutualAid, st.colorblindHeat, st.patrolShiftMinutes,
    st.defaultPostMissionBehavior, st.pushEnabled, st.profileName, st.avatarEmoji,
  ].join('|');
  return [
    s.player?.credits ?? -1,
    s.player?.xp ?? -1,
    s.player?.level ?? -1,
    s.career.missionsCompleted,
    s.career.totalCreditsEarned,
    s.missions.length,
    s.units.length,
    s.stations.length,
    s.patrolRoutes.length,
    s.criminalRecords.length,
    s.inmates.length,
    s.patients.length,
    s.investigations.length,
    s.placedPois.length,
    s.hospital?.id ?? '',
    s.helipad?.id ?? '',
    // The tour position changes rarely but must trigger a save: without it, a
    // mid-tour reload restores the step from the LAST autosave (up to a minute
    // stale) or the beacon misses the change entirely.
    s.onboardingStep,
    JSON.stringify(s.challenges),
    s.fogRevealed.length,
    s.missionHistory.length,
    s.snapshots.length,
    s.tutorialCampaign.stepIndex,
    s.tutorialCampaign.active ? 1 : 0,
    missionState,
    unitState,
    settingsState,
  ].join('|');
}

// ── Campaign guard ─────────────────────────────────────────────────────────
// The tab-close beacon (and any save call) must NEVER persist the boot/menu
// state of the store — on a fresh page load the store holds only the account
// identity and settings (no city, no fleet, gameMinutes reset to 180), and
// writing that snapshot over a real save silently destroys the campaign (the
// v0.17.8-era beacon clobber: close the tab on the main menu → next Continue
// loads a blank campaign on the default New York map).

/** True when a campaign is actually loaded in the store. */
function hasActiveCampaign(): boolean {
  const s = useGameStore.getState();
  return !!s.player && !!s.selectedCity;
}

/** A save payload only counts as a campaign when it names a city. */
function saveHasCampaign(save: SaveData | undefined | null): boolean {
  return !!save && !!save.selectedCity;
}

// Set when the server returned a save row that turned out to be an empty
// boot-state snapshot (the pre-guard beacon clobber) — lets Continue recover
// the local mirror even for real accounts in exactly that corruption case,
// while real accounts with legitimately-empty servers still start clean.
let serverSaveWasEmpty = false;

// Module-level because the autosave interval, the beacon, and manual saves all
// share them — a slow manual save must not collide with the next autosave tick.
// Saves serialize: a manual save waits for any in-flight autosave, so the UI's
// "Saved" confirmation is only shown once the write actually landed.
let saveQueue: Promise<boolean> = Promise.resolve(true);
let lastSavedSignature = '';
let lastSaveAuthError = false;
let lastSaveFailureKind: SaveFailureKind = 'server';
let lastSaveTooLargeError = false;
let lastSaveStaleError = false;

// ── Saved-player baseline (live admin-grant delivery) ─────────────────────
// The last server-persisted player totals. The /me poll (App.tsx) computes
// admin grants as `server − baseline` and ADDS them on top of the live store,
// so a grant is delivered instantly without ever clobbering earnings that
// happened since the last save. Captured on every successful save and on every
// load; null means "no save yet this session" (the poll then treats the live
// store as the baseline and applies nothing).
export interface PlayerBaseline {
  credits: number;
  coins: number;
  xp: number;
  level: number;
}

let lastSavedPlayerBaseline: PlayerBaseline | null = null;

function playerBaselineFrom(player: Player | null): PlayerBaseline | null {
  if (!player) return null;
  return { credits: player.credits, coins: player.coins, xp: player.xp, level: player.level };
}

export function getSavedPlayerBaseline(): PlayerBaseline | null {
  return lastSavedPlayerBaseline;
}

export function setSavedPlayerBaseline(baseline: PlayerBaseline | null): void {
  lastSavedPlayerBaseline = baseline;
}

// ── Applied grant ids (Batch 1, P1-M3 ledger delivery) ─────────────────────
// The server marks a grant delivered on ack, but a crash between applying a
// grant locally and the ack landing would re-deliver it on the next poll —
// so applied ids ALSO persist in localStorage (capped FIFO, newest 500).
// The poll filters pending grants against this set before applying.
const APPLIED_GRANTS_KEY = 'dhq_applied_grants_v1';

export function loadAppliedGrantIds(): Set<string> {
  try {
    const raw = localStorage.getItem(APPLIED_GRANTS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveAppliedGrantIds(ids: Set<string>): void {
  try {
    const arr = [...ids].slice(-500);
    localStorage.setItem(APPLIED_GRANTS_KEY, JSON.stringify(arr));
  } catch {
    // Storage full/blocked — the server-side ack is the other dedup layer.
  }
}

/** True when the most recent saveGame failed because the session token is no
 * longer valid (deploy restarts can orphan tokens). Lets the UI say "sign back
 * in" instead of a generic retry hint. */
export function hadSaveAuthFailure(): boolean {
  return lastSaveAuthError;
}

/** Batch 3d: kind of the most recent saveGame failure (server = default). */
export function lastSaveFailure(): SaveFailureKind {
  return lastSaveFailureKind;
}

/** Batch 3d: the most recent saveGame failed with a too-large payload. */
export function hadSaveTooLargeFailure(): boolean {
  return lastSaveTooLargeError;
}

/** Batch 3d: the most recent saveGame was rejected as stale. */
export function hadSaveStaleFailure(): boolean {
  return lastSaveStaleError;
}

export function saveGame(slot?: string): Promise<boolean> {
  const name = normalizeSlot(slot);
  const run = async (): Promise<boolean> => {
    if (!hasActiveCampaign()) {
      // Boot/menu state — nothing to persist. Mark the signature so the
      // autosave loop doesn't spin, and leave the server + mirror untouched:
      // writing this snapshot would clobber the player's real save.
      lastSavedSignature = stateSignature();
      return true;
    }
    const data = buildSaveData();
    // Mirror the ACTIVE campaign, before the network write: even when the server
    // is down (autosave failure), the browser keeps the latest known-good state
    // so the next Continue can recover progress instead of losing it. Explicit
    // saves to other slots are not mirrored — the mirror must only ever
    // represent the campaign the player is actually playing.
    if (name === getActiveSlot()) writeLocalMirror(data);
    try {
      await storeSave(name, SLOT_LABELS[name], data);
      lastSavedPlayerBaseline = playerBaselineFrom(data.player);

      setSlotInfo(name, {
        slot: name,
        label: SLOT_LABELS[name],
        exists: true,
        createdAt: slotsInfo?.[name]?.createdAt ?? new Date(data.timestamp).toISOString(),
        updatedAt: new Date(data.timestamp).toISOString(),
        preview: derivePreviewFromPayload(data),
      });
      lastSavedSignature = stateSignature();
      return true;
    } catch (e) {
      console.error('Failed to save game:', e);
      // Batch 3d: three-way failure split (offline / too-large / stale /
      // auth / server) so autosave + Save Now never mislabel the cause.
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      lastSaveFailureKind = classifySaveError(e, online);
      lastSaveAuthError = lastSaveFailureKind === 'auth';
      lastSaveTooLargeError = lastSaveFailureKind === 'too-large';
      lastSaveStaleError = lastSaveFailureKind === 'stale';
      if (lastSaveFailureKind === 'offline') dispatchSaveQueued();
      return false;
    }
  };
  // Chain onto the previous save so writes never overlap.
  const result = saveQueue.then(run, run);
  saveQueue = result.catch(() => false);
  return result;
}

/** Best-effort save that survives tab close (uses sendBeacon — no await). */
export function beaconSave(slot?: string): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  // Never beacon the boot/menu state over a real save (the v0.17.8-era
  // clobber) — only a loaded campaign is worth persisting.
  if (!hasActiveCampaign()) return;
  try {
    const name = normalizeSlot(slot);
    const payload = {
      slot: name,
      label: SLOT_LABELS[name],
      data: buildSaveData(),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    // Match the configured API base (same-origin only — sendBeacon can't send
    // cross-origin credentials, so this targets the default /api deployment).
    navigator.sendBeacon(`${API_BASE}/player/saves`, blob);
  } catch (e) {
    console.warn('Beacon save failed:', e);
  }
}

/** Result of a load attempt so callers can distinguish a genuine "no save"
 * (Continue falls through to a new campaign) from a transient failure (stay on
 * the menu and tell the player). */
export type LoadResult = 'loaded' | 'not-found' | 'error';

/**
 * Restore a parsed save into the store. Each field is applied defensively so
 * one malformed value can never void the entire load — the load degrades
 * gracefully instead.
 */
function restoreSave(save: SaveData): void {
  const store = useGameStore.getState();
  const guard = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      console.warn(`Save restore skipped field "${label}":`, e);
    }
  };

  if (save.player) {
    const current = store.player;
    // Restore gameplay from the save, but never let a stale/guest save
    // clobber the authenticated identity (id, email, username).
    store.setPlayer({
      ...save.player,
      ...(current ? { id: current.id, email: current.email, username: current.username } : {}),
    });
    lastSavedPlayerBaseline = playerBaselineFrom(save.player);
  }
  guard('selectedCity', () => { if (save.selectedCity) store.setSelectedCity(save.selectedCity); });
  guard('selectedService', () => { if (save.selectedService) store.setSelectedService(save.selectedService); });
  guard('mapBounds', () => {
    const bounds = save.mapBounds || (save.selectedCity
      ? (save.selectedCity.bounds || estimateCityBounds(save.selectedCity.lat, save.selectedCity.lng))
      : null);
    if (bounds) store.setMapBounds(bounds);
  });
  guard('stations', () => store.setStations(Array.isArray(save.stations) ? save.stations : []));
  guard('units', () => {
    const raw = Array.isArray(save.units) ? save.units : [];
    // Fire/EMS rigs never patrol (police-only beats) — self-heal any unit that
    // carried a patrol assignment from an older save so it returns to station
    // duty on load instead of resuming a route it should never have.
    const units = raw.map((u) =>
      getUnitServiceType(u.type) === 'police' || (u.status !== 'patrolling' && !u.patrolRouteId)
        ? u
        : {
            ...u,
            status: 'available' as const,
            patrolRouteId: null,
            patrolWaypointIndex: undefined,
            patrolProgress: undefined,
            patrolShiftEndsAt: undefined,
            destination: null,
            waypoints: undefined,
            waypointIndex: undefined,
            eta: null,
            postMissionBehavior: 'return' as const,
          },
    );
    store.setUnits(units.map((u) => ensureUnitStaffDefaults(u)));
  });
  guard('missions', () => store.setMissions(Array.isArray(save.missions) ? save.missions : []));
  guard('tech', () => store.setTechPurchased(Array.isArray(save.techPurchased) ? save.techPurchased : []));
  guard('records', () => store.setCriminalRecords(Array.isArray(save.criminalRecords) ? save.criminalRecords : []));
  guard('inmates', () => store.setInmates(Array.isArray(save.inmates) ? save.inmates : []));
  guard('patients', () => store.setPatients(Array.isArray(save.patients) ? save.patients : []));
  guard('investigations', () => store.setInvestigations(Array.isArray(save.investigations) ? save.investigations : []));
  guard('placedPois', () => store.setPlacedPois(Array.isArray(save.placedPois) ? save.placedPois : []));
  guard('hospital', () => store.setHospital(save.hospital ?? null));
  guard('helipad', () => store.setHelipad(save.helipad ?? null));
  guard('batch3b', () => {
    store.setDistrictSatisfaction(save.districtSatisfaction ?? {});
    store.setAdoptedCities(parseAdoptedCities(save.adoptedCities));
    store.setDisasterWave(save.disasterWave ?? null);
  });
  guard('batch3d', () => {
    store.setChallenges(parseChallengeState(save.challenges));
    store.setFogRevealed(parseFogRevealed(save.fogRevealed));
  });
  guard('batch3e', () => {
    store.setMissionHistory(Array.isArray(save.missionHistory) ? save.missionHistory : []);
    store.setSnapshots(parsePhotoGallery(save.snapshots));
    store.setTutorialCampaign(parseTutorialCampaign(save.tutorialCampaign));
  });
  guard('gameClock', () => {
    if (typeof save.gameMinutes === 'number' && Number.isFinite(save.gameMinutes)) {
      store.advanceGameClock(save.gameMinutes - store.gameMinutes);
    }
  });
  guard('onboardingStep', () => {
    // Restore the exact tour position so a mid-tour reload resumes where it
    // left off. Legacy saves (no field) get the DONE sentinel: a commander
    // who played under the old system must not be surprised by the tutorial
    // on every Continue — only a genuinely mid-tour save resumes it.
    if (typeof save.onboardingStep === 'number' && Number.isFinite(save.onboardingStep)) {
      store.setOnboardingStep(save.onboardingStep);
    } else {
      store.setOnboardingStep(-1);
    }
  });
  guard('weekly', () => store.setWeekly(save.weekly ?? emptyWeekly()));
  guard('career', () => store.setCareer(save.career ? { ...save.career } : { ...EMPTY_CAREER }));
  guard('patrolRoutes', () => store.setPatrolRoutes(Array.isArray(save.patrolRoutes) ? save.patrolRoutes : []));
  guard('patrolDefaults', () => {
    if (save.defaultPostMissionBehavior) store.setDefaultPostMissionBehavior(save.defaultPostMissionBehavior);
    if (save.defaultPatrolMode) store.setDefaultPatrolMode(save.defaultPatrolMode);
  });
  guard('settings', () => {
    // Restore the save's preferences snapshot only when the live hydration did
    // NOT come from a server row (fresh identity, lost row, or offline boot).
    // The account row is authoritative when present — a save must never
    // overwrite settings that changed after the save was written. saveSettings
    // also re-pushes the restored snapshot so the row self-heals.
    if (save.settings && getSettingsSource() !== 'server') {
      saveSettings(save.settings);
    }
  });
}

function estimateCityBounds(lat: number, lng: number): [[number, number], [number, number]] {
  const delta = 0.05;
  return [
    [lat - delta, lng - delta],
    [lat + delta, lng + delta],
  ];
}

/** Slots to try for a plain "Continue": the active slot first, then the rest
 * by recency so a campaign saved elsewhere is still reachable. */
function resumeOrder(): SaveSlotId[] {
  const active = getActiveSlot();
  const rest = SAVE_SLOT_IDS
    .filter((id) => id !== active)
    .sort((a, b) => (slotsInfo?.[b]?.updatedAt ?? '').localeCompare(slotsInfo?.[a]?.updatedAt ?? ''));
  return [active, ...rest];
}

export async function loadGame(slot?: string): Promise<LoadResult> {
  serverSaveWasEmpty = false;
  if (slot && isCanonicalSlot(slot)) return loadFromSlot(slot as SaveSlotId, /* markActive */ true);
  // No explicit slot → Continue: active first, then recency order.
  let lastResult: LoadResult = 'not-found';
  for (const candidate of resumeOrder()) {
    const result = await loadFromSlot(candidate, /* markActive */ candidate === getActiveSlot());
    if (result === 'loaded') {
      // A resume that landed on a non-active slot (the active one was empty)
      // makes that slot the campaign home — otherwise autosave would write
      // into the empty active slot and strand the loaded progress.
      setActiveSlot(candidate);
      return result;
    }
    // A transient failure on ANY candidate means we can't be certain there is
    // no save — surface 'error' (the caller stays on the menu) instead of
    // collapsing to 'not-found', which used to bounce Continue into a brand-
    // new campaign and could strand the player's actual progress.
    if (result === 'error') lastResult = 'error';
  }
  // Every candidate was cleanly absent (or failed). Recover the browser mirror
  // as a last resort — guests always; a real account only when the server's
  // rows were empty boot-state snapshots (the beacon clobber), never when the
  // server is legitimately empty (clean slate rather than inheriting another
  // device's campaign).
  const mirror = readLocalMirror();
  if (mirror && (isGuestSession() || serverSaveWasEmpty) && saveHasCampaign(mirror)) {
    console.warn('Loading game from the local mirror (server save absent or empty).');
    restoreSave(mirror);
    writeLocalMirror(mirror);
    return 'loaded';
  }
  return lastResult;
}

async function loadFromSlot(slot: SaveSlotId, markActive: boolean): Promise<LoadResult> {
  const restore = (save: SaveData): 'loaded' => {
    if (save.version && save.version > SAVE_VERSION) {
      console.warn(`Save v${save.version} is newer than this build (v${SAVE_VERSION}); loading anyway`);
    }
    restoreSave(save);
    writeLocalMirror(save);
    if (markActive) setActiveSlot(slot);
    return 'loaded';
  };

  try {
    const data = await loadSaveFromServer(slot);
    if (data && data.data) {
      const save = data.data as SaveData;
      if (saveHasCampaign(save)) return restore(save);
      // The row exists but holds no campaign (boot-state snapshot written by
      // the pre-guard tab-close beacon). Treat it as absent so Continue falls
      // through to the mirror — loading it would drop the player onto a blank
      // map (the default New York center) with none of their fleet.
      serverSaveWasEmpty = true;
      console.warn(`Save slot ${slot} exists but has no campaign; ignoring and falling back to the mirror.`);
    }
    // Server answered cleanly with no usable save for this slot. If this
    // browser still remembers a campaign, recover from the mirror — guests
    // always; real accounts when the server row was an empty clobber.
    const mirror = readLocalMirror();
    if (mirror && markActive && (isGuestSession() || serverSaveWasEmpty) && saveHasCampaign(mirror)) {
      console.warn('Loading game from the local mirror (server save absent or empty).');
      return restore(mirror);
    }
    return 'not-found';
  } catch (e) {
    console.error('Failed to load game from server:', e);
    // Network/auth failure — the mirror is the only remaining source. Guests
    // can always recover; real accounts too (offline play must not be lost),
    // since the failure is transient rather than a definitive empty save.
    const mirror = readLocalMirror();
    if (mirror && saveHasCampaign(mirror)) {
      console.warn('Loading game from the local mirror (server unavailable).');
      return restore(mirror);
    }
    return 'error';
  }
}

export async function deleteSaveGame(slot?: string): Promise<void> {
  const name = normalizeSlot(slot);
  try {
    await deleteSaveOnServer(name);
    setSlotInfo(name, makeEmptySlotInfo(name));
  } catch { /* noop */ }
  // Deleting the active slot should also drop the local mirror so the campaign
  // truly disappears and doesn't resurrect from the browser on the next Continue.
  if (name === getActiveSlot()) clearLocalMirror();
}

interface SaveSystemOptions {
  /** Called after each autosave attempt with its outcome. */
  onStatus?: (status: SaveStatus) => void;
}

export function useSaveSystem(isPlaying: boolean, options: SaveSystemOptions = {}) {
  const { onStatus } = options;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!isPlaying) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    let lastOk = true;

    const attempt = async () => {
      const signature = stateSignature();
      // Skip when nothing changed since the last successful save (or the last
      // attempt — avoids retry loops while the state is identical).
      if (signature === lastSavedSignature) return;

      const ok = await saveGame();
      if (ok) {
        const recovered = !lastOk;
        consecutiveFailures = 0;
        lastOk = true;
        if (recovered) onStatusRef.current?.('recovered');
      } else {
        lastOk = false;
        consecutiveFailures += 1;
        // Report the first failure of a streak; stay quiet on repeats to avoid spam.
        if (consecutiveFailures === 1) onStatusRef.current?.('failed');
        // Back off, but stop retrying a dead server — the 60s tick re-attempts.
        if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
          if (retryTimer) clearTimeout(retryTimer);
          const delay = Math.min(RETRY_BASE_MS * consecutiveFailures, RETRY_BACKOFF_MS);
          retryTimer = setTimeout(() => { void attempt(); }, delay);
        }
      }
    };

    void attempt();
    const interval = setInterval(() => { void attempt(); }, AUTOSAVE_INTERVAL);

    return () => {
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isPlaying]);

  const manualSave = useCallback(async (slot?: string) => saveGame(slot), []);
  const manualLoad = useCallback(async (slot?: string) => loadGame(slot), []);

  return { manualSave, manualLoad };
}

// Register a tab-close/background beacon so closing the tab doesn't lose the
// last minute of play. Registered once at module load. Skips when the state is
// already saved (nothing changed since the last successful write). A short
// guard debounces the pagehide + visibilitychange pair that both fire on close.
if (typeof window !== 'undefined') {
  let lastBeaconAt = 0;
  const fireBeacon = () => {
    if (!hasActiveCampaign()) return;
    if (stateSignature() === lastSavedSignature) return;
    const now = Date.now();
    if (now - lastBeaconAt < 2000) return;
    lastBeaconAt = now;
    beaconSave();
  };
  window.addEventListener('pagehide', fireBeacon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') fireBeacon();
  });
}
