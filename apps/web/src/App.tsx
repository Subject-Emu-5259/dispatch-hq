// ============================================
// Dispatch HQ — Main App Component
// ============================================

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { TopBar } from './components/TopBar';
const Sidebar = lazy(() => import('./components/Sidebar').then((m) => ({ default: m.Sidebar })));
import { BottomBar } from './components/BottomBar';
import { MobileNav } from './components/MobileNav';
const CitySelectionScreen = lazy(() => import('./components/CitySelectionScreen').then((m) => ({ default: m.CitySelectionScreen })));
import { StressMeter } from './components/StressMeter';
import { FogOfWar } from './components/FogOfWar';
import { LoadingScreen } from './components/LoadingScreen';
const MainMenu = lazy(() => import('./components/MainMenu').then((m) => ({ default: m.MainMenu })));
// On-demand panels are code-split (v0.22.3 perf pass) so the initial bundle
// stays lean. Everything below only mounts while its modal/panel/screen is
// open, so the lazy boundary is invisible; MapView is the ONLY maplibre-gl
// consumer, so splitting it pulls the whole map engine (≈800KB) out of the
// first-load bundle. Its Suspense fallback is the map's own pre-tile state.
const MapView = lazy(() => import('./components/map/MapView').then((m) => ({ default: m.MapView })));
const BuildStationModal = lazy(() => import('./components/BuildStationModal').then((m) => ({ default: m.BuildStationModal })));
const BuildPoiModal = lazy(() => import('./components/BuildPoiModal').then((m) => ({ default: m.BuildPoiModal })));
const OnboardingOverlay = lazy(() => import('./components/OnboardingOverlay').then((m) => ({ default: m.OnboardingOverlay })));
const EmployeesPanel = lazy(() => import('./components/EmployeesPanel').then((m) => ({ default: m.EmployeesPanel })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const ShopModal = lazy(() => import('./components/ShopModal').then((m) => ({ default: m.ShopModal })));
const PauseScreen = lazy(() => import('./components/PauseScreen').then((m) => ({ default: m.PauseScreen })));
const StationsPanel = lazy(() => import('./components/StationsPanel').then((m) => ({ default: m.StationsPanel })));
// Heavy panels are code-split (v0.18.0 perf pass) so the initial bundle stays lean.
const TechTree = lazy(() => import('./components/TechTree').then((m) => ({ default: m.TechTree })));
import { RandomEvents, useRandomEvents } from './components/RandomEvents';
import { WeatherOverlay } from './components/WeatherOverlay';
import { useGameStore } from './stores/gameStore';
const AuthScreen = lazy(() => import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen })));
import { apiFetch, syncCareerStats, setUnauthorizedHandler, fetchMyAlliance, fetchPendingGrants, ackGrants, reportSeasonalClear } from './lib/apiClient';
import { useSaveSystem, loadGame, hasSaveGame, saveGame, refreshSaveSlots, clearLocalSaveCache, deleteSaveGame, setActiveSlot, wasSessionActive, markSessionActive, clearSessionActive, getSavedPlayerBaseline, setSavedPlayerBaseline, loadAppliedGrantIds, saveAppliedGrantIds, type SaveSlotId } from './hooks/useSaveSystem';
import { useAchievements } from './hooks/useAchievements';
const AIDispatch = lazy(() => import('./components/AIDispatch').then((m) => ({ default: m.AIDispatch })));
const UnifiedDispatchCenter = lazy(() => import('./components/UnifiedDispatchCenter').then((m) => ({ default: m.UnifiedDispatchCenter })));
const RadioComms = lazy(() => import('./components/RadioComms').then((m) => ({ default: m.RadioComms })));
const SelectedUnitPanel = lazy(() => import('./components/SelectedUnitPanel').then((m) => ({ default: m.SelectedUnitPanel })));
import { wsClient } from './lib/wsClient';
import type { Mission, GeoPoint, Unit, Station, ServiceType, Player, PresenceActivity, ClientMessage } from '@dispatch-hq/shared';
const PlayersPanel = lazy(() => import('./components/PlayersPanel').then((m) => ({ default: m.PlayersPanel })));
import type { CityData } from './stores/gameStore';
import { generateInitialRoster, autoAssignCrew } from '@/lib/employees';
import { bookInmate } from '@/lib/jailCapacity';
import { analyticsSessionStart, analyticsMissionCompleted, analyticsSessionEnd } from '@/lib/analytics';
import { buildPatientFromMission, buildInvestigationFromMission } from '@/lib/agencies';
import { buildMission, buildTrafficDutyMission, getCityRadiusKm, activeMissionCap } from '@/lib/spawn';
import { serviceCanAnswerMission, backupServicesFor, serviceDisplayName, dispatchUnitToMission, findNearestBackupUnit } from '@/lib/dispatchLogic';
import { getWeatherEffects, currentWeather } from '@/lib/weather';
import { getCityTrait } from '@/lib/cityTraits';
import {
  DISASTER_DEFINITIONS, maybeTriggerDisaster, pickDisasterZone,
  RECOVERY_WAVE, AFTERMATH_WINDOW_MS, AFTERMATH_SPAWN_GAP_MS,
  type ActiveDisaster,
  adaptWaveToService, waveWasAdapted,
} from '@/lib/disasters';
import { spawnChainStage } from '@/lib/missionChains';
import { computeMissionRewards, missionService } from '@/lib/rewards';
import { unlockedDistricts, satisfactionFor, satisfactionDeltaForResponse, applySatisfaction, districtRewardMultiplier, pickDistrictForSpawn } from '@/lib/cityDistricts';
import { startDisasterWave, recordWaveSpawned, recordWaveCompletion, currentWaveStage, waveRewardMultForStage, type DisasterWaveState } from '@/lib/disasterWaves';
import { recordAdoptedCityMission } from '@/lib/adoptedCities';
import { CPU_UNIT_NAME, cpuWorkSeconds, cpuMutualAidPayout, partnerAgencyServices, cityAnswersCall, partnerCallAnswerable } from '@/lib/cpuMutualAid';
import { unitCanPatrol } from '@/lib/dispatchLogic';
import { activeSeasonalEvent, seasonalRewardMult, type SeasonalEvent } from '@/lib/seasonal';
import { advancePersonnel, stationCrewEffectiveness, OVERWORK_THRESHOLD } from '@/lib/personnel';
import { applyMissionVeterancy, completeAcademy, eligibleCertForMission, unitHasCert } from '@/lib/unitsStaff';
import { stationRewardMultiplier } from '@dispatch-hq/shared';
import { runPoliceFieldActivity, tickPursuitRadio, clearPursuitTracking } from '@/lib/fieldActivities';
import { hasCompletedTutorial } from '@/lib/tutorialSeen';
import { getMissionPriority, getMissionsForService, RECOVERY_TEMPLATES, rankForLevel, difficultyTierFor, allianceLevelFor, isoWeekKey, advanceLevel, stationServiceFor, premiumCreditMultiplier, type WeeklySnapshot } from '@dispatch-hq/shared';
import { isTraining, finishUnitTraining } from './lib/training';
import type { ServerMessage } from '@dispatch-hq/shared';
import { Bot, Crosshair, Map, Radio, Layers, Monitor } from 'lucide-react';
import { generateRoadPath, getPositionOnPath, haversineKm } from './utils/roadPathfinding';
import { patrolZonesForCity, zoneIdForPoint } from './lib/patrol/patrolZones';
import { TRANSPORT_TIMEOUT_MS, AIR_TRANSPORT_TIMEOUT_MS, AIR_SPEED_MS, atCapacity, traumaCenterFor } from '@/lib/hospital';
import { poiById } from '@/lib/pois';
import { generatePatrolRoute, fetchDrivingRoute, getUnitServiceType, generateGridRoadPath } from './utils/routing';
import { getPatrolShiftMs, getMissionPaceMs, loadSettings, saveSettings, initSettings, getMutualAidChance, subscribeSettings } from '@/utils/settings';
import {
  applyTravelTech,
  getMissionRewardMultiplier,
  getPatrolSightRadiusDegrees,
  getClearSpeedMultiplier,
} from './lib/techTree';
import { NotificationPanel, NotificationProvider, useNotifications } from './components/NotificationCenter';
import { useUpdateNudge } from './hooks/useUpdateNudge';
import {
  playSuccess, playMissionAlert, initAudio,
  playSiren, playChainComplete, playLevelUp, playDisasterAlert,
  playCash, playPursuitAlert,
  startAmbient, stopAmbient,
} from '@/utils/sound';
import { notify } from '@/utils/notify';
import { broadcastRadioMessage, broadcastRadioSequence, wasRadioKeyDispatched, markRadioKeyDispatched } from '@/utils/radioEvents';
// Lazy-loaded: the radio dialogue sequence generators are code-split (~50KB)
// so they don't bloat the main bundle.
let _backupSeq: typeof import('@/lib/radioDialogueEngine.lazy').backupDispatchSequence | null = null;
async function loadBackupSequence() {
  if (!_backupSeq) _backupSeq = (await import('@/lib/radioDialogueEngine.lazy')).backupDispatchSequence;
  return _backupSeq;
}

type NavTab = 'missions' | 'stations' | 'units' | 'employees' | 'leaderboard' | 'chat';

declare const __BUILD_TIME__: string;

type GameScreen = 'loading' | 'auth' | 'menu' | 'city-select' | 'playing';

// ── Cross-service mission types: all three services coexist ──

const SERVICE_CONFIG: Record<ServiceType, { icon: string; color: string; label: string }> = {
  fire:    { icon: '🔥', color: 'text-orange-400', label: 'Fire' },
  police:  { icon: '🚔', color: 'text-blue-400',   label: 'Police' },
  ems:     { icon: '🚑', color: 'text-green-400',  label: 'EMS' },
};

// ── Patrol shift lifecycle constants ──
const PATROL_REST_SEC = 60;                 // 60s rest break at the station after a shift
const PATROL_REGEN_MS = 2.5 * 60 * 1000;   // re-plan a patrol route once stale (tracks live heat)

// ── Cross-service assistance: when a mission is severe, call in other services ──
function getAssistingServices(mission: Mission): ServiceType[] {
  const assisting: ServiceType[] = [];
  // Weather shifts which departments are most needed on scene (see lib/weather):
  // a heatwave makes EMS support more likely, a storm pulls in police for
  // traffic control. Thresholds scale with the boosted service's spawn weight.
  const fx = getWeatherEffects(currentWeather());
  const eager = (service: ServiceType, base: number) =>
    Math.max(2, Math.round(base / (fx.spawnWeights[service] ?? 1)));
  if (mission.difficulty >= 3) {
    if (mission.category === 'fire') {
      if (mission.difficulty >= eager('ems', 3)) assisting.push('ems');    // fire scenes need medical
      if (mission.difficulty >= eager('police', 4)) assisting.push('police'); // crowd control
    } else if (mission.category === 'police') {
      if (mission.difficulty >= eager('ems', 4)) assisting.push('ems'); // injuries likely
    } else if (mission.category === 'ems') {
      if (mission.difficulty >= eager('fire', 4)) assisting.push('fire'); // extrication
    }
  }
  return assisting;
}

/** Resolve a disaster/recovery template id against the real template pools. */
function getMissionTemplateById(templateId: string) {
  return getMissionsForService('fire')
    .concat(getMissionsForService('police'), getMissionsForService('ems'), RECOVERY_TEMPLATES)
    .find((t) => t.id === templateId);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Roll out the recovery wave near the disaster zone, one call at a time, so the
 * city visibly returns to normal instead of snapping back. Each call is a
 * low-stakes restoration mission (damage assessment / displaced residents /
 * debris clearing) with reduced payouts.
 */
async function spawnRecoveryWave(aftermath: ActiveDisaster): Promise<void> {
  // Adapt the restoration wave to the city's department: cross-service calls
  // only roll when a partner station makes them answerable (see adaptWaveToService).
  const initial = useGameStore.getState();
  const adaptedWave = adaptWaveToService(RECOVERY_WAVE, initial.selectedService, initial.stations);
  for (const [i, item] of adaptedWave.entries()) {
    if (i > 0) await sleep(AFTERMATH_SPAWN_GAP_MS);
    const st = useGameStore.getState();
    const live = st.activeDisaster;
    // Abort if the aftermath window closed or a new emergency took over.
    if (!live || live.phase !== 'aftermath' || live.id !== aftermath.id) return;
    try {
      const mission = await buildMission(item.service, st.selectedCity, {
        level: st.player?.level ?? 1,
        template: getMissionTemplateById(item.templateId),
        origin: aftermath.zone,
        prefix: 'Recovery: ',
      });
      mission.recovery = true;
      mission.disasterId = aftermath.id;
      st.addMission(mission);
      // Merge with the live record so completions counted mid-spawn aren't lost.
      const cur = useGameStore.getState().activeDisaster;
      if (cur && cur.id === aftermath.id) {
        st.setDisaster({ ...cur, recoverySpawned: (cur.recoverySpawned ?? 0) + 1 });
      }
      broadcastRadioMessage({
        from: 'Dispatch',
        to: 'All Units',
        text: `${mission.name} in the affected zone — restoration effort underway.`,
        type: 'dispatch',
        service: item.service,
      });
    } catch {
      // Road-snapping can fail offline — skip this recovery call.
    }
  }
}

function recordSpeedUpdate(u: Unit, position: GeoPoint): { currentSpeed: number; lastPosition: GeoPoint; lastPositionAt: number } {
  const now = Date.now();
  let currentSpeed = 0;
  if (u.lastPosition && u.lastPositionAt && now > u.lastPositionAt + 50) {
    const dt = (now - u.lastPositionAt) / 1000;
    const distM = haversineKm(u.lastPosition, position) * 1000;
    if (dt > 0) {
      const instant = distM / dt;
      const prev = u.currentSpeed || 0;
      // Exponential moving average: more responsive at higher game speeds, still smooth.
      const alpha = Math.min(1, Math.max(0.1, dt / 1.2));
      currentSpeed = prev * (1 - alpha) + instant * alpha;
    }
  }
  return { currentSpeed, lastPosition: position, lastPositionAt: now };
}

/**
 * Find the arc-length progress (0..1) of the point on a polyline nearest to `pos`.
 * Used when a patrol unit joins/resumes a route off-polyline (mission return, rest
 * break, route re-plan) so it continues from the closest street point instead of
 * flying in a straight line across the city.
 */
function nearestRouteProgress(wpPoints: GeoPoint[], pos: GeoPoint, totalKm: number): number {
  let best = 0;
  let bestDist = Infinity;
  let acc = 0;
  for (let i = 0; i < wpPoints.length - 1; i++) {
    const a = wpPoints[i];
    const b = wpPoints[i + 1];
    const segLen = haversineKm(a, b);
    const abLat = b.lat - a.lat;
    const abLng = b.lng - a.lng;
    const len2 = abLat * abLat + abLng * abLng;
    let t = len2 > 0 ? ((pos.lat - a.lat) * abLat + (pos.lng - a.lng) * abLng) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const proj = { lat: a.lat + abLat * t, lng: a.lng + abLng * t };
    const d = haversineKm(pos, proj);
    if (d < bestDist) {
      bestDist = d;
      best = totalKm > 0 ? (acc + segLen * t) / totalKm : 0;
    }
    acc += segLen;
  }
  return Math.max(0, Math.min(1, best));
}

function ThemeShell({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useGameStore();
  return (
    <div className={isDarkMode ? 'dark fixed inset-0' : 'light-theme fixed inset-0'}>
      {children}
    </div>
  );
}

function GameApp() {
  const {
    stations, missions, units, isBuildModalOpen, setBuildModalOpen,
    isBuildPoiModalOpen, setBuildPoiModalOpen,
    addMission, addUnit, updateUnit, player, updatePlayer, addStation,
    isSidebarOpen, toggleSidebar,
    selectedCity, selectedService, setSelectedService, mapBounds,
    wsConnected, onlineCount, maintenance,
    showTactical, showRadio, mapStyle, toggleTactical, toggleRadio, setMapStyle,
    toggleDispatchCenter, showDispatchCenter, showPatrolHeat, togglePatrolHeat,
    showStationCoverage, toggleStationCoverage,
    showCoverageGap, toggleCoverageGap,
    isDarkMode, toggleDarkMode, activeDisaster, setDisaster,
    onboardingStep,
  } = useGameStore();

  const { addNotification } = useNotifications();
  const [gameScreen, setGameScreen] = useState<GameScreen>(() => {
    return 'loading';
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Bumped on every 'Replay Tutorial' so the overlay remounts fresh (its
  // internal step state resets to 1 even if the tour is already showing).
  const [onboardingRun, setOnboardingRun] = useState(0);
  const [pendingStationLocation, setPendingStationLocation] = useState<GeoPoint | null>(null);
  const [pendingPoiLocation, setPendingPoiLocation] = useState<GeoPoint | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<NavTab>('missions');
  const completedMissionsRef = useRef<Set<string>>(new Set());
  const interceptedMissionsRef = useRef<Set<string>>(new Set());
  // Last presence signature sent (city + activity) — avoid spamming the server.
  const lastPresenceRef = useRef<string>('');
  // Last-seen mission status per id — used to fire the siren exactly when a
  // unit is dispatched (active → en_route), not on every tick or on load.
  const missionStatusRef = useRef<Record<string, string>>({});
  // CPU Mutual Aid: mission id → when the simulated city unit started responding.
  // `globalThis.Map` because lucide-react's `Map` icon shadows the global here.
  const cpuMutualAidRef = useRef<Map<string, number>>(new globalThis.Map());
  const levelRef = useRef(1);

  // Expanded mechanics state
  const [showCAD, setShowCAD] = useState(false);
  const [showTechTree, setShowTechTree] = useState(false);
  const [showFogOfWar, setShowFogOfWar] = useState(false);
  const [showPause, setShowPause] = useState(false);
  // Relocate Command (v0.21.0): the city picker re-opens in relocate mode from
  // the pause menu, and on confirm the fleet re-settles instead of resetting.
  const [relocating, setRelocating] = useState(false);
  const [showAIDispatch, setShowAIDispatch] = useState(false);
  const toggleAIDispatch = () => setShowAIDispatch(v => !v);
  const [rightDockOpen, setRightDockOpen] = useState(false);
  const [showDispatchAssistant, setShowDispatchAssistant] = useState(false);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [failedMissions, setFailedMissions] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [followTarget, setFollowTarget] = useState<GeoPoint | null>(null);
  const [showMenuSettings, setShowMenuSettings] = useState(false);
  // Commanders Online panel behind the floating online chip (v0.22.17).
  const [showPlayersPanel, setShowPlayersPanel] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showStationsPanel, setShowStationsPanel] = useState(false);
  const [showEmployeesPanel, setShowEmployeesPanel] = useState(false);
  const [saveExists, setSaveExists] = useState(false);
  const employeesMigratedRef = useRef(false);

  // Trigger game-loop restart when settings change (e.g., simulation speed slider)
  const [settingsVersion, setSettingsVersion] = useState(0);

  // ── Network mode (v0.23) ──
  // Online Gameplay toggle: multiplayer (WS relay, presence, shared map) vs a
  // private single-player session. Kept in sync with the Settings cache so the
  // WebSocket gate below re-runs the moment the player flips it.
  const [onlineMode, setOnlineMode] = useState(() => loadSettings().onlineMode);
  useEffect(() => subscribeSettings((s) => setOnlineMode(s.onlineMode)), []);
  // Batch 1 polish: last WS connection-attempt timestamp for the Online chip's
  // Reconnect row. Refreshed on every socket-state change and on manual
  // reconnect taps; null until the first attempt.
  const [lastWsAttemptAt, setLastWsAttemptAt] = useState<number | null>(null);

  // ── Update nudge (v0.22.0) ──
  // Compares the running bundle's version against the live server's on boot +
  // window focus (30s throttle) and nudges a one-time reload when a newer
  // build is live — stale service-worker bundles can no longer masquerade as
  // missing/broken features.
  useUpdateNudge();

  // ── Resumable session ──
  // While a play session is live, remember it (with the account id) so a page
  // reload boots straight back into the game (see the loading screen boot
  // flow). Explicit exits — quit to menu, logout, new campaign — clear it.
  useEffect(() => {
    if (gameScreen === 'playing' && player?.id) markSessionActive(player.id);
  }, [gameScreen, player?.id]);

  // ── Save system ──
  const { manualSave } = useSaveSystem(gameScreen === 'playing', {
    onStatus: (status) => {
      // Autosave outcomes: warn on the first failure of a streak, confirm recovery.
      if (status === 'failed') {
        addNotification({
          type: 'warning',
          title: 'Auto Save Failed',
          message: 'Could not reach dispatch cloud — retrying. Recent progress may not be saved.',
          icon: '⚠️',
          duration: 5000,
        });
      } else if (status === 'recovered') {
        addNotification({
          type: 'success',
          title: 'Auto Save Restored',
          message: 'Connection back — progress is being saved again.',
          icon: '💾',
          duration: 3000,
        });
      }
      // Keep the main-menu Continue button honest after the first autosave.
      refreshSaveSlots().then(() => setSaveExists(hasSaveGame()));
    },
  });

  // ── Session-expiry recovery ──
  // A 401 from any authed call (stale token after a deploy restart) routes
  // back to auth with a clear notice instead of letting saves/settings/stats
  // fail silently. Skipped when no identity is loaded — the boot /me 401
  // already heads to the auth screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!useGameStore.getState().player) return;
      setShowPause(false);
      addNotification({
        type: 'warning',
        title: 'Session Expired',
        message: 'Your sign-in is no longer valid — please sign back in to keep saving.',
        icon: '🔐',
        duration: 6000,
      });
      setGameScreen('auth');
    });
    return () => setUnauthorizedHandler(null);
  }, [addNotification]);

  // ── Live profile sync (admin back-office actions land instantly) ──
  // Bonus grants, promo redemptions from another device, and any other admin
  // change write straight to the player row server-side. Poll /me while signed
  // in and deliver grants within ~30s (instantly on window focus).
  //
  // Batch 1 (P1-M3): delivery is now LEDGER-FIRST. The old path computed
  // grants as `server − last-saved baseline`, which silently swallowed any
  // grant that didn't push the DB row above the saved campaign total (the
  // normal case for an established player). The server now records every
  // promo/admin grant in a ledger row (same transaction as the wallet move),
  // and this poll applies ledger grants by id — exactly once, regardless of
  // the saved total. Delivery is deduped twice: a localStorage set of applied
  // ids (survives a crash between apply and ack) and a server-side ack.
  // The baseline-diff path still runs for non-ledger DB movements (another
  // device's shop/gift activity), but computed against server totals MINUS
  // the ledger amounts applied this poll — otherwise the same grant would
  // arrive twice (once from the ledger, once from the diff).
  useEffect(() => {
    if (!player?.id) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const me = await apiFetch<{ authenticated: boolean; player?: Player; weekly?: WeeklySnapshot | null }>('/me');
        if (cancelled || !me.authenticated || !me.player) return;
        const cur = useGameStore.getState().player;
        if (!cur) return;
        const baseline = getSavedPlayerBaseline() ?? {
          credits: cur.credits, coins: cur.coins, xp: cur.xp, level: cur.level,
        };
        // ── Ledger grants (Batch 1) ──
        let ledger = { credits: 0, coins: 0, xp: 0, level: 0 };
        try {
          const { grants } = await fetchPendingGrants();
          if (!cancelled && grants.length > 0) {
            const applied = loadAppliedGrantIds();
            const fresh = grants.filter((g) => !applied.has(g.id));
            if (fresh.length > 0) {
              for (const g of fresh) {
                ledger.credits += g.credits;
                ledger.coins += g.coins;
                ledger.xp += g.xp;
                ledger.level += g.level;
                applied.add(g.id);
              }
              saveAppliedGrantIds(applied);
            }
            // Ack everything the server sent (including already-applied ids —
            // the ack is idempotent) so the pending list shrinks server-side.
            void ackGrants(grants.map((g) => g.id)).catch(() => { /* retry next poll */ });
          }
        } catch {
          // Ledger fetch failure is non-fatal: the baseline-diff path below
          // still delivers grants that push the DB row above the baseline,
          // and the next poll retries the ledger.
        }
        const next: Partial<Player> = {};
        // Baseline-diff, adjusted for ledger amounts already applied above.
        const adjCredits = me.player.credits - ledger.credits;
        const adjCoins = me.player.coins - ledger.coins;
        const adjXp = me.player.xp - ledger.xp;
        const adjLevel = me.player.level - ledger.level;
        // Total per currency = adjusted diff (other DB movements only) PLUS
        // the ledger grants. Summing, never either/or: an either/or here
        // would drop one channel whenever both fired in the same poll.
        const totalCreditGrant = Math.max(0, adjCredits - baseline.credits) + ledger.credits;
        if (totalCreditGrant > 0) next.credits = cur.credits + totalCreditGrant;
        const totalCoinGrant = Math.max(0, adjCoins - baseline.coins) + ledger.coins;
        if (totalCoinGrant > 0) next.coins = cur.coins + totalCoinGrant;
        const xpGrant = Math.max(0, adjXp - baseline.xp) + ledger.xp;
        const levelGrant = Math.max(0, adjLevel - baseline.level) + ledger.level;
        if (xpGrant > 0 || levelGrant > 0) {
          // Grants (XP + explicit level bumps) level up through the shared
          // curve, so a bonus can't inflate the remainder past the threshold.
          const leveled = advanceLevel(cur.level + levelGrant, cur.xp, xpGrant);
          next.xp = leveled.xpIntoLevel;
          next.level = leveled.level;
        }
        if (Object.keys(next).length > 0) {
          useGameStore.getState().updatePlayer(next);
          // Acknowledge everything delivered this poll so the next poll
          // doesn't re-apply it. The baseline jumps to the FULL server
          // totals (ledger amounts included) — the adjusted diff above is
          // what keeps that jump from double-counting.
          setSavedPlayerBaseline({
            credits: me.player.credits,
            coins: me.player.coins,
            xp: me.player.xp,
            level: me.player.level,
          });
        }
        // ── Beyond player grants: alliance + weekly snapshot reconcile live ──
        // Alliance: guild XP/level, roster edits, and membership changes from
        // the back office land without waiting for the sidebar's 8s panel poll.
        fetchMyAlliance()
          .then(({ alliance }) => {
            if (!cancelled) useGameStore.getState().setMyAlliance(alliance);
          })
          .catch(() => { /* transient failure — keep the current alliance */ });
        // Weekly snapshot (Friends leaderboard "who's ahead this week"): adopt
        // the server copy from /me so another device's play or a back-office
        // adjustment shows up here. Counters are monotonic — within the same
        // week take the per-field max so a just-pushed local completion is
        // never clobbered by a stale server read; a server snapshot from an
        // old week is ignored (the local roll already advanced).
        const sv = me.weekly;
        if (sv && sv.weekKey === isoWeekKey()) {
          const st = useGameStore.getState();
          const local = st.weekly;
          const sameWeek = local?.weekKey === sv.weekKey;
          st.setWeekly({
            weekKey: sv.weekKey,
            callsRun: sameWeek ? Math.max(local?.callsRun ?? 0, sv.callsRun ?? 0) : (sv.callsRun ?? 0),
            cleared: sameWeek ? Math.max(local?.cleared ?? 0, sv.cleared ?? 0) : (sv.cleared ?? 0),
            creditsEarned: sameWeek ? Math.max(local?.creditsEarned ?? 0, sv.creditsEarned ?? 0) : (sv.creditsEarned ?? 0),
            xpEarned: sameWeek ? Math.max(local?.xpEarned ?? 0, sv.xpEarned ?? 0) : (sv.xpEarned ?? 0),
          });
        }
      } catch {
        // Offline / session hiccup — the next poll or focus will retry.
      }
    };
    void sync();
    const interval = setInterval(() => { void sync(); }, 30000);
    const onFocus = () => { void sync(); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [player?.id]);

  // ── Achievement engine ──
  useAchievements(gameScreen === 'playing');

  useEffect(() => {
    refreshSaveSlots().then(() => setSaveExists(hasSaveGame()));
  }, [gameScreen]);

  // Start a fresh shift session whenever a play session begins.
  useEffect(() => {
    if (gameScreen === 'playing') {
      const st = useGameStore.getState();
      st.resetShift();
      // Apply patrol defaults from settings (they may have changed on the menu screen).
      const s = loadSettings();
      useGameStore.getState().setDefaultPostMissionBehavior(s.defaultPostMissionBehavior);
    }
  }, [gameScreen, selectedCity]);

  // Ensure legacy stations/units have employee rosters and crew assignments
  useEffect(() => {
    if (gameScreen !== 'playing' || employeesMigratedRef.current) return;
    const state = useGameStore.getState();
    const { stations, units, updateStation, updateUnit } = state;
    let changed = false;
    stations.forEach((station) => {
      if (!station.employees || station.employees.length === 0) {
        const roster = generateInitialRoster(station);
        updateStation(station.id, { employees: roster, employeeCapacity: station.capacity + 4 });
        changed = true;
      }
    });
    if (changed) {
      const refreshed = useGameStore.getState();
      refreshed.units.forEach((unit) => {
        if (unit.crewIds && unit.crewIds.length > 0) return;
        const station = refreshed.stations.find((s) => s.id === unit.stationId);
        if (!station) return;
        const { crewIds } = autoAssignCrew(station, unit);
        if (crewIds.length > 0) {
          updateUnit(unit.id, { crewIds });
          const employeeIds = new Set(crewIds);
          updateStation(station.id, {
            employees: (station.employees || []).map((e) =>
              employeeIds.has(e.id) ? { ...e, status: 'assigned' as const, assignedUnitId: unit.id } : e
            ),
          });
        }
      });
    }
    employeesMigratedRef.current = true;
  }, [gameScreen]);

  // Random Events system
  const {
    activeEvents,
    eventHistory,
    showHistory: showEventHistory,
    setShowHistory: setShowEventHistory,
    dismissEvent,
    getActiveEffects,
  } = useRandomEvents(gameScreen === 'playing' && !showPause);

  // Sync the strongest active weather event into the store so spawn/speed
  // effects (lib/weather) can read it without prop drilling — and carry the
  // live event (name/icon/effect + spawn time) for the Alerts-tab weather
  // status strip's countdown (v0.22.16).
  useEffect(() => {
    const weatherEvents = activeEvents.filter((e) => e.type === 'weather');
    const ids = new Set(weatherEvents.map((e) => e.id));
    const weather: 'storm' | 'fog' | 'heatwave' | 'clear' = ids.has('storm')
      ? 'storm'
      : ids.has('fog')
        ? 'fog'
        : ids.has('heatwave')
          ? 'heatwave'
          : 'clear';
    useGameStore.getState().setWeather(weather);
    const primary = weatherEvents.find((e) => e.id === weather);
    useGameStore.getState().setWeatherEvent(
      primary && primary.startedAt
        ? { id: primary.id as 'storm' | 'fog' | 'heatwave', name: primary.name, icon: primary.icon, effect: primary.effect, startedAt: primary.startedAt, duration: primary.duration }
        : null,
    );
  }, [activeEvents]);

  // Resume/init audio context after first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlock = () => { initAudio(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Restart the game loop whenever settings change so simulation-speed updates apply immediately,
  // and keep the store's patrol defaults in sync with the Settings menu.
  useEffect(() => {
    const handler = () => {
      setSettingsVersion(v => v + 1);
      const s = loadSettings();
      useGameStore.getState().setDefaultPostMissionBehavior(s.defaultPostMissionBehavior);
    };
    window.addEventListener('dispatch-settings-change', handler);
    return () => window.removeEventListener('dispatch-settings-change', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (gameScreen === 'playing') {
          e.preventDefault();
          setShowPause(prev => !prev);
        }
      }
      // Ctrl+S to save manually
      if (e.ctrlKey && e.key === 's' && gameScreen === 'playing') {
        e.preventDefault();
        saveGame().then((ok) => {
          addNotification(ok
            ? { type: 'success', title: 'Game Saved', message: 'Dispatch state saved', icon: '💾', duration: 2500 }
            : { type: 'warning', title: 'Save Failed', message: 'Could not reach dispatch cloud', icon: '⚠️', duration: 4000 }
          );
          if (ok) refreshSaveSlots().then(() => setSaveExists(hasSaveGame()));
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameScreen]);

  // Sync dark mode preference and apply theme class to document root.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    saveSettings({ darkMode: isDarkMode });
  }, [isDarkMode]);

  const handleTabChange = useCallback((tab: NavTab) => {
    if (tab === 'stations') {
      setActiveNavTab('stations');
      setShowStationsPanel(true);
      return;
    }
    if (tab === 'employees') {
      setActiveNavTab('employees');
      setShowEmployeesPanel(true);
      return;
    }
    setActiveNavTab(tab);
    if (!isSidebarOpen) toggleSidebar();
  }, [isSidebarOpen, toggleSidebar]);

  // ── Continue / Load Game: restore a save and skip city-select ──
  // loadGame() with no slot resumes the active (last-played) slot; with a slot
  // it loads that specific slot from the main-menu Load Game screen.
  const resumeFromSlot = useCallback(async (slot?: SaveSlotId) => {
    const result = await loadGame(slot);
    if (result === 'loaded') {
      // Record the resumable session against the authenticated account so a
      // reload as someone else on a shared browser never auto-resumes here.
      const pid = useGameStore.getState().player?.id;
      if (pid) markSessionActive(pid);
      setGameScreen('playing');
      // A mid-tour campaign resumes the tutorial at its saved step (v0.22.x);
      // a finished tour (step -1, or a legacy save without the field) never
      // resurfaces the overlay on Continue/reload. Veterans (per-account
      // completed marker) never see the tour auto-shown — not even on a fresh
      // campaign's Continue — Replay Tutorial in the pause menu stays explicit.
      if (
        useGameStore.getState().onboardingStep >= 0 &&
        !hasCompletedTutorial(useGameStore.getState().player?.id)
      ) setShowOnboarding(true);
      addNotification({ type: 'success', title: 'Dispatch Resumed', message: 'Welcome back, Commander', icon: '▶️', duration: 3000 });
    } else if (result === 'not-found') {
      if (slot) {
        // Explicit slot pick with nothing behind it (deleted elsewhere) — stay
        // on the menu; a fresh campaign is NOT started on the wrong slot.
        addNotification({ type: 'warning', title: 'Slot Empty', message: 'No save found in that slot — it may have been deleted.', icon: 'ℹ️', duration: 4000 });
      } else {
        // Continue must never silently start a fresh campaign — the player
        // chooses that deliberately (New Campaign). Stay on the menu.
        addNotification({ type: 'warning', title: 'No Save Found', message: 'No saved campaign for this account yet — start one with New Campaign.', icon: 'ℹ️', duration: 4000 });
      }
    } else {
      // Transient load failure (network/token) — never bounce the player into
      // a new campaign and risk clobbering their progress. Stay on the menu.
      addNotification({
        type: 'warning',
        title: 'Could Not Load Save',
        message: 'Dispatch cloud unreachable — nothing was overwritten. Try again in a moment.',
        icon: '⚠️',
        duration: 5000,
      });
    }
    return result;
  }, [addNotification]);

  const handleContinue = useCallback(() => { void resumeFromSlot(); }, [resumeFromSlot]);
  const handleLoadSlot = useCallback((slot: SaveSlotId) => { void resumeFromSlot(slot); }, [resumeFromSlot]);

  const handleDeleteSlot = useCallback(async (slot: SaveSlotId) => {
    await deleteSaveGame(slot);
    refreshSaveSlots().then(() => setSaveExists(hasSaveGame()));
  }, []);

  // New Campaign: the slot is chosen in the main-menu picker (empty slots get
  // a fresh career; occupied ones are a confirmed overwrite). Setting the active
  // slot first means autosave writes to the chosen slot from the first tick.
  const handleNewCampaign = useCallback((slot?: SaveSlotId) => {
    if (slot) setActiveSlot(slot);
    clearSessionActive(); // a fresh career supersedes the previous session
    setGameScreen('city-select');
  }, []);

  // ── Spawn missions for the player's selected service only ──
  useEffect(() => {
    if (gameScreen !== 'playing' || !selectedCity || !selectedService) return;

    const spawn = async () => {
      const level = useGameStore.getState().player?.level ?? 1;
      // Cap active calls by the player's chosen max (tunable 4-15 in Settings),
      // scaled up slightly with level so late-game boards stay busy.
      const maxActive = activeMissionCap(level, loadSettings().maxActiveMissions);
      const activeCount = useGameStore.getState().missions.filter(
        (m) => m.status !== 'completed' && m.status !== 'failed'
      ).length;
      if (activeCount >= maxActive) return;
      const mission = await buildMission(selectedService, selectedCity, { level });
      // Batch 3b: organic calls belong to an unlocked district, weighted by
      // that district's satisfaction (happy districts call more).
      {
        const st = useGameStore.getState();
        const picked = pickDistrictForSpawn(
          unlockedDistricts(selectedCity.name, level),
          st.districtSatisfaction,
          selectedCity.name,
        );
        if (picked) mission.district = picked;
      }
      addMission(mission);

      // ── Co-op dispatch: broadcast shared missions to alliance (Phase 1) ──
      // If the player is in an alliance, broadcast the mission so alliance
      // members in the same city can see it on their shared board.
      const allianceState = useGameStore.getState().myAlliance;
      if (allianceState && selectedCity) {
        wsClient.send({
          type: 'alliance_mission_spawn',
          mission,
          playerName: player?.username ?? 'Unknown',
          city: selectedCity.name,
          allianceId: allianceState.id,
        });
      }

      // New calls go over the air (v0.22.x): the spawn/complete announcements
      // are dispatch comms — they live in the Radio Comms transcript, not the
      // public chat. POI-anchored calls name the place (player-placed only).
      const poi = mission.poiId ? poiById(useGameStore.getState().placedPois, mission.poiId) : null;
      const atPoi = poi ? ` at ${poi.name}` : '';
      broadcastRadioMessage({
        from: `${SERVICE_CONFIG[selectedService].label} Dispatch`,
        to: 'All Units',
        text: `New call: ${mission.name}${atPoi} — ${SERVICE_CONFIG[selectedService].label} units respond.`,
        type: 'dispatch',
        service: selectedService,
      });

      const assistServices = getAssistingServices(mission);
      if (assistServices.length > 0) {
        addNotification({
          type: 'dispatch',
          title: 'Mutual Aid Requested',
          message: `${mission.name} — ${assistServices.map(s => SERVICE_CONFIG[s].label).join(', ')} assistance needed`,
          icon: '🤝',
          duration: 5000,
        });
        const svc = assistServices[0];
        broadcastRadioSequence([
          { from: 'Dispatch', to: 'All Units', text: `Mutual aid request: ${SERVICE_CONFIG[svc].label} units also en route to ${mission.name}${atPoi}.`, type: 'dispatch', service: svc },
          { from: `${SERVICE_CONFIG[svc].label} Command`, to: 'Dispatch', text: `Copy, ${SERVICE_CONFIG[svc].label} responding to ${mission.name}${atPoi}.`, type: 'unit', service: svc },
        ]);
      }

      // ── Organic partner-agency calls (v0.22.6) ─────────────────────────────
      // A built partner station (or CPU mutual aid) should actually receive its
      // own department's calls: they spawn as labeled Mutual Aid requests, pop
      // the "Mutual Aid Requested" toast, and are answerable by the partner
      // station's units for the +25% bonus. Only services something can answer
      // are rolled, so requests never pile up unanswerable.
      const cityStations = useGameStore.getState().stations;
      const cityUnits = useGameStore.getState().units;
      const cpuAidSetting = loadSettings().cpuMutualAid ?? false;
      const citySimSetting = loadSettings().citySimCrossService ?? false;
      const partnerServices = partnerAgencyServices(cityStations, selectedService, cpuAidSetting, citySimSetting);
      // Spawn partner calls at the pace the player chose (off/rare/normal/
      // frequent) — only for services something can actually answer.
      const mutualAidChance = getMutualAidChance(loadSettings().mutualAidPace);
      if (partnerServices.length > 0 && mutualAidChance > 0 && Math.random() < mutualAidChance) {
        const partnerService = partnerServices[Math.floor(Math.random() * partnerServices.length)];
        // v0.22.18 airlift adaptation: never spawn a partner call the player
        // has no units to crew AND the city won't resolve — e.g. an EMS
        // air-ambulance callout in a police-only city with an EMS station but
        // no crews or helipad. It would sit on the board unanswerable.
        if (partnerCallAnswerable(partnerService, cityUnits, cpuAidSetting, citySimSetting)) {
          const partnerMission = await buildMission(partnerService, selectedCity, { level });
          addMission(partnerMission);
          addNotification({
            type: 'dispatch',
            title: 'Mutual Aid Requested',
            message: `${partnerMission.name} — ${SERVICE_CONFIG[partnerService].label} assistance requested${cityStations.some((s) => stationServiceFor(s.type) === partnerService) ? '' : ' (city will answer)'}`,
            icon: '🤝',
            duration: 5000,
          });
          broadcastRadioSequence([
            { from: `${SERVICE_CONFIG[partnerService].label} Dispatch`, to: 'All Units', text: `Mutual aid request: ${SERVICE_CONFIG[partnerService].label} unit needed for ${partnerMission.name}.`, type: 'dispatch', service: partnerService },
            { from: 'Dispatch', to: `${SERVICE_CONFIG[partnerService].label} Command`, text: `Copy — routing ${partnerMission.name} as mutual aid.`, type: 'unit', service: partnerService },
          ]);
        }
      }
    };

    spawn();
    // settingsVersion recreates this interval when the player changes
    // Settings, so a new mission pace applies immediately instead of waiting
    // for the next screen transition. The immediate spawn() above also fires
    // on the change (respecting the active-mission cap), so the new cadence
    // is visible right away.
    // City trait (v0.35.0): spawnRateMultiplier shortens the interval so
    // missions appear faster in dense cities (e.g. Paris 1.15× = 15% more frequent).
    const basePace = getMissionPaceMs();
    const trait = getCityTrait(useGameStore.getState().selectedCity?.name);
    const traitSpawnMult = trait?.modifiers.spawnRateMultiplier ?? 1;
    const interval = setInterval(spawn, Math.round(basePace / traitSpawnMult));
    return () => clearInterval(interval);
  }, [gameScreen, selectedCity, selectedService, settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Batch 3b: multi-stage disaster waves ──
  // Stage 1 is the disaster's flat template wave (spawned below, tagged
  // district + waveStage 1). When a stage's missions all clear, the next
  // stage spawns in a new district with escalated rewards; the finale
  // completes the wave. Spawn uses buildMission like every other wave item.
  const spawnNextWaveStage = async (wave: DisasterWaveState) => {
    const stage = currentWaveStage(wave);
    const st = useGameStore.getState();
    if (!stage || !st.selectedCity || !st.activeDisaster) return;
    const def = DISASTER_DEFINITIONS.find((d) => d.id === wave.defId);
    if (!def) return;
    const adapted = adaptWaveToService(def.templates, st.selectedService, st.stations);
    const spawned: string[] = [];
    for (let i = 0; i < stage.missionCount; i++) {
      const t = adapted[i % adapted.length];
      try {
        const mission = await buildMission(t.service, st.selectedCity, {
          level: st.player?.level ?? 1,
          template: getMissionTemplateById(t.templateId),
          origin: st.activeDisaster.zone,
        });
        mission.disasterId = wave.defId;
        mission.district = stage.district;
        mission.waveStage = stage.stage;
        // Same event: createdAt pins the mission to this disaster's window
        // so the disaster completion counters recognize its clears.
        mission.createdAt = new Date(st.activeDisaster.startedAt).toISOString();
        mission.creditsReward = Math.round(mission.creditsReward * stage.rewardMult);
        mission.xpReward = Math.round(mission.xpReward * stage.rewardMult);
        st.addMission(mission);
        spawned.push(mission.id);
      } catch {
        // Road-snapping can fail offline — skip this stage item.
      }
    }
    const live = useGameStore.getState();
    if (live.activeDisaster) live.setDisaster({ ...live.activeDisaster, spawned: live.activeDisaster.spawned + spawned.length });
    if (live.disasterWave) live.setDisasterWave(recordWaveSpawned(live.disasterWave, stage.stage, spawned.length));
    addNotification({
      type: 'emergency',
      title: `${def.icon} ${def.name} — Stage ${stage.stage}: ${stage.district}`,
      message: `${spawned.length} new calls in ${stage.district} — rewards ×${stage.rewardMult}.`,
      icon: def.icon,
      duration: 6000,
    });
  };

  /** Advance the live wave after one of its missions clears (player or city-handled). */
  const advanceWaveAfterClear = (mission: { disasterId?: string; waveStage?: number; recovery?: boolean }) => {
    const st = useGameStore.getState();
    if (!mission.disasterId || !mission.waveStage || mission.recovery || !st.disasterWave) return;
    if (st.disasterWave.defId !== mission.disasterId) return;
    const adv = recordWaveCompletion(st.disasterWave, mission.waveStage);
    st.setDisasterWave(adv.wave);
    if (adv.completed) {
      addNotification({
        type: 'success',
        title: 'Disaster wave contained',
        message: `All ${adv.wave.stages.length} stages cleared — the city is stabilizing.`,
        icon: '✅',
        duration: 5000,
      });
    } else if (adv.advanced) {
      void spawnNextWaveStage(adv.wave);
    }
  };

  // ── Disaster events (tornado / flood / wildfire) ──
  // Rolls every 20s against the player's disasterFrequency setting. When one
  // hits, spawn its template wave near the target zone, play the alert, and
  // let the tick watch for expiry to pay the scaled completion bonus.
  useEffect(() => {
    if (gameScreen !== 'playing' || !selectedCity || !selectedService) return;

    const check = async () => {
      const st = useGameStore.getState();
      if (st.activeDisaster) return;
      const level = st.player?.level ?? 1;
      const def = maybeTriggerDisaster(level, st.activeDisaster, loadSettings().disasterFrequency);
      if (!def) return;

      const zone = pickDisasterZone(def, patrolZonesForCity({
        bounds: st.mapBounds ?? st.selectedCity?.bounds ?? null,
        boundary: st.selectedCity?.boundary ?? null,
      }));
      const origin = zone?.center ?? (st.selectedCity ? { lat: st.selectedCity.lat, lng: st.selectedCity.lng } : undefined);

      const now = Date.now();
      const disaster: ActiveDisaster = {
        id: def.id,
        name: def.name,
        icon: def.icon,
        startedAt: now,
        endsAt: now + def.durationSec * 1000,
        spawned: 0,
        completed: 0,
        zone: origin,
      };
      st.setDisaster(disaster);
      // Batch 3b: this disaster is a multi-stage wave — stage 1 hits the
      // first unlocked district; later stages escalate from there.
      const waveDistricts = unlockedDistricts(selectedCity.name, level);
      const wave = startDisasterWave(def.id, waveDistricts);
      st.setDisasterWave(wave);
      playDisasterAlert();
      addNotification({
        type: 'emergency',
        title: `${def.icon} ${def.name}`,
        message: `City-wide emergency — ${def.templates.length} calls reported in ${wave.stages[0].district}. Clear them and the wave escalates.`,
        icon: def.icon,
        duration: 6000,
      });

      // Spawn the mission wave in the target zone — adapted to the city's
      // department so unanswerable cross-service calls don't pile up.
      const spawned: string[] = [];
      const adaptedWave = adaptWaveToService(def.templates, st.selectedService, st.stations);
      // Explain the adaptation once per wave: the calls look different because
      // the city only fields the player's department — a partner station is
      // what unlocks answering the cross-service ones (+25% Mutual Aid).
      if (waveWasAdapted(def.templates, adaptedWave) && st.selectedService) {
        addNotification({
          type: 'dispatch',
          title: `${def.icon} Calls adapted to ${SERVICE_CONFIG[st.selectedService].label}`,
          message: `This emergency's calls were re-routed to your department — partner-agency calls need a partner station to answer them (+25% Mutual Aid). Build one from the station menu.`,
          icon: '🔁',
          duration: 5000,
        });
      }
      for (const t of adaptedWave) {
        try {
          const mission = await buildMission(t.service, st.selectedCity, {
            level: st.player?.level ?? 1,
            template: getMissionTemplateById(t.templateId),
            origin,
          });
          mission.disasterId = def.id;
          mission.district = wave.stages[0].district;
          mission.waveStage = 1;
          st.addMission(mission);
          spawned.push(mission.id);
        } catch {
          // Road-snapping can fail offline — skip this wave item.
        }
      }
      // Merge with the live record so any completion counted during the wave
      // spawn isn't clobbered by the stale local copy.
      const live = useGameStore.getState().activeDisaster;
      st.setDisaster({ ...(live ?? disaster), spawned: spawned.length });
      // Batch 3b: stage 1's real spawn count drives its advance condition.
      const liveWave = useGameStore.getState().disasterWave;
      if (liveWave) st.setDisasterWave(recordWaveSpawned(liveWave, 1, spawned.length));
    };

    const interval = setInterval(() => { void check(); }, 20000);
    void check();
    return () => clearInterval(interval);
  }, [gameScreen, selectedCity, selectedService, setDisaster, addNotification]);

  // ── Seasonal events (v0.21.0) ──
  // While a holiday window is live (Fourth of July, Christmas), announce it
  // once per session and re-check hourly in case the player leaves the game
  // open across a date boundary. Boosted callouts + reward multiplier + badge
  // are handled by spawn.ts / rewards.ts / the completion handler.
  const seasonalBannerRef = useRef<string | null>(null);
  const seasonalBadgeRef = useRef<Set<string>>(new Set());
  // Count one clear toward the live seasonal contest: server leaderboard
  // (reportSeasonalClear), the shift debrief tally, and the once-per-session
  // badge. Shared by manual completions and CPU-handled clears (v0.22.3) so
  // holiday events don't stall in single-service cities. kind 'city' records
  // the server-side clear into the separate city-clears column (v0.22.x).
  const countSeasonalClear = (ev: SeasonalEvent, kind: 'player' | 'city' = 'player') => {
    reportSeasonalClear(ev.id, kind);
    const curShift = useGameStore.getState().shift;
    useGameStore.getState().recordShiftStats({
      seasonalClears: (curShift.seasonalClears ?? 0) + 1,
      seasonalEventId: curShift.seasonalEventId ?? ev.id,
    });
    if (!seasonalBadgeRef.current.has(ev.badge.key)) {
      seasonalBadgeRef.current.add(ev.badge.key);
      fetch(`/api/achievements/award/${ev.badge.key}`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }).catch(() => {});
    }
  };
  useEffect(() => {
    if (gameScreen !== 'playing') return;
    const check = () => {
      const ev = activeSeasonalEvent();
      if (ev && seasonalBannerRef.current !== ev.id) {
        seasonalBannerRef.current = ev.id;
        addNotification({
          type: 'dispatch',
          title: `${ev.icon} ${ev.name} is live`,
          message: `Seasonal callouts are active — rewards boosted ${ev.rewardMult}× and a ${ev.badge.name} badge is up for grabs.`,
          duration: 6000,
        });
      }
    };
    check();
    const t = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [gameScreen, addNotification]);

  // ── Opt-in session analytics (v0.24.0) ──
  // One session per continuous span of gameplay: start when the campaign
  // screen opens, flush when it closes (new campaign, logout, main menu — and
  // tab unload via lib/analytics's pagehide hook). No-op unless opted in.
  const prevGameScreenRef = useRef<GameScreen>(gameScreen);
  useEffect(() => {
    const prev = prevGameScreenRef.current;
    if (prev === gameScreen) return;
    prevGameScreenRef.current = gameScreen;
    if (gameScreen === 'playing') {
      analyticsSessionStart(selectedCity?.name ?? null, selectedService ?? null);
    } else if (prev === 'playing') {
      void analyticsSessionEnd();
    }
  }, [gameScreen, selectedCity, selectedService]);

  // ── Patrol traffic-stop / traffic-control duties ──
  // Every so often, a field unit discovers a traffic situation nearby and radios for a duty call.
  useEffect(() => {
    if (gameScreen !== 'playing' || !selectedCity || !selectedService) return;

    const DUTY_INTERVAL_MS = 25000;
    const activeDutyKeys = new Set<string>();

    const maybeSpawnTrafficDuty = async () => {
      const state = useGameStore.getState();
      const service = state.selectedService;
      const city = state.selectedCity;
      if (!service || !city || state.missions.length >= 20) return;
      if (Math.random() > 0.42) return;

      const candidates = state.units.filter((u) => {
        if (!u.position || u.status === 'available') return false;
        const unitService = getUnitServiceType(u.type);
        // Only patrolling units spot traffic duties — units rushing to a call are focused on it.
        return unitService === service && u.status === 'patrolling';
      });
      if (candidates.length === 0) return;

      const unit = candidates[Math.floor(Math.random() * candidates.length)];
      const key = `traffic-duty-${unit.id}`;
      if (activeDutyKeys.has(key)) return;
      activeDutyKeys.add(key);
      setTimeout(() => activeDutyKeys.delete(key), 60000);

      const level = state.player?.level ?? 1;
      const mission = await buildTrafficDutyMission(unit, service, city, level);

      state.addMission(mission);
      addNotification({
        type: 'dispatch',
        title: 'Traffic Duty',
        message: `${unit.name} spotted ${mission.name?.toLowerCase().replace('traffic: ', '') ?? 'a traffic issue'} nearby.`,
        service,
        duration: 4000,
      });
      broadcastRadioMessage({
        from: unit.name,
        to: 'Dispatch',
        text: `Dispatch, I'm observing a ${(mission.name?.toLowerCase().replace('traffic: ', '') ?? 'traffic issue')} in my sector, requesting a duty call.`,
        type: 'unit',
        service,
      });
    };

    maybeSpawnTrafficDuty();
    const dutyInterval = setInterval(maybeSpawnTrafficDuty, DUTY_INTERVAL_MS);
    return () => clearInterval(dutyInterval);
  }, [gameScreen, selectedCity, selectedService]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Police field activities: officer-initiated traffic stops, suspect /
  // warrant checks, pursuits, and backup requests — radio + real gameplay ──
  useEffect(() => {
    if (gameScreen !== 'playing' || selectedService !== 'police') return;
    const FIELD_ACTIVITY_INTERVAL_MS = 22000;
    const run = async () => {
      const label = await runPoliceFieldActivity();
      if (!label) return;
      const escalated = label.includes('mission') || label.includes('pursuit');
      addNotification({
        type: escalated ? 'emergency' : 'info',
        title: escalated ? 'Field Escalation' : 'Police Field Activity',
        message: label,
        service: 'police',
        duration: 4500,
      });
    };
    void run();
    const fieldInterval = setInterval(() => { void run(); }, FIELD_ACTIVITY_INTERVAL_MS);
    return () => {
      clearInterval(fieldInterval);
      // Leaving the police screen (or the game) ends any in-flight chase radio.
      clearPursuitTracking();
    };
  }, [gameScreen, selectedCity, selectedService, addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Station system: available units stay at their station ──
  // Units return to station after missions. Patrolling is optional via patrol flag.
  useEffect(() => {
    if (gameScreen !== 'playing' || showPause) return;

    const pendingReturnRoutes = new Set<string>();
    const pendingAutoPatrol = new Set<string>();
    const pendingPatrolRegen = new Set<string>();
    let patrolKmBuffer = 0;      // patrol distance accumulated this tick window
    let patrolShiftsBuffer = 0;  // patrol shifts completed this tick window
    const zoneKmBuffer: Record<string, number> = {}; // patrol km per neighborhood

    const stationInterval = setInterval(() => {
      const { units: currentUnits, stations: currentStations, updateUnit: updUnit, mapBounds: boundsNow, selectedCity: selCity } = useGameStore.getState();
      // Weather: fog slows patrol/return movement (see lib/weather).
      const weatherSpeedMult = getWeatherEffects(currentWeather()).responseSpeedMult;
      // Zone grid for attributing patrol distance to neighborhoods (9 zones, cheap).
      const zones = boundsNow ? patrolZonesForCity({ bounds: boundsNow, boundary: selCity?.boundary ?? null }) : null;

      currentUnits.forEach((u) => {
        if (!u.stationId || !u.position) return;
        const station = currentStations.find(s => s.id === u.stationId);
        if (!station) return;

        // ── Training: complete finished sessions; trainees stay off-duty at the station ──
        if (u.trainingEndsAt) {
          if (u.trainingEndsAt <= Date.now() && finishUnitTraining(u)) {
            addNotification({
              type: 'success',
              title: 'Training Complete',
              message: `${u.name} advanced to Level ${u.trainingLevel + 1}`,
              icon: '🎓',
              duration: 4000,
            });
          }
          return;
        }

        // ── Available units: obey post-mission behavior ──
        if (u.status === 'available') {
          // Clear stale dispatch waypoints
          if (u.waypoints || u.waypointIndex !== undefined) {
            updUnit(u.id, { waypoints: undefined, waypointIndex: undefined, destination: null, eta: null });
          }
          // Honor a post-mission standby timer before deciding next action
          const standby = u.returnTimer ?? 0;
          if (standby > 0) {
            updUnit(u.id, { returnTimer: standby - 1 });
            return;
          }
          // If the unit is on a patrol schedule, try resuming an existing route.
          // (Shift-end returns set postMissionBehavior to 'patrol' so the unit resumes
          //  after its rest break even if the player's default is 'return'.)
          // Police always patrol; EMS patrols once a helipad exists (so roving
          // medics can spot airlift callouts and fly them) — fire rigs answer
          // calls from stations and never roam beats.
          if (unitCanPatrol(u.type, useGameStore.getState().helipad) && u.patrolRouteId && (u.postMissionBehavior === 'patrol' || u.patrolShiftEndsAt)) {
            const hasRoute = useGameStore.getState().patrolRoutes.some((r) => r.id === u.patrolRouteId);
            if (hasRoute) {
              // Fresh shift clock on resume — the previous one may have expired during the return.
              updUnit(u.id, { status: 'patrolling', returnTimer: 0, patrolShiftEndsAt: Date.now() + getPatrolShiftMs() });
              return;
            }
          }
          // Decide: return to station, or start a new patrol?
          const state = useGameStore.getState();
          const behavior: 'return' | 'patrol' | 'auto' = u.postMissionBehavior ?? state.defaultPostMissionBehavior ?? 'return';
          const activeCount = state.missions.filter((m) => m.status === 'active' || m.status === 'en_route').length;
          // Police always patrol; EMS patrols once a helipad exists — fire/EMS
          // rigs otherwise stay posted at their stations (see the gate above).
          const wantPatrol =
            unitCanPatrol(u.type, state.helipad) &&
            (behavior === 'patrol' ||
              (behavior === 'auto' &&
                (state.defaultPostMissionBehavior === 'patrol' ||
                  (activeCount > 3 ? Math.random() < 0.7 : Math.random() < 0.35))));
          if (wantPatrol && !u.patrolRouteId && !pendingAutoPatrol.has(u.id)) {
            pendingAutoPatrol.add(u.id);
            const mode = u.patrolMode ?? state.defaultPatrolMode ?? 'city-sweep';
            const cityCenter = state.selectedCity ? { lat: state.selectedCity.lat, lng: state.selectedCity.lng } : station.position;
            const cityRadiusKm = getCityRadiusKm(state.selectedCity ?? state.mapBounds);
            const unitSeed = u.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
            const beatIndex = state.patrolRoutes.filter((r) => r.stationId === station.id).length;
            const seed = Date.now() + unitSeed + beatIndex * 7919;
            generatePatrolRoute(station.position, seed, beatIndex, {
              mode,
              cityCenter,
              cityRadiusKm,
              cityBounds: state.mapBounds ?? state.selectedCity?.bounds ?? null,
              boundary: state.selectedCity?.boundary ?? null,
              missions: state.missions.map((m) => ({ location: m.location, category: m.category, difficulty: m.difficulty })),
              targetZoneId: u.patrolAreaId,
            })
              .then((waypoints) => {
                if (waypoints.length >= 2) {
                  const route = {
                    id: `patrol_${station.id}_${Date.now()}_${u.id.slice(-4)}`,
                    stationId: station.id,
                    waypoints: waypoints.map((p) => [p.lat, p.lng] as [number, number]),
                    assignedUnits: [u.id],
                    active: true,
                    generatedAt: Date.now(),
                  };
                  state.addPatrolRoute(route);
                  updUnit(u.id, {
                    status: 'patrolling',
                    patrolRouteId: route.id,
                    patrolWaypointIndex: 0,
                    patrolProgress: 0,
                    patrolMode: mode,
                    returnTimer: 0,
                    patrolShiftEndsAt: Date.now() + getPatrolShiftMs(),
                  });
                }
              })
              .finally(() => pendingAutoPatrol.delete(u.id));
            return;
          }
          // Default: return to station
          const distToStation = Math.sqrt(
            Math.pow(station.position.lat - u.position!.lat, 2) +
            Math.pow(station.position.lng - u.position!.lng, 2)
          );
          if (distToStation > 0.0005) {
            if (!u.waypoints && !pendingReturnRoutes.has(u.id)) {
              pendingReturnRoutes.add(u.id);
              fetchDrivingRoute(u.position!, station.position)
                .then((route) => {
                  if (route.waypoints.length >= 2) {
                    updUnit(u.id, {
                      waypoints: route.waypoints,
                      waypointIndex: 0,
                      destination: station.position,
                      status: 'returning',
                    });
                  }
                })
                .catch(() => {
                  const fallbackDist = Math.sqrt(
                    Math.pow(station.position.lat - u.position!.lat, 2) +
                    Math.pow(station.position.lng - u.position!.lng, 2)
                  ) * 111000;
                  const fallbackEta = applyTravelTech(Math.max(5, Math.round(fallbackDist / (u.speed || 13.9))));
                  const fallbackPath = generateGridRoadPath(u.position!, station.position);
                  updUnit(u.id, {
                    status: 'returning',
                    destination: station.position,
                    waypoints: fallbackPath.waypoints,
                    waypointIndex: 0,
                    eta: fallbackEta,
                    etaTotal: fallbackEta,
                  });
                })
                .finally(() => pendingReturnRoutes.delete(u.id));
            }
          } else {
            if (Math.abs(u.position!.lat - station.position.lat) > 1e-7 ||
                Math.abs(u.position!.lng - station.position.lng) > 1e-7) {
              updUnit(u.id, { position: { ...station.position }, currentSpeed: 0, lastPosition: { ...station.position }, lastPositionAt: Date.now() });
            } else if (u.currentSpeed !== 0) {
              updUnit(u.id, { currentSpeed: 0, lastPosition: { ...station.position }, lastPositionAt: Date.now() });
            }
          }
        }

        // ── Returning units: move along road waypoints back to station ──
        if (u.status === 'returning' && u.waypoints && u.waypointIndex !== undefined) {
          const wpIdx = u.waypointIndex;
          if (wpIdx < u.waypoints.length) {
            const targetWp = u.waypoints[wpIdx];
            const dx = targetWp.lng - u.position!.lng;
            const dy = targetWp.lat - u.position!.lat;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const speedMs = (u.speed || 13.9) * 0.8 * weatherSpeedMult;
            const speedDegPerSec = speedMs / 111000;
            const step = Math.min(speedDegPerSec, dist);

            if (dist > 0.00001) {
              const ratio = step / dist;
              const newPos = {
                lat: u.position!.lat + dy * ratio,
                lng: u.position!.lng + dx * ratio,
              };
              updUnit(u.id, { position: newPos, ...recordSpeedUpdate(u, newPos) });
            }

            if (dist < 0.0002) {
              if (wpIdx + 1 >= u.waypoints.length) {
                // Arrived at station
                updUnit(u.id, {
                  position: { ...station.position },
                  status: 'available',
                  waypoints: undefined,
                  waypointIndex: undefined,
                  destination: null,
                  eta: null,
                  currentSpeed: 0,
                  lastPosition: { ...station.position },
                  lastPositionAt: Date.now(),
                });
              } else {
                updUnit(u.id, { waypointIndex: wpIdx + 1 });
              }
            }
          } else {
            updUnit(u.id, {
              position: { ...station.position },
              status: 'available',
              waypoints: undefined,
              waypointIndex: undefined,
              destination: null,
              eta: null,
            });
          }
        } else if (u.status === 'returning' && (!u.waypoints || u.waypointIndex === undefined)) {
          // Returning unit with no waypoints — route back to station
          if (!pendingReturnRoutes.has(u.id)) {
            pendingReturnRoutes.add(u.id);
            fetchDrivingRoute(u.position!, station.position)
              .then((route) => {
                if (route.waypoints.length >= 2) {
                  updUnit(u.id, {
                    waypoints: route.waypoints,
                    waypointIndex: 0,
                    destination: station.position,
                  });
                } else {
                  // Direct fallback
                  updUnit(u.id, {
                    waypoints: [{ ...u.position! }, station.position],
                    waypointIndex: 0,
                    destination: station.position,
                  });
                }
              })
              .catch(() => {
                const fb = generateGridRoadPath(u.position!, station.position);
                updUnit(u.id, {
                  status: 'returning',
                  destination: station.position,
                  waypoints: fb.waypoints,
                  waypointIndex: 0,
                  eta: applyTravelTech(Math.max(5, Math.round(fb.totalDistanceKm * 1000 / (u.speed || 13.9)))),
                  etaTotal: applyTravelTech(Math.max(5, Math.round(fb.totalDistanceKm * 1000 / (u.speed || 13.9)))),
                });
              })
              .finally(() => pendingReturnRoutes.delete(u.id));
          }
        }

        // ── Patrolling units: follow real road beats across the city ──
        if (u.status === 'patrolling' && u.patrolRouteId) {
          const { patrolRoutes: routes } = useGameStore.getState();
          const route = routes.find(r => r.id === u.patrolRouteId);
          const now = Date.now();

          // ── Shift lifecycle: shift ended → return to station for a rest break, then auto-resume ──
          if (route && station && u.patrolShiftEndsAt && now >= u.patrolShiftEndsAt) {
            updUnit(u.id, {
              status: 'returning',
              destination: station.position,
              returnTimer: PATROL_REST_SEC,
              // Clear the shift clock; the resume path starts a fresh one when the unit
              // returns to patrolling (avoids an instant re-shift-end on long returns).
              patrolShiftEndsAt: undefined,
              // Force a patrol schedule so the unit resumes after its break.
              postMissionBehavior: 'patrol',
            });
            patrolShiftsBuffer += 1;
            broadcastRadioMessage({
              from: u.name, to: 'Dispatch',
              text: `Dispatch, ${u.name} ending patrol shift — returning to ${station.name} for a rest break. 10-42.`,
              type: 'unit', service: getUnitServiceType(u.type),
            });
            return;
          }

          if (route && route.waypoints.length > 1 && u.position) {
            const wpPoints: GeoPoint[] = route.waypoints.map(([lat, lng]) => ({ lat, lng }));
            const patrolSpeedMs = (u.speed || 13.9) * 0.45 * weatherSpeedMult; // patrol a bit faster so city routes don't crawl

            // Route arc length (km) — a few units at most, cheap per tick.
            let routeLenKm = 0;
            for (let i = 1; i < wpPoints.length; i++) routeLenKm += haversineKm(wpPoints[i - 1], wpPoints[i]);
            if (routeLenKm <= 0) routeLenKm = 1;

            // Arc-length progress (0..1, wraps). Fractional progress keeps the unit
            // glued to the road polyline — the same GPS-style interpolation dispatched
            // units use, so patrols never cut across neighborhoods in straight lines.
            let prog = u.patrolProgress ?? ((u.patrolWaypointIndex ?? 0) / Math.max(1, wpPoints.length - 1));
            if (!Number.isFinite(prog)) prog = 0;

            // If the unit joined/resumed off the route (mission return, rest break,
            // route re-plan), snap to the nearest point on the polyline first.
            const onRoute = getPositionOnPath(wpPoints, prog);
            if (haversineKm(u.position, onRoute) > 0.04) {
              prog = nearestRouteProgress(wpPoints, u.position, routeLenKm);
            }

            const advance = patrolSpeedMs / (routeLenKm * 1000); // fraction per 1s tick
            const next = prog + advance;
            const looped = next >= 1;
            const p = next % 1;
            const newPos = getPositionOnPath(wpPoints, p);
            const movedKm = haversineKm(u.position, newPos);
            patrolKmBuffer += movedKm;
            const zid = zoneIdForPoint(zones, newPos);
            if (zid) zoneKmBuffer[zid] = (zoneKmBuffer[zid] ?? 0) + movedKm;
            updUnit(u.id, {
              position: newPos,
              patrolProgress: p,
              patrolWaypointIndex: Math.min(wpPoints.length - 1, Math.floor(p * wpPoints.length)),
              ...recordSpeedUpdate(u, newPos),
            });

            // Full loop complete and the route is stale → re-plan toward live hotspots.
            if (
              looped &&
              route.generatedAt &&
              now - route.generatedAt > PATROL_REGEN_MS &&
              !pendingPatrolRegen.has(route.id)
            ) {
              pendingPatrolRegen.add(route.id);
              const regenMode = u.patrolMode ?? 'zone';
              const cityCenter = selectedCity ? { lat: selectedCity.lat, lng: selectedCity.lng } : station.position;
              const cityRadiusKm = getCityRadiusKm(selectedCity ?? mapBounds);
              const unitSeed = u.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
              generatePatrolRoute(station.position, now + unitSeed, 0, {
                mode: regenMode,
                cityCenter,
                cityRadiusKm,
                cityBounds: mapBounds ?? selectedCity?.bounds ?? null,
                boundary: selectedCity?.boundary ?? null,
                missions: useGameStore.getState().missions.map((m) => ({ location: m.location, category: m.category, difficulty: m.difficulty })),
                targetZoneId: u.patrolAreaId,
              })
                .then((wps) => {
                  if (wps.length >= 2) {
                    useGameStore.getState().updatePatrolRoute(route.id, {
                      waypoints: wps.map((p) => [p.lat, p.lng] as [number, number]),
                      generatedAt: Date.now(),
                    });
                    updUnit(u.id, { patrolWaypointIndex: 0, patrolProgress: 0 });
                    broadcastRadioMessage({
                      from: u.name, to: 'Dispatch',
                      text: `Dispatch, ${u.name} adjusting patrol — rerouting toward active incidents.`,
                      type: 'unit', service: getUnitServiceType(u.type),
                    });
                  }
                })
                .finally(() => pendingPatrolRegen.delete(route.id));
            }

            // Periodic status reports back to dispatch
            const lastReport = u.lastStatusReportAt ?? 0;
            if (now - lastReport > 25000 + Math.random() * 15000) {
              updUnit(u.id, { lastStatusReportAt: now });
              const svc = getUnitServiceType(u.type);
              const nears = currentUnits.filter((o) => o.id !== u.id && o.position && haversineKm(u.position!, o.position!) < 1.2).slice(0, 2);
              if (nears.length && (u.lastUnitChatAt ?? 0) < now - 35000) {
                updUnit(u.id, { lastUnitChatAt: now });
                const otherName = nears[0].name;
                const calls = [
                  ` ${otherName}, you got eyes on that area?`,
                  ` ${otherName}, keep your sector clear, I'm covering north.`,
                  ` ${otherName}, anything on your side?`,
                  ` ${otherName}, 10-22 me if you need backup.`,
                ];
                broadcastRadioMessage({
                  from: u.name, to: otherName, text: calls[Math.floor(Math.random() * calls.length)],
                  type: 'unit', service: svc,
                });
              } else {
                const reports = [
                  `Patrol ${(u.patrolWaypointIndex ?? 0) + 1}/${wpPoints.length}, all quiet.`,
                  `Still mobile, no activity in sector.`,
                  `Continuing patrol, traffic normal.`,
                  `10-41 continued, no incidents to report.`,
                ];
                broadcastRadioMessage({
                  from: u.name, to: 'Dispatch', text: reports[Math.floor(Math.random() * reports.length)],
                  type: 'unit', service: svc,
                });
              }
            }
          }
        }
      });

      // Flush accumulated patrol stats into the shift record (incl. per-zone km).
      if (patrolKmBuffer > 0 || patrolShiftsBuffer > 0 || Object.keys(zoneKmBuffer).length > 0) {
        const { shift, recordShiftStats } = useGameStore.getState();
        const zoneStats = { ...(shift.zoneStats || {}) };
        for (const [zid, km] of Object.entries(zoneKmBuffer)) {
          zoneStats[zid] = {
            calls: zoneStats[zid]?.calls ?? 0,
            patrolKm: (zoneStats[zid]?.patrolKm ?? 0) + km,
          };
        }
        recordShiftStats({
          patrolDistanceKm: shift.patrolDistanceKm + patrolKmBuffer,
          patrolShifts: shift.patrolShifts + patrolShiftsBuffer,
          zoneStats,
        });
        patrolKmBuffer = 0;
        patrolShiftsBuffer = 0;
        for (const k of Object.keys(zoneKmBuffer)) delete zoneKmBuffer[k];
      }

      // Garbage-collect patrol routes whose units no longer reference them (stale routes).
      const { patrolRoutes: allRoutes, removePatrolRoute } = useGameStore.getState();
      allRoutes.forEach((r) => {
        const stillAssigned = r.assignedUnits.some((id) => {
          const u = currentUnits.find((x) => x.id === id);
          return u && u.patrolRouteId === r.id;
        });
        if (!stillAssigned) removePatrolRoute(r.id);
      });

      // County jail: move inmates from the booking holding area to a cell block
      // once the booking process completes (30s). Keeps the jail lifecycle alive.
      const { inmates, updateInmate } = useGameStore.getState();
      const bookingCutoff = Date.now() - 30000;
      inmates.forEach((i) => {
        if (i.status === 'booking' && i.bookingTime && i.bookingTime <= bookingCutoff) {
          updateInmate(i.id, { status: 'held' });
        }
      });

      // City hospital: admitted patients progress to 'treated' once care completes.
      const { patients: currentPatients, updatePatient } = useGameStore.getState();
      const treatedCutoff = Date.now() - 45000;
      currentPatients.forEach((p) => {
        if (p.status === 'admitted' && p.admitTime <= treatedCutoff) {
          updatePatient(p.id, { status: 'treated', treatedAt: Date.now() });
        }
      });
    }, 1000);

    return () => clearInterval(stationInterval);
  }, [gameScreen, selectedCity, showPause]);

  // Ambient audio pad while actively playing; quiet on pause and away from the game.
  useEffect(() => {
    if (gameScreen === 'playing' && !showPause) {
      startAmbient();
    } else {
      stopAmbient();
    }
    return () => stopAmbient();
  }, [gameScreen, showPause]);

  // ── Game loop (mission progress, unit movement, cross-service assistance) ──
  useEffect(() => {
    if (gameScreen !== 'playing' || showPause) return;

    // Avoid duplicate async OSRM requests for the same unit.
    const pendingDispatchRoutes = new Set<string>();
    const gameSpeed = loadSettings().gameSpeed || 1;

    const tick = () => {
      const {
        missions: currentMissions, updateMission, removeMission,
        units: currentUnits, updateUnit: updUnit, selectMission,
        stations: currentStations, setStations,
        advanceGameClock,
      } = useGameStore.getState();

      // Virtual game clock: 1 real second = 0.5 game minutes (1 real min = 30 game min).
      advanceGameClock(0.5);

      // Personnel fatigue & morale tick (v0.20.1) — only writes the store
      // when an employee's rounded value changed (a few times per minute).
      // Shift Pressure setting (v0.20.2) is read live so toggling it applies
      // within a second instead of waiting for the next session.
      const fatigueMode = loadSettings().fatigueMode ?? 'full';
      // CPU Mutual Aid is read live so toggling it in Settings applies within
      // a second (and mid-call releases release back to the player's queue).
      const cpuMutualAid = loadSettings().cpuMutualAid ?? false;
      // Simulated Cross-Service Incidents (v0.22.8): the CPU city resolves
      // cross-service calls it spawned even with CPU aid off — but never
      // steals calls a player-built partner station can answer.
      const citySim = loadSettings().citySimCrossService ?? false;
      const personnel = advancePersonnel(currentStations, 0.5, fatigueMode);
      if (personnel.changed) setStations(personnel.stations);

      // Crew-condition shift stats (v0.20.5): accumulate hours ridden, peak
      // fatigue, and overwork crossings so the Shift Report tells the crew's
      // story at the end of the shift. `nextStations` aligns 1:1 with
      // currentStations (advancePersonnel maps every station).
      {
        const stNow = useGameStore.getState();
        const shift = stNow.shift;
        const nextStations = personnel.changed ? personnel.stations : currentStations;
        let hours = 0;
        let peak = shift.peakFatigue ?? 0;
        let overwork = shift.overworkEvents ?? 0;
        nextStations.forEach((station, si) => {
          for (const e of station.employees ?? []) {
            if (e.status === 'assigned') hours += 0.5 / 60;
            peak = Math.max(peak, e.fatigue ?? 0);
            if (personnel.changed) {
              const prev = (currentStations[si]?.employees ?? []).find((x) => x.id === e.id);
              if (prev && (prev.fatigue ?? 0) < OVERWORK_THRESHOLD && (e.fatigue ?? 0) >= OVERWORK_THRESHOLD) overwork += 1;
            }
          }
        });
        if (hours > 0 || peak > (shift.peakFatigue ?? 0) || overwork > (shift.overworkEvents ?? 0)) {
          stNow.recordShiftStats({
            crewHoursRidden: (shift.crewHoursRidden ?? 0) + hours,
            peakFatigue: peak,
            overworkEvents: overwork,
          });
        }
      }

      // Batch 3a academy: courses finish on the GAME clock. Completing
      // units gain their cert and a notification; enrollment itself is
      // free (no pay-skip) from the unit panel.
      {
        const stAc = useGameStore.getState();
        for (const u of stAc.units) {
          if (!u.academy) continue;
          const done = completeAcademy(u, stAc.gameMinutes);
          if (!done) continue;
          stAc.updateUnit(u.id, { certs: done.certs, academy: null });
          addNotification({
            type: 'success',
            title: 'Academy Complete',
            message: `${u.name} earned ${done.completedCourse === 'driving' ? 'Emergency Driving' : done.completedCourse === 'hazmat' ? 'Hazmat Operations' : 'Advanced Paramedic'} certification.`,
            icon: '🎓',
            duration: 4000,
          });
        }
      }

      // Live chase phase: active pursuit missions broadcast periodic radio
      // position updates (turns/speeds/road changes) from the lead unit.
      tickPursuitRadio(Date.now());

      // Weather: fog slows every unit's movement and ETA countdown (see lib/weather).
      const weatherSpeedMult = getWeatherEffects(currentWeather()).responseSpeedMult;

      currentMissions.forEach((m) => {
        // Siren when a unit is dispatched (mission just went en_route). Skips
        // missions already en route at load so resuming a save stays quiet.
        if (m.status === 'en_route' && missionStatusRef.current[m.id] && missionStatusRef.current[m.id] !== 'en_route') {
          if (m.id.includes('pursuit')) playPursuitAlert();
          else playSiren();
        }
        missionStatusRef.current[m.id] = m.status;

        // ── CPU Mutual Aid (v0.22.2) / Simulated Cross-Service Incidents ────
        // When the CPU answers a cross-service call (CPU aid on, or citySim on
        // for a department the player owns no station for), simulated city
        // units resolve it: auto-dispatch, work window, token 10% credit (no
        // XP — the player didn't do the work). Turning the relevant setting
        // off mid-call releases the mission back to the queue.
        if (selectedService && missionService(m) !== selectedService) {
          const cityAnswers = cityAnswersCall(m, currentStations, selectedService, cpuMutualAid, citySim);
          if (!cityAnswers) {
            if (m.cpuHandled) {
              cpuMutualAidRef.current.delete(m.id);
              updateMission(m.id, { status: 'active', cpuHandled: false });
            }
          } else if (m.status === 'active' && !m.cpuHandled) {
            updateMission(m.id, { status: 'en_route', cpuHandled: true });
            cpuMutualAidRef.current.set(m.id, Date.now());
            const svc = missionService(m);
            broadcastRadioMessage({
              from: `${SERVICE_CONFIG[svc].label} Dispatch`,
              to: 'Dispatch',
              text: `${CPU_UNIT_NAME[svc]} responding to ${m.name} — partner agency handling this one.`,
              type: 'unit',
              service: svc,
            });
          } else if (m.cpuHandled && m.status === 'en_route') {
            const startedAt = cpuMutualAidRef.current.get(m.id);
            const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
            const workSec = cpuWorkSeconds(m.difficulty, gameSpeed || 1);
            if (elapsed >= workSec) {
              cpuMutualAidRef.current.delete(m.id);
              const svc = missionService(m);
              const credits = cpuMutualAidPayout(m.creditsReward);
              const p = useGameStore.getState().player;
              if (p) useGameStore.getState().updatePlayer({ credits: p.credits + credits });
              broadcastRadioMessage({
                from: `${SERVICE_CONFIG[svc].label} Dispatch`,
                to: 'Dispatch',
                text: `${CPU_UNIT_NAME[svc]} — ${m.name} under control. City handled it.`,
                type: 'dispatch',
                service: svc,
              });
              addNotification({
                type: 'dispatch',
                title: `${m.name} — Handled by City`,
                message: `${SERVICE_CONFIG[svc].label} responded automatically (+${credits.toLocaleString()} credits). Build a ${SERVICE_CONFIG[svc].label} station to answer these yourself for the full +25%.`,
                icon: '🏙️',
                duration: 4000,
              });
              // Count the clear toward disaster containment so the end-of-event
              // completion bonus reflects a city that actually recovered.
              if (m.disasterId) {
                const st2 = useGameStore.getState();
                const dis = st2.activeDisaster;
                if (dis && dis.id === m.disasterId && dis.startedAt === Date.parse(m.createdAt)) {
                  st2.setDisaster(
                    m.recovery
                      ? { ...dis, recoveryCompleted: (dis.recoveryCompleted ?? 0) + 1 }
                      : { ...dis, completed: dis.completed + 1 }
                  );
                }
              }
              // Batch 3b: a city-handled clear advances a live wave the same way.
              advanceWaveAfterClear(m);
              updateMission(m.id, { status: 'in_progress', progress: 100 });
              removeMission(m.id);
              // Tally the CPU-handled clear for this shift's debrief (v0.22.3)
              // so players can see how much of the city's work was automated.
              {
                const st3 = useGameStore.getState();
                st3.recordShiftStats({ cpuHandledCalls: (st3.shift.cpuHandledCalls ?? 0) + 1 });
              }
              // Seasonal contest (v0.22.3): a CPU-handled clear still counts
              // toward the live leaderboard so holiday events don't stall in
              // single-service cities — recorded as a separate "city clear"
              // (v0.22.x) instead of merging into the player's manual tally.
              const cpuSeasonalEv = activeSeasonalEvent();
              if (cpuSeasonalEv) countSeasonalClear(cpuSeasonalEv, 'city');
            }
          }
        }

        // EMS transport safety (v0.22.9): if the delivering unit is recalled
        // or stuck off-road, the ER admits the patient remotely after the
        // window so a transport can never hang in 'en_route' forever. Airlifted
        // (critical) transports run on the shorter air-window (v0.22.11).
        if (m.patientTransport && Date.now() - m.patientTransport.startedAt
            > (m.patientTransport.mode === 'air' ? AIR_TRANSPORT_TIMEOUT_MS : TRANSPORT_TIMEOUT_MS)) {
          updateMission(m.id, { status: 'in_progress', progress: 100 });
          broadcastRadioMessage({
            from: m.patientTransport.hospitalName,
            to: 'Dispatch',
            text: `${m.patientTransport.patient.firstName} ${m.patientTransport.patient.lastName} — ER intake completed remotely (transport unit unreachable).`,
            type: 'dispatch',
            service: 'ems',
          });
        }

        // Handle dispatched units en route
        if (m.assignedUnits.length > 0) {
          const allUnits = m.assignedUnits.map((uid) => currentUnits.find((u) => u.id === uid)).filter(Boolean);
          const allOnScene = allUnits.every((u) => u?.status === 'on_scene');
          if (allOnScene && m.status === 'en_route') {
            // Record the first-response time for this mission: seconds from dispatch
            // until every assigned unit arrived on scene (the slowest unit's ETA).
            const responseSec = Math.max(0, ...allUnits.map((u) => u?.etaTotal ?? u?.eta ?? 0));
            if (responseSec > 0) {
              const { career, recordCareerStats } = useGameStore.getState();
              recordCareerStats({ bestResponseTime: Math.min(career.bestResponseTime, responseSec) });
            }
            updateMission(m.id, {
              status: 'in_progress',
              progress: 0,
              // Keep the first-response time on the mission so the analytics
              // flush at completion can report it per mission type.
              responseTimeSeconds: responseSec > 0 ? responseSec : undefined,
            });
          }
        }

        // Progress in-progress missions
        if (m.status === 'in_progress') {
          const baseClearMult = m.assignedUnits.length > 0
            ? m.assignedUnits.reduce((sum, uid) => {
                const u = currentUnits.find((u) => u.id === uid);
                return sum + (u ? getClearSpeedMultiplier(u.type, m.category) : 1);
              }, 0) / m.assignedUnits.length
            : 1;          // Requirement coverage: understaffed missions clear slower; fully staffed clears faster.
          const requirementCoverage = m.requirements.length > 0
            ? m.requirements.reduce((acc, req) => {
                const have = m.assignedUnits.filter((uid) => {
                  const u = currentUnits.find((x) => x.id === uid);
                  return u && u.type === req.unitType;
                }).length;
                return acc * (0.5 + 0.5 * Math.min(have, req.count) / req.count);
              }, 1)
            : 1;
          // Crew condition (v0.20.1): tired crews clear calls slower — mean
          // effectiveness of the assigned units' crews, 1.0 fresh → 0.75 max.
          const crewEff = m.assignedUnits.length > 0
            ? m.assignedUnits.reduce((sum, uid) => {
                const u = currentUnits.find((x) => x.id === uid);
                return sum + (u ? stationCrewEffectiveness(currentStations, u, fatigueMode) : 1);
              }, 0) / m.assignedUnits.length
            : 1;

          const clearMult = baseClearMult * requirementCoverage * crewEff;
          const increment = 100 / (m.totalTime || 600);
          const newProgress = Math.min(m.progress + increment * 2 * clearMult, 100);
          if (newProgress >= 100) {
            // ── EMS patient transport (v0.22.9) ────────────────────────────────
            // A cleared medical scene with a unit on site starts a hospital run:
            // the victim is pre-built, the primary unit is re-routed to the city
            // ER, and the call only finalizes (rewards + admission) when the
            // unit arrives — or after TRANSPORT_TIMEOUT_MS if it can't. Backup
            // units head home; the mission stays 'en_route' so the unit drives.
            // The ER only exists where the commander built it (v0.22.12).
            // No hospital placed → the call completes at the scene instead.
            const hospital = useGameStore.getState().hospital;
            const helipad = useGameStore.getState().helipad;
            const onSceneUnit = m.assignedUnits
              .map((uid) => currentUnits.find((u) => u.id === uid))
              .find((u) => u?.status === 'on_scene');
            const willTransport = m.category === 'ems' && !m.patientTransport && onSceneUnit && hospital != null;
            if (willTransport && hospital && onSceneUnit) {
              const patient = buildPatientFromMission(m);

              // ── ER depth (v0.22.12): bed overflow → regional trauma center ──
              // Effective beds grow with the shift's ER staffing (EMS clears).
              // When every bed is taken, the patient diverts to the next city's
              // trauma center instead of stacking in the waiting room: the
              // mission completes right away with the patient admitted there.
              const { patients: erPatients, shift: erShift, stations: erStations } = useGameStore.getState();
              // v0.24.0: the Hospital Ward perk raises effective beds here too,
              // so the panel and the diversion gate always agree.
              if (atCapacity(erPatients, hospital, erShift, Date.now(), erStations)) {
                const divertedTo = traumaCenterFor(selectedCity?.name);
                updateMission(m.id, {
                  status: 'in_progress',
                  progress: 100,
                  patientTransport: {
                    patient: { ...patient, diverted: true, divertedTo },
                    hospitalId: 'trauma_center',
                    hospitalName: divertedTo,
                    hospitalPos: hospital.position,
                    transportedByUnit: onSceneUnit.name,
                    startedAt: Date.now(),
                    mode: 'road',
                  },
                });
                // The unit stays free — nothing to deliver off-map.
                updUnit(onSceneUnit.id, {
                  status: 'available', missionId: undefined, destination: null,
                  waypoints: undefined, waypointIndex: undefined, eta: null, returnTimer: 30,
                });
                broadcastRadioMessage({
                  from: hospital.name,
                  to: onSceneUnit.name,
                  text: `${hospital.name} is at capacity — diverting ${patient.firstName} ${patient.lastName} to ${divertedTo}.`,
                  type: 'dispatch',
                  service: 'ems',
                });
                addNotification({
                  type: 'info',
                  title: 'ER at Capacity',
                  message: `${patient.firstName} ${patient.lastName} diverted to ${divertedTo} — clear EMS calls to add ER nurses.`,
                  icon: '🏥',
                  duration: 4000,
                });
                // The diverted patient is admitted next tick when this mission
                // completes (patientTransport is set, so no re-transport).
                return;
              }

              // Air-ambulance leg (v0.22.11): CRITICAL patients get airlifted
              // ONLY when the commander has placed a helipad (v0.22.12) — the
              // primary unit flies a direct line to the landing zone at ~4×
              // road speed. No helipad built → road transport to the ER.
              const airlift = patient.severity === 'critical' && helipad != null;
              const pad = airlift ? helipad.position : hospital.position;
              updateMission(m.id, {
                status: 'en_route',
                patientTransport: {
                  patient,
                  hospitalId: hospital.id,
                  hospitalName: hospital.name,
                  hospitalPos: hospital.position,
                  transportedByUnit: onSceneUnit.name,
                  startedAt: Date.now(),
                  mode: airlift ? 'air' : 'road',
                },
              });
              if (airlift) {
                // Direct flight: straight-line waypoints (no OSRM) + air ETA.
                const flight = generateRoadPath(onSceneUnit.position!, pad);
                const distKm = haversineKm(onSceneUnit.position!, pad);
                const eta = applyTravelTech(Math.max(8, Math.round((distKm * 1000) / AIR_SPEED_MS)));
                updUnit(onSceneUnit.id, {
                  status: 'en_route',
                  destination: pad,
                  waypoints: flight.waypoints,
                  waypointIndex: 0,
                  eta,
                  etaTotal: eta,
                });
              } else {
                updUnit(onSceneUnit.id, {
                  status: 'en_route',
                  destination: hospital.position,
                  waypoints: undefined,
                  waypointIndex: undefined,
                  eta: null,
                  etaTotal: undefined,
                });
              }
              // Any backup units on the scene head home — only the primary
              // unit makes the run.
              m.assignedUnits.forEach((uid) => {
                if (uid === onSceneUnit.id) return;
                const other = currentUnits.find((u) => u.id === uid);
                if (other?.status === 'on_scene') {
                  updUnit(uid, { status: 'available', missionId: undefined, destination: null, waypoints: undefined, waypointIndex: undefined, eta: null, returnTimer: 30 });
                }
              });
              broadcastRadioMessage({
                from: 'Dispatch',
                to: onSceneUnit.name,
                text: airlift
                  ? `${onSceneUnit.name}, victim CRITICAL — Air ambulance airborne. Transporting ${patient.firstName} ${patient.lastName} to ${helipad!.name}, flight ETA ${Math.max(1, Math.round((haversineKm(onSceneUnit.position!, pad) * 1000) / AIR_SPEED_MS))}s.`
                  : `${onSceneUnit.name}, victim secured — transport ${patient.firstName} ${patient.lastName} to ${hospital.name} (${patient.severity.toUpperCase()}). ER standing by.`,
                type: 'dispatch',
                service: 'ems',
              });
            }
            // Transport leg (v0.22.9): the call finalizes only when the unit
            // reaches the ER (or the timeout admits the patient remotely) — so
            // skip every completion effect (rewards, unit release, removal,
            // patient admission) until the run actually completes.
            if (willTransport) return;
            const { player: p, updatePlayer: updPlayer } = useGameStore.getState();
            if (!willTransport && p && !completedMissionsRef.current.has(m.id)) {
              completedMissionsRef.current.add(m.id);
              // Opt-in analytics (v0.24.0): record this clear (type, category,
              // first-response time) toward the active session — no-op when
              // analytics is disabled.
              //
              // EMS hospital transports land here too: once the transport leg
              // starts, `patientTransport` is set, so `willTransport` is false
              // on the completing tick. Scene clears, diverted admits, and the
              // transport timeout all flip the mission back to
              // `in_progress`/progress 100 and converge on this same call, and
              // `responseTimeSeconds` (captured at scene arrival) survives the
              // leg because updateMission is a shallow merge.
              analyticsMissionCompleted(
                m.templateId,
                m.category,
                m.responseTimeSeconds ?? 0,
              );
              // Reward math lives in lib/rewards (pure + unit-tested); the
              // store mutations, notifications, and alliance crediting stay here.
              const allianceState = useGameStore.getState().myAlliance;
              // Station specialization reward bonus (v0.20.1): +10% per owning
              // station whose units cleared the call (capped at +30%).
              const unitStationIds: Record<string, string> = {};
              for (const u of currentUnits) unitStationIds[u.id] = u.stationId ?? '';
              const stationRewardMult = stationRewardMultiplier(
                currentStations, m.assignedUnits, unitStationIds, m.category,
              );
              // Batch 3b: district trust + wave stage ride the reward stack.
              const cityNameForRewards = selectedCity?.name ?? null;
              const districtMultForRewards = m.district && cityNameForRewards
                ? districtRewardMultiplier(satisfactionFor(useGameStore.getState().districtSatisfaction, cityNameForRewards, m.district))
                : 1;
              const rewards = computeMissionRewards({
                mission: m,
                playerLevel: p.level,
                service: selectedService ?? null,
                allianceXp: allianceState?.xp ?? null,
                techRewardMult: getMissionRewardMultiplier(),
                stationRewardMult,
                seasonalMult: seasonalRewardMult(),
                premiumMult: premiumCreditMultiplier(p.isPremium ?? false),
                districtRewardMult: districtMultForRewards,
                waveRewardMult: waveRewardMultForStage(m.waveStage),
              });
              const { earnedCredits, earnedXp, speedBonus, chainBonus, isMutualAid } = rewards;
              // Batch 1 (P1-M6): client-reported alliance XP is retired — the
              // server awards alliance XP only on a verified completion
              // (seasonal clears today; a server mission ledger is the Batch 3
              // build for ordinary clears). computeMissionRewards still
              // reports the alliance bonus for display, but nothing here
              // posts XP to the server anymore, so the farm vector is closed
              // without inventing a fake server verification.
              if (chainBonus > 1) {
                playChainComplete();
                addNotification({
                  type: 'success',
                  title: 'Chain Bonus',
                  message: `+${Math.round((chainBonus - 1) * 100)}% reward for completing chain stage ${m.chainStage}/${m.chainTotal}`,
                  icon: '🔗',
                  duration: 3000,
                });
              }
              const newCredits = p.credits + earnedCredits;
              // Level-up math lives in the shared curve (v0.19) so the declared
              // xpPerLevel table drives gameplay for every XP path.
              const leveled = advanceLevel(p.level, p.xp, earnedXp);
              const newLevel = leveled.level;
              updPlayer({ credits: newCredits, xp: leveled.xpIntoLevel, level: newLevel });

              addNotification({
                type: 'success',
                title: `${m.name} Complete!`,
                message: `+${earnedCredits.toLocaleString()} credits, +${earnedXp} XP (${speedBonus.toFixed(1)}× speed bonus)`,
                icon: '✅',
                duration: 4000,
              });
              playSuccess();
              playCash(); // credit-reward blips layered over the completion chime

              // Scene-clear goes over the air (v0.22.x): a completion is a
              // dispatch-comms moment, so it reads in the Radio Comms
              // transcript — not the public chat (dispatch lines stay
              // filterable there, never posted into it).
              broadcastRadioMessage({
                from: `${SERVICE_CONFIG[missionService(m)].label} Dispatch`,
                to: 'All Units',
                text: `All clear on ${m.name} — scene secured.`,
                type: 'broadcast',
                service: missionService(m),
              });

              // Seasonal badge + contest (v0.21.0/0.21.1): clearing any call
              // during a live holiday window earns the event badge (once per
              // session; the server is idempotent) and counts toward the
              // seasonal leaderboard contest (every clear).
              const seasonalEv = activeSeasonalEvent();
              if (seasonalEv) countSeasonalClear(seasonalEv);

              if (isMutualAid) {
                addNotification({
                  type: 'dispatch',
                  title: 'Mutual Aid Completed',
                  message: '+25% bonus — the partner department thanks you.',
                  icon: '🤝',
                  duration: 3000,
                });
              }

              const s = useGameStore.getState().shift;
              // Debrief tallies: per-unit completions + difficulty-tier mix.
              const unitShiftStats = { ...(s.unitShiftStats || {}) };
              m.assignedUnits.forEach((uid) => { unitShiftStats[uid] = (unitShiftStats[uid] ?? 0) + 1; });
              // Batch 3a veterancy: every assigned unit earns XP for the
              // clear (certified units earn 50% more on matching-tier
              // missions); a rank crossing notifies like a level-up.
              {
                const stVet = useGameStore.getState();
                const tierCert = eligibleCertForMission(m);
                for (const uid of m.assignedUnits) {
                  const u = stVet.units.find((x) => x.id === uid);
                  if (!u) continue;
                  const res = applyMissionVeterancy(u, m.difficulty, tierCert ? unitHasCert(u, tierCert) : false);
                  stVet.updateUnit(uid, { veterancyXp: res.veterancyXp });
                  if (res.rankedUp) {
                    addNotification({
                      type: 'levelup',
                      title: `${u.name} ranked up!`,
                      message: `${u.name} is now ${res.rank} — faster response on every call.`,
                      icon: '⭐',
                      duration: 4000,
                    });
                  }
                }
              }
              const tierCounts = { ...(s.tierCounts || {}) };
              tierCounts[difficultyTierFor(m.difficulty)] = (tierCounts[difficultyTierFor(m.difficulty)] ?? 0) + 1;
              useGameStore.getState().recordShiftStats({
                missionsCompleted: s.missionsCompleted + 1,
                creditsEarned: s.creditsEarned + earnedCredits,
                xpEarned: s.xpEarned + earnedXp,
                dutiesHandled: s.dutiesHandled + (m.id.startsWith('duty_') ? 1 : 0),
                // ER staffing (v0.22.12): each cleared EMS call puts another
                // nurse on the hospital floor, growing its bed capacity.
                emsCleared: (s.emsCleared ?? 0) + (m.category === 'ems' ? 1 : 0),
                unitShiftStats,
                tierCounts,
              });

              // Track disaster-wave / recovery completions for the end-of-event
              // bonus and the RECOVERY banner progress.
              if (m.disasterId) {
                const st = useGameStore.getState();
                const dis = st.activeDisaster;
                // Match on startedAt too: disasterId is the definition id, so a
                // leftover mission from an earlier same-type disaster must not
                // inflate the current event's counters.
                if (dis && dis.id === m.disasterId && dis.startedAt === Date.parse(m.createdAt)) {
                  st.setDisaster(
                    m.recovery
                      ? { ...dis, recoveryCompleted: (dis.recoveryCompleted ?? 0) + 1 }
                      : { ...dis, completed: dis.completed + 1 }
                  );
                }
              }

              // Batch 3b: a clear moves its district's satisfaction (response
              // time), counts toward its adopted home base, and can advance
              // a live disaster wave into its next stage.
              {
                const st = useGameStore.getState();
                if (m.district && selectedCity) {
                  st.setDistrictSatisfaction(applySatisfaction(
                    st.districtSatisfaction, selectedCity.name, m.district,
                    satisfactionDeltaForResponse(m.responseTimeSeconds, false),
                  ));
                  st.setAdoptedCities(recordAdoptedCityMission(st.adoptedCities, selectedCity.name));
                }
                advanceWaveAfterClear(m);
              }

              // Career stats: completed missions, lifetime credits/XP, streak.
              const { career, recordCareerStats } = useGameStore.getState();
              recordCareerStats({
                missionsCompleted: career.missionsCompleted + 1,
                totalCreditsEarned: career.totalCreditsEarned + earnedCredits,
                totalXpEarned: career.totalXpEarned + earnedXp,
                currentStreak: career.currentStreak + 1,
                longestStreak: Math.max(career.longestStreak, career.currentStreak + 1),
                mutualAidAnswered: career.mutualAidAnswered + (isMutualAid ? 1 : 0),
              });
              // Weekly snapshot: this clear counts toward the Friends leaderboard.
              const { weekly, recordWeekly } = useGameStore.getState();
              recordWeekly({
                callsRun: weekly.callsRun + 1,
                cleared: weekly.cleared + 1,
                creditsEarned: weekly.creditsEarned + earnedCredits,
                xpEarned: weekly.xpEarned + earnedXp,
              });
              // Best-effort sync so the server-side leaderboard reflects real play.
              const { career: after, weekly: weeklyAfter } = useGameStore.getState();
              syncCareerStats({
                missionsCompleted: after.missionsCompleted,
                missionsFailed: after.missionsFailed,
                totalCreditsEarned: after.totalCreditsEarned,
                bestResponseTime: Number.isFinite(after.bestResponseTime) ? after.bestResponseTime : 0,
                mutualAidAnswered: after.mutualAidAnswered,
              }, weeklyAfter);

              if (newLevel > levelRef.current) {
                // Rank-up detection (v0.14.1): a crossing rank is its own moment.
                // Compare rewardBonus (strictly increasing per rank) so resuming a
                // mid-career save can't fire a phantom promotion.
                const prevRankBonus = rankForLevel(levelRef.current, selectedService ?? undefined).rewardBonus;
                levelRef.current = newLevel;
                const newRank = rankForLevel(newLevel, selectedService ?? undefined);
                const s2 = useGameStore.getState().shift;
                useGameStore.getState().recordShiftStats({ levelUps: s2.levelUps + 1 });
                playLevelUp();
                addNotification({
                  type: 'levelup',
                  title: `Level ${newLevel}!`,
                  message: 'You advanced to a new level!',
                  icon: '🎉',
                  duration: 5000,
                });
                if (newRank.rewardBonus > prevRankBonus) {
                  addNotification({
                    type: 'levelup',
                    title: 'Promoted!',
                    message: `${newRank.icon} You are now ${newRank.title} — rewards +${Math.round((newRank.rewardBonus - 1) * 100)}%`,
                    icon: newRank.icon,
                    duration: 5000,
                  });
                }
              }
            }
            m.assignedUnits.forEach((uid) => {
              const u = currentUnits.find((u) => u.id === uid);
              if (!u) return;
              if (unitCanPatrol(u.type, useGameStore.getState().helipad) && u.postMissionBehavior === 'patrol' && u.patrolRouteId && useGameStore.getState().patrolRoutes.some((r) => r.id === u.patrolRouteId)) {
                updUnit(uid, { status: 'patrolling', missionId: undefined, waypoints: undefined, waypointIndex: undefined, destination: null, returnTimer: 0 });
              } else {
                // Leaving the patrol schedule: clear the route + shift so the unit stays put.
                updUnit(uid, { status: 'available', missionId: undefined, waypoints: undefined, waypointIndex: undefined, destination: null, returnTimer: 30, patrolRouteId: null, patrolWaypointIndex: undefined, patrolShiftEndsAt: undefined });
              }
            });
            removeMission(m.id);
            // Co-op dispatch: broadcast completion if this was a shared mission
            if (m.allianceShared) {
              wsClient.send({
                type: 'alliance_mission_complete',
                missionId: m.id,
                playerName: useGameStore.getState().player?.username ?? 'Commander',
                service: m.category,
              });
            }
            // Chain missions: completing a stage spawns the next stage at the same location.
            if (m.chainId && m.chainStage) {
              (async () => {
                try {
                  const nextStageMission = await spawnChainStage(
                    m,
                    selectedCity,
                    useGameStore.getState().player?.level ?? 1,
                    addMission,
                  );
                  if (nextStageMission) {
                    addNotification({
                      type: 'dispatch',
                      title: 'Chain Continues',
                      message: `${nextStageMission.name} — follow-up from ${m.name}`,
                      icon: '🔗',
                      duration: 4000,
                    });
                    // If the next stage belongs to a partner department, radio it so
                    // players know it routes through Mutual Aid instead of stalling silently.
                    const cat = nextStageMission.category;
                    const nextService: ServiceType =
                      cat === 'fire' || cat === 'rescue' || cat === 'hazmat' ? 'fire'
                      : cat === 'ems' ? 'ems'
                      : 'police';
                    if (nextService !== selectedService) {
                      broadcastRadioMessage({
                        from: 'Dispatch',
                        to: 'All Units',
                        text: `${nextStageMission.name} is a ${nextService.toUpperCase()} response — routing as a mutual aid request.`,
                        type: 'dispatch',
                        service: nextService,
                      });
                    }
                  }
                } catch {
                  // Chain spawn is best-effort (road-snapping can fail offline).
                }
              })();
            }
            // Mark mission-linked criminal record as arrested/booked when police clear scene.
            if (m.category === 'police' || m.category === 'traffic') {
              const { criminalRecords, updateCriminalRecord, addInmate, selectedCity } = useGameStore.getState();
              const linked = criminalRecords.find((r) => r.missionId === m.id);
              if (linked && selectedCity) {
                updateCriminalRecord(linked.id, { warrantStatus: 'served' });
                // 50% chance subject is booked (traffic/low risk = citation, high/violent = booked).
                if (linked.riskLevel === 'high' || linked.riskLevel === 'violent' || (linked.charges.length > 0 && Math.random() > 0.5)) {
                  const { stations: jailStations, inmates: jailInmates } = useGameStore.getState();
                  const booking = bookInmate(linked, selectedCity.name, jailStations, jailInmates);
                  addInmate(booking.inmate);
                  broadcastRadioMessage({
                    from: selectedCity.name ? `${selectedCity.name} PD` : 'Dispatch',
                    to: 'All Units',
                    text: booking.transferred
                      ? `County jail is at capacity — ${linked.firstName} ${linked.lastName} transferred to the regional detention center.`
                      : `Booking completed for ${linked.firstName} ${linked.lastName} — transported to county jail.`,
                    type: 'broadcast',
                    service: 'police',
                  });
                } else {
                  broadcastRadioMessage({
                    from: selectedCity.name ? `${selectedCity.name} PD` : 'Dispatch',
                    to: 'All Units',
                    text: `Subject ${linked.firstName} ${linked.lastName} cited and released for ${linked.charges.slice(0, 2).join(', ')}${linked.charges.length > 2 ? '...' : ''}.`,
                    type: 'broadcast',
                    service: 'police',
                  });
                }
              }
            }
            // EMS: a victim is admitted to the city hospital. A transported
            // patient (v0.22.9) is the pre-built one carried from the scene —
            // admitted the moment the ER delivery completes. Diverted patients
            // (v0.22.12) are admitted at the regional trauma center instead.
            if (m.category === 'ems' && (m.patientTransport || Math.random() < 0.8)) {
              const { addPatient, selectedCity: cityNow } = useGameStore.getState();
              const patient = m.patientTransport?.patient ?? buildPatientFromMission(m);
              addPatient({
                ...patient,
                transportedBy: m.patientTransport?.transportedByUnit,
                // The transport leg's mode feeds the per-shift airlift tally
                // (v0.22.14): 'air' = helicopter via the helipad, 'road' =
                // ambulance run. Scene-admitted patients have no mode.
                transportMode: m.patientTransport?.mode,
              });
              broadcastRadioMessage({
                from: cityNow?.name ? `${cityNow.name} EMS` : 'EMS',
                to: 'Dispatch',
                text: patient.diverted
                  ? `${patient.firstName} ${patient.lastName} admitted at ${patient.divertedTo ?? 'the regional trauma center'} — ${patient.condition}.`
                  : `${patient.firstName} ${patient.lastName} transported to ${cityNow?.name ?? 'the city'} General — ${patient.condition}.${patient.severity === 'critical' ? ' Priority trauma team standing by.' : ''}`,
                type: 'unit',
                service: 'ems',
              });
            }
            // Fire: fire marshal opens a cause investigation on a cleared fire scene.
            if (m.category === 'fire' && Math.random() < 0.75) {
              const { addInvestigation, selectedCity: cityNow } = useGameStore.getState();
              const inv = buildInvestigationFromMission(m);
              addInvestigation(inv);
              broadcastRadioMessage({
                from: cityNow?.name ? `${cityNow.name} Fire Marshal` : 'Fire Marshal',
                to: 'Dispatch',
                text: `Marshal opened a cause investigation on the ${inv.structure.toLowerCase()} at ${inv.address}.`,
                type: 'broadcast',
                service: 'fire',
              });
            }
          } else {
            updateMission(m.id, { progress: newProgress });
          }
        }

        // Countdown active undispatched missions
        if (m.status === 'active') {
          // Mission escalation: standing unresolved calls can intensify
          if (m.timeRemaining < (m.totalTime || 600) * 0.5 && Math.random() < 0.03 && m.difficulty < 10) {
            updateMission(m.id, { difficulty: m.difficulty + 1, creditsReward: Math.round(m.creditsReward * 1.15), xpReward: Math.round(m.xpReward * 1.15), priority: getMissionPriority(m.difficulty + 1, m.category, m.totalTime) });
            addNotification({ type: 'emergency', title: 'Situation Escalating', message: `${m.name} situation is worsening. Send units now.`, icon: '⚠️', duration: 4000 });
            // Desktop push: only fires while the tab is hidden and push is enabled.
            if (m.assignedUnits.length === 0) notify('Critical call unassigned', `${m.name} needs units now`);
          }
          if (m.timeRemaining <= 0) {
            removeMission(m.id);
            // Small chance a successful police/ems mission causes a follow-up call
            if ((m.category === 'police' || m.category === 'ems') && Math.random() < 0.15) {
              (async () => {
                const followUp = await buildMission(m.category as ServiceType, selectedCity, { level: useGameStore.getState().player?.level ?? 1, origin: m.location });
                addMission({ ...followUp, name: `Aftermath: ${followUp.name}`, description: `Follow-up from a completed ${m.name}`, difficulty: Math.min(10, followUp.difficulty + 1), timeRemaining: Math.min(followUp.timeRemaining, 240), totalTime: Math.min(followUp.totalTime || 240, 240), priority: getMissionPriority(Math.min(10, followUp.difficulty + 1), followUp.category, followUp.totalTime || 240) });
              })();
            }
            setFailedMissions(prev => prev + 1);
            const s = useGameStore.getState().shift;
            useGameStore.getState().recordShiftStats({ missionsFailed: s.missionsFailed + 1 });
            // Career stats: a failed mission breaks the completion streak.
            const { career, recordCareerStats } = useGameStore.getState();
            recordCareerStats({ missionsFailed: career.missionsFailed + 1, currentStreak: 0 });
            // Weekly snapshot: a failed call still counts toward calls run.
            const { weekly: weeklyFail, recordWeekly } = useGameStore.getState();
            recordWeekly({ callsRun: weeklyFail.callsRun + 1 });
            // Batch 3b: an expired call costs its district the most trust (−8).
            if (m.district && selectedCity) {
              const fst = useGameStore.getState();
              fst.setDistrictSatisfaction(applySatisfaction(
                fst.districtSatisfaction, selectedCity.name, m.district,
                satisfactionDeltaForResponse(null, true),
              ));
            }
            const { career: afterFail, weekly: weeklyAfterFail } = useGameStore.getState();
            syncCareerStats({
              missionsCompleted: afterFail.missionsCompleted,
              missionsFailed: afterFail.missionsFailed,
              totalCreditsEarned: afterFail.totalCreditsEarned,
              bestResponseTime: Number.isFinite(afterFail.bestResponseTime) ? afterFail.bestResponseTime : 0,
            }, weeklyAfterFail);
            addNotification({
              type: 'emergency',
              title: 'Mission Expired',
              message: `${m.name} — no units dispatched in time`,
              icon: '⏰',
              duration: 4000,
            });
            playMissionAlert();
          } else {
            updateMission(m.id, { timeRemaining: m.timeRemaining - 1 });
          }
        }

        // Patrol units can spot nearby active missions and suggest intercept.
        const patrolSightKm = getPatrolSightRadiusDegrees() * 111;
        currentUnits.forEach((u) => {
          if (!u.position || u.status !== 'patrolling') return;
          const unitService = getUnitServiceType(u.type);
          for (const m of currentMissions) {
            if (m.status !== 'active' || !m.location) continue;
            if (m.assignedUnits.some((uid) => uid === u.id)) continue;
            const dist = haversineKm(u.position!, m.location);
            if (dist > patrolSightKm) continue;
            // A patrol unit only spots incidents its own service can actually
            // answer — the same requiredServicesForMission rule every
            // quick-dispatch surface uses (primary service OR a unit
            // requirement). getAssistingServices is weather-flavored
            // assistance, not an answerability guarantee, so a police unit no
            // longer suggests intercepting a fire scene it can't crew
            // (v0.22.12).
            if (!serviceCanAnswerMission(unitService, m)) continue;
            // When the plan ALSO needs another department, the intercept is a
            // partial response — dim the suggestion and name the backup needed
            // so the commander knows the unit can't crew it alone.
            const backup = backupServicesFor(unitService, m);
            const key = `intercept_${u.id}_${m.id}`;
            if (interceptedMissionsRef.current.has(key)) continue;
            interceptedMissionsRef.current.add(key);
            setTimeout(() => interceptedMissionsRef.current.delete(key), 20000);
            addNotification({
              type: 'dispatch',
              title: backup.length > 0 ? 'Patrol Unit Spotted Incident — Needs Backup' : 'Patrol Unit Spotted Incident',
              message: backup.length > 0
                ? `${u.name} is ${dist.toFixed(1)} km from ${m.name}. Needs backup: ${backup.map(serviceDisplayName).join(' + ')}. Click to respond.`
                : `${u.name} is ${dist.toFixed(1)} km from ${m.name}. Click to respond.`,
              dimmed: backup.length > 0,
              service: unitService,
              action: async () => {
              selectMission(m.id);
              setSelectedUnitId(u.id);
              useGameStore.getState().setShowDispatchCenter(true);
              // Needs-backup intercept (v0.22.17): one click pre-dispatches the
              // whole call — the spotting unit responds AND the nearest
              // available partner unit of every missing service is auto-added
              // to the same mission, so the commander never has to hunt for
              // the backup department.
              if (backup.length > 0) {
                const stNow = useGameStore.getState();
                const live = stNow.missions.find((mm) => mm.id === m.id);
                if (live && live.status === 'active') {
                  const sent: string[] = [];
                  const dispatchedBackup: Array<{ unitId: string }> = [];
                  if (await dispatchUnitToMission(u.id, live)) sent.push(u.name);
                  for (const svc of backup) {
                    const partner = findNearestBackupUnit(stNow.units, svc, live);
                    if (partner && partner.id !== u.id && (await dispatchUnitToMission(partner.id, live))) {
                      sent.push(partner.name);
                      dispatchedBackup.push({ unitId: partner.id });
                    }
                  }
                  if (sent.length > 0) {
                    addNotification({
                      type: 'success',
                      title: 'Backup Pre-Dispatched',
                      message: `${sent.join(' + ')} responding to ${live.name} — ${backup.map(serviceDisplayName).join(' + ')} backup dispatched.`,
                      icon: '🚨',
                      duration: 4000,
                    });
                  }
                  // Radio callout (v0.22.18): the backup auto-dispatch speaks over
                  // the air like every other assignment — "Dispatch to Engine 1,
                  // backup requested — fire scene, respond with police."
                  const fresh = useGameStore.getState();
                  for (const { unitId } of dispatchedBackup) {
                    const backupUnit = fresh.units.find((x) => x.id === unitId);
                    if (!backupUnit) continue;
                    const liveNow = fresh.missions.find((mm) => mm.id === live.id) ?? live;
                    const key = `backup:${unitId}:${live.id}`;
                    if (wasRadioKeyDispatched(key)) continue;
                    const seq = (await loadBackupSequence())(
                      backupUnit,
                      liveNow,
                      fresh.units,
                      fresh.missions,
                      backup.map(serviceDisplayName),
                      fresh.helipad?.name,
                    );
                    broadcastRadioSequence(seq, key);
                    markRadioKeyDispatched(key);
                  }
                }
              }
            },
            });
            break;
          }
        });

        // Unit ETA countdown + road-following movement (progress-based interpolation)
        if (m.status === 'en_route') {
          m.assignedUnits.forEach((uid) => {
            const u = currentUnits.find((u) => u.id === uid);
            if (u && u.status === 'en_route' && u.destination && u.position) {
              // Guard against missing ETA fields so units don't teleport or freeze.
              const etaTotal = Math.max(1, u.etaTotal || u.eta || 1);
              const currentEta = u.eta ?? etaTotal;
              const newEta = Math.max(0, currentEta - weatherSpeedMult);

              if (u.waypoints && u.waypoints.length > 0) {
                // Progress-based interpolation: position the unit proportionally along the route
                const elapsed = etaTotal - newEta;
                const progress = Math.max(0, Math.min(1, elapsed / etaTotal));

                updUnit(uid, { eta: newEta });

                if (progress >= 1 || newEta <= 0) {
                  // Arrived at destination
                  updUnit(uid, {
                    position: { ...u.destination },
                    status: 'on_scene',
                    waypoints: undefined,
                    waypointIndex: undefined,
                    eta: 0,
                    currentSpeed: 0,
                    lastPosition: { ...u.destination },
                    lastPositionAt: Date.now(),
                  });

                  // Arrival toast with service icon and rough travel distance
                  const svcConfig = SERVICE_CONFIG[m.category as ServiceType] ?? SERVICE_CONFIG['fire'];
                  const arrivalDistance = haversineKm(u.position, u.destination!);
                  addNotification({
                    type: 'dispatch',
                    title: `${svcConfig.icon} ${u.name ?? uid} arrived`,
                    message: `${u.name ?? uid} reached ${m.description} (${arrivalDistance.toFixed(1)} km)`,
                    service: m.category,
                    duration: 4000,
                  });

                  // EMS patient transport (v0.22.9): the unit reached the ER —
                  // flip the call back to in_progress so the normal completion
                  // path finalizes it next tick (rewards + patient admission +
                  // unit return), with the transported patient already on board.
                  if (m.patientTransport) {
                    const pt = m.patientTransport;
                    const hospital = useGameStore.getState().hospital;
                    const helipad = useGameStore.getState().helipad;
                    // Air-ambulance two-leg flight (v0.22.x): the helicopter
                    // sets down at the PAD first, then hops to the HOSPITAL ER
                    // with the patient — the call only finalizes when the ER is
                    // reached, so airlifted patients actually arrive at the
                    // hospital instead of teleporting in at the landing zone.
                    if (pt.mode === 'air' && !pt.padReached && helipad && hospital) {
                      updateMission(m.id, {
                        status: 'en_route',
                        patientTransport: { ...pt, padReached: true, startedAt: Date.now() },
                      });
                      const flight = generateRoadPath(u.destination!, hospital.position);
                      const distKm = haversineKm(u.destination!, hospital.position);
                      const eta = applyTravelTech(Math.max(8, Math.round((distKm * 1000) / AIR_SPEED_MS)));
                      updUnit(uid, {
                        status: 'en_route',
                        destination: hospital.position,
                        waypoints: flight.waypoints,
                        waypointIndex: 0,
                        eta,
                        etaTotal: eta,
                      });
                      broadcastRadioMessage({
                        from: 'Dispatch',
                        to: u.name ?? uid,
                        text: `${u.name ?? uid}, patient secured at ${helipad.name} — final approach to ${hospital.name} ER, ${Math.max(1, Math.round((distKm * 1000) / AIR_SPEED_MS))}s flight.`,
                        type: 'dispatch',
                        service: 'ems',
                      });
                    } else {
                      updateMission(m.id, { status: 'in_progress', progress: 100 });
                    }
                  }
                } else {
                  const newPos = getPositionOnPath(u.waypoints, progress);
                  updUnit(uid, { position: newPos, ...recordSpeedUpdate(u, newPos) });
                }
              } else {
                // No waypoints set yet — request a real-road route (OSRM with fallback)
                if (!pendingDispatchRoutes.has(uid)) {
                  pendingDispatchRoutes.add(uid);
                  fetchDrivingRoute(u.position, u.destination!)
                    .then((route) => {
                      if (route.waypoints.length >= 2) {
                        updUnit(uid, { waypoints: route.waypoints, waypointIndex: 0, eta: applyTravelTech(route.durationSec), etaTotal: applyTravelTech(route.durationSec) });
                      }
                    })
                    .catch(() => {
                      // Fallback: generate a local road path
                      const fallback = generateRoadPath(u.position!, u.destination!).waypoints;
                      if (fallback.length >= 2) {
                        const speedMs = u.speed || 13.9;
                        const eta = applyTravelTech(Math.max(5, Math.round((haversineKm(u.position!, u.destination!) * 1000) / speedMs)));
                        updUnit(uid, { waypoints: fallback, waypointIndex: 0, eta, etaTotal: eta });
                      }
                    })
                    .finally(() => pendingDispatchRoutes.delete(uid));
                }
              }
            }
          });
        }
      });

      // ── Disaster lifecycle: active window ends → scaled bonus → recovery ──
      const dst = useGameStore.getState();
      const d = dst.activeDisaster;
      if (d && d.phase !== 'aftermath' && Date.now() >= d.endsAt) {
        const def = DISASTER_DEFINITIONS.find((x) => x.id === d.id);
        if (def && d.spawned > 0) {
          const ratio = Math.min(1, d.completed / d.spawned);
          const credits = Math.round(def.completionBonus.credits * ratio);
          const xp = Math.round(def.completionBonus.xp * ratio);
          const p = dst.player;
          if (p && (credits > 0 || xp > 0)) {
            const leveled = advanceLevel(p.level, p.xp, xp);
            dst.updatePlayer({ credits: p.credits + credits, xp: leveled.xpIntoLevel, level: leveled.level });
            addNotification({
              type: 'success',
              title: `${def.icon} ${def.name} Contained`,
              message: `+${credits.toLocaleString()} credits, +${xp} XP (${Math.round(ratio * 100)}% cleared). Recovery phase: damage assessment, displaced residents, and debris clearing.`,
              icon: '🏅',
              duration: 6000,
            });
            playSuccess();
          }
        }
        // The city doesn't snap back: switch the banner to RECOVERY and roll out
        // a staggered wave of low-stakes restoration calls near the disaster zone.
        const aftermath: ActiveDisaster = {
          ...d,
          phase: 'aftermath',
          aftermathEndsAt: Date.now() + AFTERMATH_WINDOW_MS,
          recoverySpawned: 0,
          recoveryCompleted: 0,
        };
        dst.setDisaster(aftermath);
        void spawnRecoveryWave(aftermath);
        // Same story for the aftermath: when the restoration calls were adapted
        // to the player's department, say so — partner stations unlock the
        // cross-service response.
        const recoveryAdapted = waveWasAdapted(
          RECOVERY_WAVE,
          adaptWaveToService(RECOVERY_WAVE, dst.selectedService, dst.stations),
        );
        addNotification({
          type: 'dispatch',
          title: 'Recovery Phase',
          message: recoveryAdapted
            ? 'Restoration underway — calls adapted to your department. Build a partner station to unlock the full cross-service response (+25% Mutual Aid).'
            : 'Restoration underway — assessment, relocation, and debris calls are rolling out in the affected zone.',
          icon: '🔧',
          duration: 5000,
        });
      } else if (d && d.phase === 'aftermath' && (!d.aftermathEndsAt || Date.now() >= d.aftermathEndsAt)) {
        // Recovery window over (or missing — self-heal) — the city has returned to normal.
        dst.setDisaster(null);
      }
    };

    const interval = setInterval(tick, 1000 / gameSpeed);
    return () => {
      clearInterval(interval);
      pendingDispatchRoutes.clear();
    };
  }, [gameScreen, settingsVersion, showPause]);

  // settingsVersion is read by the game loop effect to recreate the interval when speed changes.

  // ── WebSocket connection (online layer, v0.23) ──
  // Connected only when the player chose Online Gameplay AND the server is not
  // in maintenance mode. The multiplayer relay (unit positions, presence,
  // live chat) all flow through this socket — turning it off yields a private
  // single-player session with the full local simulation untouched.
  useEffect(() => {
    if (gameScreen !== 'playing') return;

    const s = useGameStore.getState();
    const { setPlayer, updatePlayer, updateStation, addStation, updateUnit, updateMission, setNearbyStations, setNearbyUnits } = s;

    // Maintenance message from the server: the founder paused the online layer.
    // Flip the store flag (drives the chip) and drop the socket so reconnect
    // attempts stop until the /health poll (or the lifted flag) says otherwise.
    const unMaintenance = wsClient.onMessage('maintenance', (msg: ServerMessage) => {
      if (msg.type !== 'maintenance') return;
      const active = msg.maintenance === true;
      useGameStore.getState().setMaintenance(active);
      // The server drops a durable inbox note on the flip — tell the inbox to
      // refresh NOW so the bell badge (and the highlighted note) appears the
      // moment the window starts, not on the next 45s poll (v0.22.18).
      window.dispatchEvent(new CustomEvent('dhq:inbox-refresh'));
      if (active) {
        wsClient.disconnect();
        addNotification({
          type: 'warning',
          title: 'Maintenance Mode',
          message: msg.reason || 'Online services are paused for maintenance — single-player continues.',
          icon: '🛠️',
          duration: 5000,
        });
      }
    });

    const unauth = wsClient.onMessage('auth_ok', (msg: ServerMessage) => {
      if (msg.type !== 'auth_ok') return;
      useGameStore.getState().setWsConnected(true);
      if (msg.state?.player) setPlayer(msg.state.player as any);
      (msg.state?.stations ?? []).forEach((st: any) => addStation(st));
      (msg.state?.units ?? []).forEach((u: any) => updateUnit(u.id, u));
      (msg.state?.missions ?? []).forEach((m: any) => addMission(m));
      addNotification({ type: 'success', title: 'Online', message: 'Connected to dispatch server', icon: '🌐', duration: 2500 });
    });

    const unDelta = wsClient.onMessage('state_delta', (msg: ServerMessage) => {
      if (msg.type !== 'state_delta') return;
      msg.changes?.forEach((c) => {
        if (c.entity === 'station') updateStation(c.id, c.changes as any);
        else if (c.entity === 'unit') updateUnit(c.id, c.changes as any);
        else if (c.entity === 'mission') updateMission(c.id, c.changes as any);
      });
    });

    const unConfirmed = wsClient.onMessage('action_confirmed', (msg: ServerMessage) => {
      if (msg.type !== 'action_confirmed') return;
      const data = msg.result?.data;
      if (data?.player) updatePlayer(data.player as any);
      if (data?.station) updateStation(data.station.id, data.station as any);
      if (data?.unit) updateUnit(data.unit.id, data.unit as any);
      if (data?.mission) updateMission(data.mission.id, data.mission as any);
    });

    const unRejected = wsClient.onMessage('action_rejected', (msg: ServerMessage) => {
      if (msg.type !== 'action_rejected') return;
      addNotification({ type: 'error', title: 'Action rejected', message: msg.reason, icon: '⚠️', duration: 4000 });
    });

    const unPong = wsClient.onMessage('pong', () => { });

    const unNotification = wsClient.onMessage('notification', (msg: ServerMessage) => {
      if (msg.type !== 'notification') return;
      const mapType: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
        success: 'success', warning: 'warning', error: 'error', info: 'info',
      };
      addNotification({
        type: mapType[msg.notification.type] ?? 'info',
        title: msg.notification.title,
        message: msg.notification.message,
        duration: 4000,
      });
    });

    // ── Co-op dispatch: receive shared missions from alliance members ──
    // Gated by alliance level: L2+ for shared board, L3+ for dispatch, L4+ for cross-service.
    const unAllianceMission = wsClient.onMessage('alliance_mission_spawn', (msg: ServerMessage) => {
      if (msg.type !== 'alliance_mission_spawn') return;
      // Only accept missions for the current city
      const currentCity = useGameStore.getState().selectedCity?.name;
      if (!currentCity || msg.city !== currentCity) return;
      // Alliance level gating: need level 2+ to see shared board
      const allianceState = useGameStore.getState().myAlliance;
      if (!allianceState) return;
      const allianceLevel = allianceLevelFor(allianceState.xp ?? 0).level;
      if (allianceLevel < 2) return;
      // Don't add missions we already have (dedup by id)
      const existing = useGameStore.getState().missions.find((m) => m.id === msg.mission.id);
      if (existing) return;
      // Tag the mission with alliance metadata and add it
      const sharedMission = {
        ...msg.mission,
        allianceShared: true,
        allianceSpawnerId: undefined,
        allianceSpawnerName: msg.playerName,
        allianceResponders: [],
      };
      useGameStore.getState().addMission(sharedMission);
      addNotification({
        type: 'dispatch',
        title: 'Alliance Mission',
        message: `${msg.mission.name} — ${msg.playerName} needs backup`,
        icon: '🤝',
        duration: 5000,
      });

      // Co-op auto-respond: if the setting is on, dispatch the nearest unit
      // to the shared mission immediately (v0.40.0).
      void (async () => {
        const { loadSettings } = await import('@/utils/settings');
        if (!loadSettings().autoRespondAlliance) return;
        const state = useGameStore.getState();
        const myUnits = state.units.filter(u =>
          (u.status === 'available' || u.status === 'patrolling') &&
          !(u.trainingEndsAt && u.trainingEndsAt > Date.now()),
        );
        if (myUnits.length === 0) return;
        let best = myUnits[0];
        let bestDist = Infinity;
        for (const u of myUnits) {
          if (!u.position) continue;
          const d = Math.hypot(u.position.lat - msg.mission.location.lat, u.position.lng - msg.mission.location.lng);
          if (d < bestDist) { bestDist = d; best = u; }
        }
        if (!best.position) return;
        try {
          const { fetchDrivingRoute } = await import('@/utils/routing');
          const { applyTravelTech } = await import('@/lib/techTree');
          const route = await fetchDrivingRoute(best.position, msg.mission.location, best.speed || 13.9);
          state.updateUnit(best.id, {
            status: 'en_route',
            missionId: msg.mission.id,
            eta: applyTravelTech(route.durationSec),
            etaTotal: applyTravelTech(route.durationSec),
            destination: msg.mission.location,
            waypoints: route.waypoints, waypointIndex: 0,
            returnTimer: undefined,
            routeDistanceKm: route.distanceKm,
          });
          state.updateMission(msg.mission.id, { status: 'en_route', assignedUnits: [best.id] });
          addNotification({
            type: 'dispatch',
            title: 'Auto-Respond',
            message: `${best.name} dispatched to ${msg.mission.name}`,
            icon: '🤝',
            duration: 3000,
          });
        } catch { /* route failure — leave the mission unassigned */ }
      })();
    });

    // ── Co-op dispatch: track alliance responders on shared missions ──
    const unAllianceDispatch = wsClient.onMessage('alliance_mission_dispatch', (msg: ServerMessage) => {
      if (msg.type !== 'alliance_mission_dispatch') return;
      const currentCity = useGameStore.getState().selectedCity?.name;
      if (!currentCity) return;
      // Find the mission on our board
      const mission = useGameStore.getState().missions.find(m => m.id === msg.missionId);
      if (!mission || !mission.allianceShared) return;
      // Don't track our own dispatches
      if (msg.playerName === useGameStore.getState().player?.username) return;
      // Update or add the responder
      const existing = mission.allianceResponders ?? [];
      const updated = existing.filter(r => r.playerName !== msg.playerName);
      updated.push({
        playerName: msg.playerName,
        unitCount: msg.unitCount,
        eta: msg.eta,
        service: msg.service,
      });
      useGameStore.getState().updateMission(mission.id, { allianceResponders: updated });
    });

    // ── Co-op dispatch: remove responder on cancel ──
    const unAllianceCancel = wsClient.onMessage('alliance_mission_cancel', (msg: ServerMessage) => {
      if (msg.type !== 'alliance_mission_cancel') return;
      const mission = useGameStore.getState().missions.find(m => m.id === msg.missionId);
      if (!mission || !mission.allianceShared) return;
      const existing = mission.allianceResponders ?? [];
      const updated = existing.filter(r => r.playerName !== msg.playerName);
      useGameStore.getState().updateMission(mission.id, { allianceResponders: updated });
    });

    // ── Co-op dispatch: handle completion from alliance members ──
    // Show 'Cleared by' for 5 seconds before removing from the board.
    const unAllianceComplete = wsClient.onMessage('alliance_mission_complete', (msg: ServerMessage) => {
      if (msg.type !== 'alliance_mission_complete') return;
      const currentCity = useGameStore.getState().selectedCity?.name;
      if (!currentCity) return;
      const mission = useGameStore.getState().missions.find(m => m.id === msg.missionId);
      if (mission?.allianceShared) {
        // Mark the mission as cleared — the alliance tab shows this
        useGameStore.getState().updateMission(msg.missionId, {
          allianceClearedBy: msg.playerName,
        } as any);
        addNotification({
          type: 'success',
          title: 'Alliance Clear',
          message: `${mission.name} cleared by ${msg.playerName} — no action needed`,
          icon: '🎉',
          duration: 4000,
        });
        // Remove after 5 seconds so the 'Cleared by' badge is visible
        setTimeout(() => {
          useGameStore.getState().removeMission(msg.missionId);
        }, 5000);
      }
    });

    // ── Batch 3c: live mutual-aid network ──
    // Request → alliance members see a notification and can answer from
    // their own board (accept is a broadcast, not a mission transfer);
    // when a helper clears it, the mission card gets the CLEARED BY credit
    // via the same allianceClearedBy field the co-op board already renders.
    const unAidRequest = wsClient.onMessage('mutual_aid_request', (msg: ServerMessage) => {
      if (msg.type !== 'mutual_aid_request') return;
      addNotification({
        type: 'dispatch',
        title: 'Mutual Aid Request',
        message: `${msg.playerName} needs backup on ${msg.missionName} (${msg.city}) — answer from the Alliance tab`,
        icon: '🤝',
        duration: 6000,
      });
    });
    const unAidAccept = wsClient.onMessage('mutual_aid_accept', (msg: ServerMessage) => {
      if (msg.type !== 'mutual_aid_accept') return;
      addNotification({
        type: 'info',
        title: 'Aid Accepted',
        message: `${msg.playerName} is answering an aid request`,
        icon: '🤝',
        duration: 4000,
      });
    });
    const unAidCleared = wsClient.onMessage('mutual_aid_cleared', (msg: ServerMessage) => {
      if (msg.type !== 'mutual_aid_cleared') return;
      useGameStore.getState().updateMission(msg.missionId, {
        allianceClearedBy: msg.helperName,
      } as any);
      addNotification({
        type: 'success',
        title: 'Mutual Aid Clear',
        message: `Cleared by ${msg.helperName} — helper earns the 40% aid share`,
        icon: '🎉',
        duration: 4000,
      });
    });

    const unNearby = wsClient.onMessage('nearby_state', (msg: ServerMessage) => {
      if (msg.type !== 'nearby_state') return;
      setNearbyStations(msg.stations ?? []);
      setNearbyUnits(msg.units ?? []);
    });

    // Multiplayer presence: live roster of connected commanders (count + the
    // players panel payload — level, city, activity).
    const unPresence = wsClient.onMessage('presence', (msg: ServerMessage) => {
      if (msg.type !== 'presence') return;
      const st = useGameStore.getState();
      st.setOnlineCount(msg.online);
      st.setOnlinePlayers(msg.players ?? []);
    });

    // Online layer gate: offline mode (player's choice) or server maintenance
    // both keep the socket down — the local simulation never depends on it.
    const onlineAllowed = () => {
      const st = useGameStore.getState();
      return loadSettings().onlineMode && !st.maintenance;
    };

    // /health poll: the maintenance flag is server-authoritative and can flip
    // while this tab is open (founder toggle from the Admin Console) even when
    // the socket never connected (offline mode). Poll every 30s so the chip
    // and the gate stay honest.
    const checkHealth = async () => {
      try {
        const res = await fetch('/health', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const m = data?.maintenance;
        if (!m || typeof m.maintenance !== 'boolean') return;
        const st = useGameStore.getState();
        if (m.maintenance !== st.maintenance) {
          st.setMaintenance(m.maintenance);
          if (m.maintenance) {
            wsClient.disconnect();
            addNotification({
              type: 'warning',
              title: 'Maintenance Mode',
              message: m.reason || 'Online services are paused for maintenance — single-player continues.',
              icon: '🛠️',
              duration: 5000,
            });
          } else {
            addNotification({
              type: 'success',
              title: 'Back Online',
              message: 'Dispatch servers are back — reconnecting online features.',
              icon: '🌐',
              duration: 4000,
            });
            // Batch 3c (P1-M4): the old code notified but never reconnected —
            // a socket that died during maintenance stayed dead. Re-arm here.
            if (onlineAllowed() && !wsClient.isConnected()) wsClient.connect();
          }
        }
        // Batch 3c (P1-M4): the poll is also the recovery net for a socket
        // that died mid-session (wsClient now retries forever, but a poll
        // re-arm costs nothing and covers a wedged client state). Only when
        // online play is allowed and the server is not in maintenance.
        if (!m.maintenance && onlineAllowed() && !wsClient.isConnected()) wsClient.connect();
      } catch {
        // Offline / transient — the next poll or reconnect retries.
      }
    };

    if (onlineAllowed()) wsClient.connect();
    else {
      wsClient.disconnect();
      useGameStore.getState().setWsConnected(false);
    }
    void checkHealth();
    const healthInterval = setInterval(() => { void checkHealth(); }, 30000);

    // The floating online chip used to read the store's wsConnected flag, which
    // only flipped on an auth_ok MESSAGE — a socket that was genuinely up
    // (presence + relay working) could still read "Offline". Mirror the real
    // socket state so the chip always tells the truth: green Online on open,
    // gray Offline on close, amber Maintenance on the flag.
    const unConnChange = wsClient.onConnectionChange((connected) => {
      useGameStore.getState().setWsConnected(connected);
      setLastWsAttemptAt(wsClient.getLastAttemptAt());
    });

    return () => {
      unConnChange();
      unauth(); unDelta(); unConfirmed(); unRejected(); unPong(); unNotification(); unAllianceMission(); unAllianceDispatch(); unAllianceCancel(); unAllianceComplete(); unAidRequest(); unAidAccept(); unAidCleared(); unNearby(); unPresence(); unMaintenance();
      clearInterval(healthInterval);
      wsClient.disconnect();
      useGameStore.getState().setWsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameScreen, onlineMode, maintenance, addNotification]);

  // ── Multiplayer presence: report where we are + what the fleet is doing so
  // other commanders see it in the players panel (v0.22.17). Sent when the
  // city or activity changes, and re-sent every few seconds to recover from
  // missed messages. Server-based — the roster is a WebSocket presence fan-out.
  useEffect(() => {
    if (gameScreen !== 'playing') return;
    if (!wsClient.isConnected()) return;
    const sendPresence = () => {
      const st = useGameStore.getState();
      const fleet = st.units;
      const activity: PresenceActivity =
        fleet.some((u) => u.status === 'en_route' || u.status === 'on_scene')
          ? 'in_mission'
          : fleet.some((u) => u.status === 'patrolling')
            ? 'patrolling'
            : 'idle';
      const city = st.selectedCity?.name ?? null;
      const key = `${city ?? ''}|${activity}`;
      if (lastPresenceRef.current === key) return;
      lastPresenceRef.current = key;
      wsClient.send({ type: 'presence_update', city, activity } satisfies ClientMessage);
    };
    sendPresence();
    const iv = setInterval(sendPresence, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameScreen, wsConnected]);

  // ── Multiplayer: stream own unit positions (throttled relay) ──
  useEffect(() => {
    if (gameScreen !== 'playing') return;
    let lastSent = 0;
    const SEND_INTERVAL = 600;
    const send = () => {
      if (!wsClient.isConnected()) return;
      const now = Date.now();
      if (now - lastSent < SEND_INTERVAL) return;
      lastSent = now;
      const { units: currentUnits, player: me } = useGameStore.getState();
      if (!me) return;
      const headingOf = (u: Unit) => {
        if (u.lastPosition && u.position) {
          const dLat = u.position.lat - u.lastPosition.lat;
          const dLng = u.position.lng - u.lastPosition.lng;
          if (Math.abs(dLat) > 1e-9 || Math.abs(dLng) > 1e-9) {
            return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
          }
        }
        return u.heading ?? 0;
      };
      currentUnits.forEach((u) => {
        if (!u.position || u.status === 'available') return;
        const speedKmh = (u.currentSpeed ?? u.speed ?? 0) * 3.6;
        wsClient.sendUnitPosition(u.id, u.position.lat, u.position.lng, speedKmh, headingOf(u));
      });
    };
    const interval = setInterval(send, 300);
    return () => clearInterval(interval);
  }, [gameScreen]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (isBuildModalOpen) setPendingStationLocation({ lat, lng });
      if (useGameStore.getState().isBuildPoiModalOpen) setPendingPoiLocation({ lat, lng });
    },
    [isBuildModalOpen],
  );

  // Sign out: drop the session on the server, clear local state + save-slot cache.
  const handleLogout = useCallback(async () => {
    try {
      await apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } catch {
      // best-effort — clear locally regardless
    }
    useGameStore.getState().logout();
    clearLocalSaveCache();
    clearSessionActive();
    setSelectedUnitId(null);
    setGameScreen('auth');
    addNotification({ type: 'info', title: 'Logged Out', message: 'See you soon, Commander', icon: '👋', duration: 2500 });
  }, [addNotification]);

  // Clicking a crime-heat zone on the map reassigns the nearest patrol units of
  // the player's service to focus that zone (zone mode + retargeted route).
  const handleZoneClick = useCallback((zoneId: string, zoneName: string) => {
    const state = useGameStore.getState();
    const city = state.selectedCity;
    const bounds = state.mapBounds ?? (city?.bounds ?? null);
    if (!city && !bounds) return;
    const cityCenter = city
      ? { lat: city.lat, lng: city.lng }
      : { lat: (bounds![0][0] + bounds![1][0]) / 2, lng: (bounds![0][1] + bounds![1][1]) / 2 };
    const cityRadiusKm = getCityRadiusKm(city ?? bounds);
    // Match the zone grid the map draws: bounds-aligned neighborhoods (not a
    // radius circle), so clicking Westside targets the actual west side.
    const zone = patrolZonesForCity({ bounds, boundary: city?.boundary ?? null }).find((z) => z.id === zoneId && z.covered !== false);
    if (!zone) return;

    const service = state.selectedService;
    const targets = state.units
      .filter((u) => u.status === 'patrolling' && u.position && getUnitServiceType(u.type) === service)
      .map((u) => ({ u, dist: haversineKm(u.position!, zone.center) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    if (targets.length === 0) {
      addNotification({
        type: 'info',
        title: 'Zone Selected',
        message: `${zoneName} — no patrol units available to reassign`,
        icon: '🗺️',
        duration: 3000,
      });
      return;
    }

    targets.forEach(({ u }) => {
      state.updateUnitPatrolDefaults(u.id, { patrolMode: 'zone', patrolAreaId: zoneId });
      const routeId = u.patrolRouteId;
      if (!routeId) return;
      const station = state.stations.find((s) => s.id === u.stationId);
      if (!station) return;
      const unitSeed = u.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      generatePatrolRoute(station.position, Date.now() + unitSeed, 0, {
        mode: 'zone',
        cityCenter,
        cityRadiusKm,
        cityBounds: bounds,
        boundary: city?.boundary ?? null,
        missions: useGameStore.getState().missions.map((m) => ({ location: m.location, category: m.category, difficulty: m.difficulty })),
        targetZoneId: zoneId,
      })
        .then((wps) => {
          if (wps.length < 2) return;
          const live = useGameStore.getState();
          const stillAssigned = live.units.find((x) => x.id === u.id)?.patrolRouteId === routeId;
          if (!stillAssigned) return;
          live.updatePatrolRoute(routeId, {
            waypoints: wps.map((p) => [p.lat, p.lng] as [number, number]),
            generatedAt: Date.now(),
          });
          live.updateUnit(u.id, { patrolWaypointIndex: 0, patrolProgress: 0 });
        });
    });

    broadcastRadioMessage({
      from: 'Dispatch',
      to: 'All Units',
      text: `Attention units: reassigning patrol to ${zoneName} sector — ${targets.length} unit${targets.length === 1 ? '' : 's'} rerouting.`,
      type: 'dispatch',
      service: service ?? 'police',
    });
    addNotification({
      type: 'dispatch',
      title: 'Patrol Reassigned',
      message: `${targets.length} unit${targets.length === 1 ? '' : 's'} heading to ${zoneName}`,
      icon: '📡',
      duration: 4000,
    });
  }, [addNotification]);

  useEffect(() => {
    if (player) levelRef.current = player.level;
  }, [player]);

  // ── Audio: resume/init on first user interaction (browser autoplay policy) ──
  useEffect(() => {
    const once = () => { initAudio(); };
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, []);

  // Track selected unit for map follow target
  useEffect(() => {
    if (!selectedUnitId) {
      setFollowTarget(null);
      return;
    }
    const allUnits = useGameStore.getState().units;
    const u = allUnits.find((unit) => unit.id === selectedUnitId);
    if (u?.position) setFollowTarget(u.position);
  }, [selectedUnitId]);

  // Onboarding (v0.22.x): the rename/patrol tutorial steps auto-select the
  // first unit so its info panel opens and the spotlight lands immediately.
  useEffect(() => {
    const onTutorialSelect = (e: Event) => {
      const unitId = (e as CustomEvent<{ unitId: string }>).detail?.unitId;
      if (unitId) setSelectedUnitId(unitId);
    };
    window.addEventListener('dhq:tutorial-select-unit', onTutorialSelect);
    return () => window.removeEventListener('dhq:tutorial-select-unit', onTutorialSelect);
  }, []);

  // ── Screen routing ──
  if (gameScreen === 'loading') {
    return (
      <LoadingScreen
        onComplete={async () => {
              try {
                await initSettings();
                const settings = loadSettings();
                if (settings.darkMode === false && isDarkMode) {
                  toggleDarkMode();
                } else if (settings.darkMode === true && !isDarkMode) {
                  toggleDarkMode();
                }
                const me = await apiFetch<{ authenticated: boolean; player?: Player }>('/me');
                // Restore the authenticated identity (real email, founder badge)
                // so the profile dropdown is correct immediately after a reload.
                if (me.player) useGameStore.getState().setPlayer(me.player);
                // Reloading mid-session must boot straight back into the game,
                // not strand the player on the main menu.
                await refreshSaveSlots();
                // The marker is account-aware: only auto-resume when the
                // reloading identity matches the account that was playing
                // (a different user on a shared browser lands on the menu).
                const pid = useGameStore.getState().player?.id;
                if (pid && wasSessionActive(pid)) {
                  const result = await resumeFromSlot();
                  if (result === 'loaded') return;
                  clearSessionActive();
                }
                setGameScreen('menu');
              } catch {
                setGameScreen('auth');
              }
            }}
      />
    );
  }

  if (gameScreen === 'auth') {
    return <Suspense fallback={null}><AuthScreen onAuthed={() => setGameScreen('menu')} /></Suspense>;
  }

  if (gameScreen === 'menu') {
    return (
      <>
        <Suspense fallback={null}>
          <MainMenu
            onContinue={handleContinue}
            onPlay={() => setGameScreen('city-select')}
            onSettings={() => setShowMenuSettings(true)}
            onNewCampaign={handleNewCampaign}
            onLoadGame={handleLoadSlot}
            onDeleteSlot={handleDeleteSlot}
            hasSave={saveExists}
            onLogout={handleLogout}
          />
          <SettingsModal isOpen={showMenuSettings} onClose={() => setShowMenuSettings(false)} />
        </Suspense>
      </>
    );
  }

  if (gameScreen === 'city-select') {
    return (
      <Suspense fallback={null}>
        <CitySelectionScreen
          mode={relocating ? 'relocate' : 'new'}
          onGameStart={() => {
            const wasRelocating = relocating;
            setGameScreen('playing');
            setRelocating(false);
            // A fresh campaign gets the onboarding tour (unless this account has
            // already completed it once — per-account marker, v0.22.x); a
            // relocation always skips it.
            if (!wasRelocating && !hasCompletedTutorial(useGameStore.getState().player?.id)) {
              setShowOnboarding(true);
            }
          }}
          onCancelRelocate={() => {
            setRelocating(false);
            setGameScreen('playing');
          }}
        />
      </Suspense>
    );
  }

  return (
    // h-screen is the fallback; the inline 100dvh keeps the HUD off the iOS
    // Safari URL-bar overlay on phones/tablets (dynamic viewport height).
    <div className="w-screen h-screen overflow-hidden bg-gray-950" style={{ height: '100dvh' }}>
      {!showTactical && (
        <div className="map-no-invert absolute inset-0">
          <Suspense fallback={<div className="absolute inset-0 bg-gray-950" />}>
            <MapView onMapClick={handleMapClick} onUnitClick={(unit) => setSelectedUnitId(unit.id)} onStationClick={() => { setActiveNavTab('stations'); setShowStationsPanel(true); }} onZoneClick={handleZoneClick} followTarget={followTarget} />
          </Suspense>
          {/* Ambient weather visuals driven by active random events — inside the
              map container so they inherit the same theme/invert treatment. */}
          <WeatherOverlay activeEvents={activeEvents} />
        </div>
      )}

      {/* Online / Offline / Maintenance indicator — top-right below the TopBar.
          Three states (v0.23): server maintenance (founder toggle) is amber and
          pauses the online layer; connected is green with the live presence
          count; otherwise gray — "Offline Mode" when the player chose a private
          single-player session, "Offline" while reconnecting. Clickable (v0.22.17):
          opens the Commanders Online panel — the live roster of who's connected,
          with city, level, and what they're doing.
          Batch 1 polish: when offline with Online mode on, an explicit
          Reconnect button + last-attempt timestamp sit under the chip, so a
          stuck Offline state is actionable instead of mysterious. Manual
          reconnect re-arms the client's retry budget (connect() resets the
          5-attempt cap), which is why this is a button and not just a label. */}
      <div className="absolute top-14 right-4 z-[40] pointer-events-none flex flex-col items-end gap-1">
        <button
          onClick={() => setShowPlayersPanel(true)}
          title="Commanders Online — who's on duty right now"
          className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border backdrop-blur-md shadow-lg cursor-pointer transition-transform active:scale-[0.97] ${
            maintenance
              ? 'bg-amber-900/70 border-amber-500/40 text-amber-300'
              : wsConnected
                ? 'bg-green-900/70 border-green-500/40 text-green-300 hover:bg-green-900'
                : 'bg-gray-900/70 border-gray-700/50 text-gray-500 hover:bg-gray-800'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            maintenance ? 'bg-amber-400 animate-pulse' : wsConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
          }`} />
          {maintenance
            ? 'Maintenance · online paused'
            : wsConnected
              ? `Online · ${onlineCount} player${onlineCount === 1 ? '' : 's'}`
              : onlineMode ? 'Offline' : 'Offline Mode'}
        </button>
        {!wsConnected && !maintenance && onlineMode && (
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => { wsClient.connect(); setLastWsAttemptAt(Date.now()); }}
              title="Reconnect to the dispatch server now"
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold border border-gray-700/50 bg-gray-900/70 text-gray-300 backdrop-blur-md shadow-lg cursor-pointer hover:bg-gray-800 active:scale-[0.97]"
            >
              Reconnect
            </button>
            {lastWsAttemptAt && (
              <span className="text-[9px] text-gray-500">
                Last attempt {new Date(lastWsAttemptAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Commanders Online panel — clickable chip → live roster */}
      {showPlayersPanel && (
        <Suspense fallback={null}>
          <PlayersPanel onClose={() => setShowPlayersPanel(false)} />
        </Suspense>
      )}

      {/* Selected service indicator — matches the city's active department */}
      {selectedService && (() => {
        const cfg = SERVICE_CONFIG[selectedService];
        const svcUnits = units.filter(u => {
          const st = stations.find(s => s.id === u.stationId);
          return st?.type === `${selectedService}_station`;
        });
        // top-[128px]: parked just below the map zoom controls (which sit at
        // 56px) so this floating chip never covers the +/− buttons.
        return (
          <div className={`absolute top-[128px] ${isSidebarOpen ? 'left-80' : 'left-4'} z-[40] flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border bg-gray-800/80 border-gray-600 ${cfg.color}`}>
            <span>{cfg.icon}</span>
            <span className="text-white">{cfg.label}</span>
            <span className="text-gray-500">·</span>
            <span>{svcUnits.length} unit{svcUnits.length === 1 ? '' : 's'}</span>
          </div>
        );
      })()}

      <TopBar
        activeTab={activeNavTab}
        onTabChange={handleTabChange}
        onMenuToggle={toggleSidebar}
        showCAD={showDispatchCenter}
        onToggleCAD={() => toggleDispatchCenter()}
        showTechTree={showTechTree}
        onToggleTechTree={() => setShowTechTree(!showTechTree)}
        showFogOfWar={showFogOfWar}
        onToggleFogOfWar={() => setShowFogOfWar(!showFogOfWar)}
        showPatrolHeat={showPatrolHeat}
        onTogglePatrolHeat={togglePatrolHeat}
        showStationCoverage={showStationCoverage}
        onToggleStationCoverage={toggleStationCoverage}
        showCoverageGap={showCoverageGap}
        onToggleCoverageGap={toggleCoverageGap}
        onNotifications={() => setShowNotifications(v => !v)}
        onLogout={handleLogout}
        onPause={() => setShowPause(true)}
      />

      {/* Sidebar (mission/units/station panels) */}
      <Suspense fallback={null}>
        <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} activeSection={activeNavTab} onSelectUnit={(unit) => setSelectedUnitId(unit.id)} />
      </Suspense>

      <BottomBar onOpenShop={() => setShowShop(true)} />

      {/* Mobile bottom navigation (hidden on md+, and behind full-screen Tactical View) */}
      {!showTactical && (
        <MobileNav
          activeTab={activeNavTab}
          onTabChange={handleTabChange}
          onOpenNotifications={() => setShowNotifications(true)}
          onPause={() => setShowPause(true)}
          onLogout={handleLogout}
        />
      )}

      <Suspense fallback={null}>
        <BuildStationModal
          isOpen={isBuildModalOpen}
          onClose={() => { setBuildModalOpen(false); setPendingStationLocation(null); }}
          pendingLocation={pendingStationLocation}
        />
        <BuildPoiModal
          isOpen={isBuildPoiModalOpen}
          onClose={() => { setBuildPoiModalOpen(false); setPendingPoiLocation(null); }}
          pendingLocation={pendingPoiLocation}
        />
      </Suspense>

      {/* ── Expanded Systems ── */}

      {/* Unified Dispatch Center — full command console */}
      <Suspense fallback={null}>
        <UnifiedDispatchCenter
          isOpen={showDispatchCenter}
          onClose={() => toggleDispatchCenter()}
        />
      </Suspense>

      
      {/* AI Dispatch Assistant */}
      {showAIDispatch && (
        <Suspense fallback={null}>
          <AIDispatch isOpen={showAIDispatch} onClose={() => setShowAIDispatch(false)} />
        </Suspense>
      )}

      {/* Radio Comms console */}
      {showRadio && (
        <div className={`absolute top-20 left-3 ${isSidebarOpen ? 'md:left-96' : 'md:left-4'} right-3 md:right-4 lg:right-24 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-6 z-[45] flex flex-col rounded-xl overflow-hidden border border-emerald-500/30 bg-gray-950/95 shadow-2xl backdrop-blur-md`}>
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-900/20 border-b border-emerald-500/20">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-100">Radio Communications</span>
            </div>
            <button
              onClick={() => toggleRadio()}
              className="px-2 py-1 rounded text-[10px] bg-gray-800/60 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 p-2 overflow-hidden">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-[10px] text-gray-500">Opening radio…</div>}>
              <RadioComms />
            </Suspense>
          </div>
        </div>
      )}

      {/* Tactical View — full-screen map mode */}
      {showTactical && (
        <div className="absolute inset-0 z-[35] bg-black flex flex-col">
          <div className="flex-1 relative">
            <div className="map-no-invert absolute inset-0">
              <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
                <MapView onMapClick={handleMapClick} onUnitClick={(unit) => setSelectedUnitId(unit.id)} onStationClick={() => { setActiveNavTab('stations'); setShowStationsPanel(true); }} onZoneClick={handleZoneClick} followTarget={followTarget} />
              </Suspense>
            </div>
          </div>
          <button
            onClick={() => toggleTactical()}
            className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-dispatch-red/90 border border-red-500/40 rounded-lg text-xs font-bold text-white backdrop-blur hover:bg-dispatch-red transition-colors"
          >
            Exit Tactical
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="px-4 py-2 bg-gray-900/90 border border-gray-700/60 rounded-full text-xs text-gray-400 backdrop-blur flex items-center gap-3">
              <span>🚨 {missions.filter(m => m.status === 'active').length} Active</span>
              <span className="text-gray-600">|</span>
              <span>🚔 {units.filter(u => u.status !== 'en_route' && u.status !== 'dispatched').length} Available</span>
              <span className="text-gray-600">|</span>
              <span>📍 {stations.length} Stations</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating quick-actions dock (collapsible, bottom-right) ── */}
      {!(showAIDispatch || showRadio) && (
        <div className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[30] flex flex-col items-end gap-1.5">
          {rightRailOpen ? (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={() => setRightRailOpen(false)}
                className="flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border border-gray-600/40 bg-gray-950/90 text-gray-300
                           hover:border-gray-400/60 hover:text-white transition-all shadow-lg"
              >
                <span className="whitespace-nowrap">Controls</span>
                <span className="text-xs">✕</span>
              </button>

              {/* Stress Meter — kept inside the Controls dock so it never floats over the map */}
              <div className="flex justify-end">
                <StressMeter
                  activeMissions={missions.length}
                  failedMissions={failedMissions}
                  availableUnits={units.filter(u => u.status === 'available').length}
                  isPaused={showPause}
                  tooltipUp
                />
              </div>

              {/* Unified Dispatch Center toggle */}
              <button
                onClick={() => { setRightRailOpen(false); toggleDispatchCenter(); }}
                className={`flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border transition-all shadow-lg
                           ${showDispatchCenter
                             ? 'bg-cyan-600/90 border-cyan-400/60 text-white shadow-cyan-500/20'
                             : 'bg-gray-900/85 border-gray-600/40 text-gray-300 hover:border-cyan-500/50 hover:text-white'}`}
              >
                <span className="whitespace-nowrap">Dispatch HQ</span>
                <img
                  src="/logo.png?v=13"
                  alt=""
                  className="w-5 h-5 rounded-full object-cover border border-white/10"
                />
              </button>

              {/* AI Dispatch Assistant toggle */}
              <button
                onClick={() => { setRightRailOpen(false); toggleAIDispatch(); }}
                className={`flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border transition-all shadow-lg
                           ${showAIDispatch
                             ? 'bg-blue-600/30 border-blue-400/60 text-blue-300'
                             : 'bg-gray-900/85 border-gray-600/40 text-gray-300 hover:border-blue-400/60 hover:text-blue-300'}`}
              >
                <span className="whitespace-nowrap">Assistant</span>
                <Bot className="w-3.5 h-3.5" />
              </button>

              {/* Tactical View toggle */}
              <button
                onClick={() => { setRightRailOpen(false); toggleTactical(); }}
                className={`flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border transition-all shadow-lg
                           ${showTactical
                             ? 'bg-amber-600/90 border-amber-400/60 text-white shadow-amber-500/20'
                             : 'bg-gray-900/85 border-gray-600/40 text-gray-300 hover:border-amber-500/50 hover:text-white'}`}
              >
                <span className="whitespace-nowrap">Tactical</span>
                <Map className="w-3.5 h-3.5" />
              </button>

              {/* Radio Comms toggle */}
              <button
                onClick={() => { setRightRailOpen(false); toggleRadio(); }}
                className={`flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border transition-all shadow-lg
                           ${showRadio
                             ? 'bg-emerald-600/90 border-emerald-400/60 text-white shadow-emerald-500/20'
                             : 'bg-gray-900/85 border-gray-600/40 text-gray-300 hover:border-emerald-500/50 hover:text-white'}`}
              >
                <span className="whitespace-nowrap">Radio</span>
                <Radio className="w-3.5 h-3.5" />
              </button>

              {/* Map Style toggle */}
              <button
                onClick={() => setMapStyle(mapStyle === 'dark' ? 'light' : mapStyle === 'light' ? 'satellite' : 'dark')}
                className="flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border border-gray-600/40 bg-gray-900/85 text-gray-300
                           hover:border-gray-400/60 hover:text-white transition-all shadow-lg"
              >
                <span className="whitespace-nowrap">Style</span>
                <Layers className="w-3.5 h-3.5" />
              </button>

              {/* Recenter */}
              <button
                onClick={() => {
                  if (selectedCity) {
                    document.dispatchEvent(new CustomEvent('map-recenter', { detail: { lat: selectedCity.lat, lng: selectedCity.lng, zoom: 13 } }));
                  }
                }}
                className="flex items-center justify-end gap-2 px-3 py-2 rounded-lg text-xs font-bold
                           border border-gray-600/40 bg-gray-900/85 text-gray-300
                           hover:border-gray-400/60 hover:text-white transition-all shadow-lg"
              >
                <span className="whitespace-nowrap">Recenter</span>
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setRightRailOpen(true)}
              className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-600/40
                         bg-gray-950/90 text-gray-300 hover:border-gray-400/60 hover:text-white
                         transition-all shadow-lg"
              title="Open controls"
            >
              <span className="text-sm">⚙️</span>
            </button>
          )}
        </div>
      )}



      {/* Fog of War */}
      {selectedCity && (
        <FogOfWar
          mapCenter={[selectedCity.lat, selectedCity.lng]}
          stations={stations.map(s => ({ lat: s.position.lat, lng: s.position.lng }))}
          missions={missions.map(m => ({ lat: m.location.lat, lng: m.location.lng }))}
          isVisible={showFogOfWar}
          onToggle={() => setShowFogOfWar(!showFogOfWar)}
        />
      )}

      {/* Notification Center */}
      <NotificationPanel isOpen={showNotifications} onClose={() => setShowNotifications(false)} />

      {/* Shop — membership & coins (v0.31.0) */}
      <Suspense fallback={null}>
        <ShopModal isOpen={showShop} onClose={() => setShowShop(false)} />
      </Suspense>

      {/* Tech Tree */}
      <Suspense fallback={null}>
        <TechTree isOpen={showTechTree} onClose={() => setShowTechTree(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <StationsPanel
          isOpen={showStationsPanel}
          onClose={() => setShowStationsPanel(false)}
          onOpenBuild={() => { setBuildModalOpen(true); setShowStationsPanel(false); }}
        />
      </Suspense>

      {/* Random Events */}
      <RandomEvents
        activeEvents={activeEvents}
        eventHistory={eventHistory}
        showHistory={showEventHistory}
        onToggleHistory={() => setShowEventHistory(!showEventHistory)}
        onDismissEvent={dismissEvent}
      />

      {/* Pause Screen */}
      <Suspense fallback={null}>
        <PauseScreen
          isOpen={showPause}
          onResume={() => setShowPause(false)}
          onReplayTutorial={() => {
            // Resume the game and restart the tour from step 1 (v0.22.x). The
            // key bump remounts the overlay even if it is already showing, and
            // resetting the store step means the restarted tour (and its next
            // autosave) records step 0, not the old position.
            setShowPause(false);
            useGameStore.getState().setOnboardingStep(0);
            setOnboardingRun((n) => n + 1);
            setShowOnboarding(true);
          }}
          onRelocate={() => {
            saveGame().then(() => {
              setShowPause(false);
              setRelocating(true);
              setGameScreen('city-select');
            });
          }}
          onQuit={() => {
            saveGame().then((ok) => {
              if (!ok) {
                addNotification({
                  type: 'warning',
                  title: 'Save Failed',
                  message: 'Could not save before quitting — recent progress may be lost.',
                  icon: '⚠️',
                  duration: 4000,
                });
              }
              // An explicit quit ends the resumable session — the next reload
              // lands on the menu instead of auto-resuming.
              clearSessionActive();
              setGameScreen('menu');
              setShowPause(false);
            });
          }}
        />
      </Suspense>

      {/* Onboarding Tutorial — key remounts it fresh on every replay */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingOverlay key={onboardingRun} initialStep={onboardingStep} onComplete={() => setShowOnboarding(false)} />
        </Suspense>
      )}

      {selectedUnitId && (
        <Suspense fallback={null}>
          <SelectedUnitPanel unitId={selectedUnitId} onClose={() => setSelectedUnitId(null)} onOpenEmployees={() => setShowEmployeesPanel(true)} />
        </Suspense>
      )}

      {/* Personnel / Crew management panel */}
      <Suspense fallback={null}>
        <EmployeesPanel
          isOpen={showEmployeesPanel}
          onClose={() => setShowEmployeesPanel(false)}
        />
      </Suspense>
    </div>
  );
}

(window as any).__dispatchBuildTime = __BUILD_TIME__;

export default function App() {
  return (
    <NotificationProvider>
      <ThemeShell>
        <GameApp />
      </ThemeShell>
    </NotificationProvider>
  );
}