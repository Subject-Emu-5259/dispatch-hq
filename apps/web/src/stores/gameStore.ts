// ============================================
// Dispatch HQ — Game State Store (Zustand)
// ============================================

import { create } from 'zustand';
import { TECH_BY_ID } from '@/lib/techData';
import type { Station, Unit, Mission, Player, ServiceType, Employee, GeoPoint, CriminalRecord, Inmate, Patient, FireInvestigation, WeeklySnapshot, OnlinePlayerPresence } from '@dispatch-hq/shared';
import { emptyWeekly, isoWeekKey } from '@dispatch-hq/shared';
import { generateRecordPool } from '@/lib/justice';
import { patrolZonesForCity, zoneIdForPoint } from '@/lib/patrol/patrolZones';
import { setRadioCityContext } from '@/lib/radioDialogueEngine';
import type { Poi } from '@/lib/pois';
import type { Hospital, Helipad } from '@/lib/hospital';
import type { SatisfactionRecord } from '@/lib/cityDistricts';
import type { AdoptedCity } from '@/lib/adoptedCities';
import type { DisasterWaveState } from '@/lib/disasterWaves';
import { emptyChallengeState, type ChallengeState } from '@/lib/challenges';
import type { ActiveWeather, ActiveWeatherEvent } from '@/lib/weather';

export interface CityData {
  name: string;
  country: string;
  lat: number;
  lng: number;
  bounds?: [[number, number], [number, number]];
  boundary?: GeoPoint[][]; // precise city limits: outer ring first, holes after
  population?: number;
  state?: string;
}

export interface PatrolRoute {
  id: string;
  stationId: string;
  waypoints: [number, number][];
  assignedUnits: string[];
  active: boolean;
  generatedAt?: number; // epoch ms — when the route was last planned (drives heat-based re-routing)
}

export type PostMissionBehavior = 'return' | 'patrol' | 'auto';
export type PatrolMode = 'station-beat' | 'zone' | 'hotspot' | 'city-sweep';

export interface ZoneShiftStats {
  /** Calls that spawned in this neighborhood this shift. */
  calls: number;
  /** Distance patrolled inside this neighborhood (km). */
  patrolKm: number;
}

export interface ShiftStats {
  startedAt: number;
  missionsCompleted: number;
  missionsFailed: number;
  creditsEarned: number;
  xpEarned: number;
  levelUps: number;
  dutiesHandled: number; // traffic-duty missions completed
  patrolDistanceKm: number; // total distance covered by patrolling units
  patrolShifts: number;     // patrol shifts completed (unit returned for a rest break)
  /** Per-neighborhood heat: calls spawned + patrol km covered (keyed by zone id). */
  zoneStats: Record<string, ZoneShiftStats>;
  /** Completed missions per unit this shift (unit id → count) — debrief leaders. */
  unitShiftStats: Record<string, number>;
  /** Completed missions per difficulty tier this shift — debrief tier mix. */
  tierCounts: Record<string, number>;
  // Crew condition (v0.20.5) — the shift-pressure story for the debrief.
  crewHoursRidden: number;   // game-hours on duty across all assigned employees
  peakFatigue: number;       // highest fatigue any employee reached this shift
  overworkEvents: number;    // employees who crossed the overwork threshold
  moraleBoosts: number;      // training/rest morale lifts this shift
  restEvents: number;        // crew rest breaks taken this shift
  // Seasonal contest (v0.21.2) — calls cleared this shift toward a live event.
  seasonalClears: number;            // clears counting toward the seasonal leaderboard
  seasonalEventId: string | null;    // id of the event being counted (latest)
  // CPU Mutual Aid (v0.22.3) — partner-agency calls the city answered this shift.
  cpuHandledCalls: number;
  // ER staffing (v0.22.12) — EMS calls cleared this shift feed hospital capacity.
  emsCleared: number;
  // Ward expansions (v0.22.17) — credits-bought bed upgrades purchased this shift.
  wardExpansions: number;      // upgrades bought
  wardBedsAdded: number;       // base beds added (WARD_BEDS_PER_LEVEL each)
  wardCreditsSpent: number;    // credits paid
}

/** All-time career stats — the "Dispatch Records" shown on the main menu. */
export interface CareerStats {
  missionsCompleted: number;
  missionsFailed: number;
  totalCreditsEarned: number;
  totalXpEarned: number;
  /** Fastest first-response time in seconds (time from dispatch to all units on scene). */
  bestResponseTime: number;
  /** Current consecutive-completion streak (resets on a failed mission). */
  currentStreak: number;
  /** Longest consecutive-completion streak ever recorded. */
  longestStreak: number;
  /** Cross-service Mutual Aid requests answered (bonus payouts). */
  mutualAidAnswered: number;
}

export const EMPTY_CAREER: CareerStats = {
  missionsCompleted: 0,
  missionsFailed: 0,
  totalCreditsEarned: 0,
  totalXpEarned: 0,
  bestResponseTime: Infinity,
  currentStreak: 0,
  longestStreak: 0,
  mutualAidAnswered: 0,
};

interface GameState {
  // Player
  player: Player | null;

  // Auth & connection state
  token: string | null;
  wsConnected: boolean;
  /** Server maintenance mode (v0.23): online/multiplayer layer paused by the founder. */
  maintenance: boolean;

  // City & Service
  selectedCity: CityData | null;
  selectedService: ServiceType | null;
  mapBounds: [[number, number], [number, number]] | null;

  // Stations
  stations: Station[];
  selectedStationId: string | null;

  // Other players (multiplayer visibility)
  nearbyStations: any[];
  nearbyUnits: any[];

  // Units
  units: Unit[];

  // Missions
  missions: Mission[];
  selectedMissionId: string | null;

  // Patrol
  patrolRoutes: PatrolRoute[];

  // Patrol defaults
  defaultPostMissionBehavior: PostMissionBehavior;
  defaultPatrolMode: PatrolMode;

  // Cross-service cooperation
  cooperationEnabled: boolean;

  // Tech tree
  techPurchased: Set<string>;

  // Justice
  criminalRecords: CriminalRecord[];
  inmates: Inmate[];

  // EMS: patient transport & city hospital
  patients: Patient[];
  /** Player-placed City General Hospital (v0.22.12) — null until the commander builds it. */
  hospital: Hospital | null;
  /** Player-placed Air Ambulance Helipad (v0.22.12) — critical patients only airlift when this exists. */
  helipad: Helipad | null;

  // Player-placed Points of Interest (v0.22.12) — built via the map, persisted in the save
  placedPois: Poi[];

  // Fire: fire marshal bureau
  investigations: FireInvestigation[];

  // Multiplayer presence (players connected to the server)
  onlineCount: number;
  /** Live roster of connected commanders (city, level, activity) — players panel. */
  onlinePlayers: OnlinePlayerPresence[];
  /** My own map viewport (center + radius, mirroring what the relay fan-out
   * uses) — lets the players panel sort "near you" against other commanders. */
  myViewport: { lat: number; lng: number; radiusKm: number } | null;
  // Alliance membership (loaded from the server when the Sidebar opens)
  myAlliance: any | null;
  showAlliesOnMap: boolean;

  // Virtual game clock (v0.14.0): accelerated day/night — 1 real min = 30 game min
  gameMinutes: number;

  // Session stats (current shift)
  shift: ShiftStats;

  // All-time career stats (persisted with the save)
  career: CareerStats;

  // Rolling ISO-week stats (persisted) — drives the Friends leaderboard.
  weekly: WeeklySnapshot;

  // UI State
  isDarkMode: boolean;
  isSidebarOpen: boolean;
  isBuildModalOpen: boolean;
  isBuildPoiModalOpen: boolean;
  isOnboardingComplete: boolean;
  // Onboarding tour position (v0.22.x): 0..N-1 = mid-tour step, -1 = tour
  // finished/skipped. Persisted in the save so a mid-tour reload resumes at
  // the same step instead of restarting (or silently dropping) the tutorial.
  onboardingStep: number;
  mapStyle: 'dark' | 'light' | 'satellite';
  showAI: boolean;
  showCAD: boolean;
  showTactical: boolean;
  showRadio: boolean;
  showDispatchCenter: boolean;
  showPatrolHeat: boolean; // crime-heat zone overlay on the map
  showStationCoverage: boolean; // station coverage-radius overlay on the map
  showCoverageGap: boolean; // coverage-gap overlay: neighborhoods beyond every station's reach (v0.21.1)
  /** Active weather event synced from RandomEvents — drives spawn/speed effects (see lib/weather). */
  weather: ActiveWeather;
  /** The live weather event (name/icon/effect + spawn time) for the Alerts-tab status strip (v0.22.16). */
  weatherEvent: ActiveWeatherEvent | null;
  /** Active city-wide disaster (tornado/flood/wildfire) — see lib/disasters. */
  activeDisaster: import('@/lib/disasters').ActiveDisaster | null;
  /** Batch 3b: citizen satisfaction per district, keyed `city::district` (see lib/cityDistricts). */
  districtSatisfaction: SatisfactionRecord;
  /** Batch 3b: adopted searched-city home bases with local progression (see lib/adoptedCities). */
  adoptedCities: AdoptedCity[];
  /** Batch 3b: live multi-stage disaster wave, if one is running (see lib/disasterWaves). */
  disasterWave: DisasterWaveState | null;
  /** Batch 3d: daily/weekly challenge progress (see lib/challenges). */
  challenges: ChallengeState;
  /** Batch 3d: revealed fog zone ids (see lib/fogExploration). */
  fogRevealed: string[];

  // Actions
  setPlayer: (player: Player) => void;
  updatePlayer: (updates: Partial<Player>) => void;
  setToken: (token: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  /** Set/unset server maintenance mode — gates the WebSocket layer only. */
  setMaintenance: (active: boolean) => void;
  logout: () => void;
  resetNewGame: () => void;
  setSelectedCity: (city: CityData | null) => void;
  setSelectedService: (service: ServiceType | null) => void;
  setMapBounds: (bounds: [[number, number], [number, number]] | null) => void;
  /** Move the whole command to a new city (v0.21.0): fleet re-settles inside the new city limits, career/economy/settings carry over. */
  relocateCity: (city: CityData, service: ServiceType, bounds: [[number, number], [number, number]]) => void;
  addStation: (station: Station) => void;
  updateStation: (id: string, updates: Partial<Station>) => void;
  removeStation: (id: string) => void;
  setStations: (stations: Station[]) => void;
  selectStation: (id: string | null) => void;
  setNearbyStations: (stations: any[]) => void;
  setNearbyUnits: (units: any[]) => void;
  // Cosmetic identity (v0.15.0)
  setUnitLivery: (unitId: string, liveryId: string) => void;
  setStationTheme: (stationId: string, themeId: string) => void;
  
  addUnit: (unit: Unit) => void;
  updateUnit: (id: string, updates: Partial<Unit>) => void;
  removeUnit: (id: string) => void;
  setUnits: (units: Unit[]) => void;
  
  addMission: (mission: Mission) => void;
  updateMission: (id: string, updates: Partial<Mission>) => void;
  removeMission: (id: string) => void;

  // Player-placed POIs + hospital (v0.22.12)
  placePoi: (poi: Poi) => void;
  removePoi: (id: string) => void;
  setPlacedPois: (pois: Poi[]) => void;
  setHospital: (hospital: Hospital | null) => void;
  setHelipad: (helipad: Helipad | null) => void;
  setMissions: (missions: Mission[]) => void;
  selectMission: (id: string | null) => void;

  // Patrol
  addPatrolRoute: (route: PatrolRoute) => void;
  updatePatrolRoute: (id: string, updates: Partial<PatrolRoute>) => void;
  removePatrolRoute: (id: string) => void;
  setPatrolRoutes: (routes: PatrolRoute[]) => void;

  // Patrol defaults
  setDefaultPostMissionBehavior: (behavior: PostMissionBehavior) => void;
  setDefaultPatrolMode: (mode: PatrolMode) => void;
  updateUnitPatrolDefaults: (id: string, updates: { postMissionBehavior?: PostMissionBehavior; patrolMode?: PatrolMode; patrolAreaId?: string | null }) => void;

  // Tech tree
  setTechPurchased: (ids: string[]) => void;
  addTechPurchased: (id: string) => void;
  purchaseTech: (id: string) => boolean;
  isTechUnlocked: (techId: string) => boolean;
  // Session stats
  recordShiftStats: (updates: Partial<ShiftStats>) => void;
  resetShift: () => void;
  // Virtual game clock
  advanceGameClock: (minutes: number) => void;
  // Career stats
  recordCareerStats: (updates: Partial<CareerStats>) => void;
  setCareer: (career: CareerStats) => void;
  resetCareer: () => void;
  // Weekly stats (Friends leaderboard)
  recordWeekly: (updates: Partial<WeeklySnapshot>) => void;
  setWeekly: (weekly: WeeklySnapshot) => void;

  // Justice
  setCriminalRecords: (records: CriminalRecord[]) => void;
  addCriminalRecord: (record: CriminalRecord) => void;
  updateCriminalRecord: (id: string, updates: Partial<CriminalRecord>) => void;
  linkCriminalRecordToMission: (recordId: string, missionId: string) => void;
  removeCriminalRecord: (id: string) => void;
  seedCriminalRecords: (city: CityData) => void;
  setInmates: (inmates: Inmate[]) => void;
  addInmate: (inmate: Inmate) => void;
  updateInmate: (id: string, updates: Partial<Inmate>) => void;
  releaseInmate: (id: string) => void;

  // EMS: patient transport & city hospital
  setPatients: (patients: Patient[]) => void;
  addPatient: (patient: Patient) => void;
  updatePatient: (id: string, updates: Partial<Patient>) => void;
  dischargePatient: (id: string) => void;

  // Fire: fire marshal bureau
  setInvestigations: (investigations: FireInvestigation[]) => void;
  addInvestigation: (investigation: FireInvestigation) => void;
  closeInvestigation: (id: string) => void;

  // Multiplayer presence
  setOnlineCount: (count: number) => void;
  setOnlinePlayers: (players: OnlinePlayerPresence[]) => void;
  setMyViewport: (vp: { lat: number; lng: number; radiusKm: number } | null) => void;
  // Alliances
  setMyAlliance: (alliance: any | null) => void;
  setShowAlliesOnMap: (show: boolean) => void;

  // Cooperation
  toggleCooperation: () => void;

  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  setBuildModalOpen: (open: boolean) => void;
  setBuildPoiModalOpen: (open: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setOnboardingStep: (step: number) => void;
  setMapStyle: (style: 'dark' | 'light' | 'satellite') => void;
  setShowAI: (show: boolean) => void;
  setShowCAD: (show: boolean) => void;
  setShowTactical: (show: boolean) => void;
  setShowRadio: (show: boolean) => void;
  toggleTactical: () => void;
  toggleRadio: () => void;
  toggleDispatchCenter: () => void;
  togglePatrolHeat: () => void;
  toggleStationCoverage: () => void;
  toggleCoverageGap: () => void;
  setShowDispatchCenter: (show: boolean) => void;
  setWeather: (weather: ActiveWeather) => void;
  setWeatherEvent: (event: ActiveWeatherEvent | null) => void;
  setDisaster: (d: import('@/lib/disasters').ActiveDisaster | null) => void;
  /** Batch 3b: set one district's satisfaction rating (already clamped by lib/cityDistricts). */
  setDistrictSatisfaction: (record: SatisfactionRecord) => void;
  /** Batch 3b: replace the adopted-cities atlas (adoptCity/recordAdoptedCityMission output). */
  setAdoptedCities: (cities: AdoptedCity[]) => void;
  /** Batch 3b: set/clear the live disaster wave. */
  setDisasterWave: (wave: DisasterWaveState | null) => void;
  /** Batch 3d: replace challenge progress (sync hook / claim output). */
  setChallenges: (c: ChallengeState) => void;
  /** Batch 3d: replace the revealed fog zone list. */
  setFogRevealed: (ids: string[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Player
  player: null,

  // Auth & connection state
  token: null,
  wsConnected: false,
  maintenance: false,

  // Stations
  stations: [],
  selectedStationId: null,
  nearbyStations: [],
  nearbyUnits: [],

  // Units
  units: [],

  // Missions
  missions: [],
  selectedMissionId: null,

  // City & Service
  selectedCity: null,
  selectedService: null,
  mapBounds: null,

  // Patrol
  patrolRoutes: [],

  // Patrol defaults
  defaultPostMissionBehavior: 'auto',
  defaultPatrolMode: 'zone',

  // Tech tree
  techPurchased: new Set<string>(),

  // Justice
  criminalRecords: [],
  inmates: [],

  // EMS / Fire agencies
  patients: [],
  hospital: null,
  helipad: null,
  // Player-placed POIs (v0.22.12) — the city starts with none; the commander builds them.
  placedPois: [],
  investigations: [],
  onlineCount: 0,
  myViewport: null,
  onlinePlayers: [],
  myAlliance: null,
  showAlliesOnMap: false,
  // Campaign day starts at 06:00 (see resetNewGame for the same value).
  gameMinutes: 6 * 30,

  // Session stats
  shift: { startedAt: Date.now(), missionsCompleted: 0, missionsFailed: 0, creditsEarned: 0, xpEarned: 0, levelUps: 0, dutiesHandled: 0, patrolDistanceKm: 0, patrolShifts: 0, zoneStats: {}, unitShiftStats: {}, tierCounts: {}, crewHoursRidden: 0, peakFatigue: 0, overworkEvents: 0, moraleBoosts: 0, restEvents: 0, seasonalClears: 0, seasonalEventId: null, cpuHandledCalls: 0, emsCleared: 0, wardExpansions: 0, wardBedsAdded: 0, wardCreditsSpent: 0 },

  // Career stats
  career: { ...EMPTY_CAREER },

  // Weekly stats (Friends leaderboard) — fresh snapshot for this week.
  weekly: emptyWeekly(),

  cooperationEnabled: true,

  // UI State
  isDarkMode: true,
  // v0.29.4: the sidebar drawer defaults CLOSED on phones & tablets (<lg) so a
  // fresh campaign shows the city map first — the hamburger reopens it, and
  // any tab navigation auto-opens it. Desktop (lg+) keeps the open default.
  isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  isBuildModalOpen: false,
  isBuildPoiModalOpen: false,
  isOnboardingComplete: false,
  onboardingStep: 0,
  mapStyle: 'dark',
  showAI: false,
  showCAD: false,
  showTactical: false,
  showRadio: false,
  showDispatchCenter: false,
  showPatrolHeat: false,
  showStationCoverage: false,
  showCoverageGap: false,
  weather: 'clear',
  weatherEvent: null,
  activeDisaster: null,
  districtSatisfaction: {},
  adoptedCities: [],
  disasterWave: null,
  challenges: emptyChallengeState(),
  fogRevealed: [],

  // Actions
  setPlayer: (player) => set({ player }),
  updatePlayer: (updates) => set((state) => ({
    player: state.player ? { ...state.player, ...updates } : null,
  })),
  setToken: (token) => set({ token }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setMaintenance: (active) => set({ maintenance: active }),
  logout: () => set({
    player: null,
    token: null,
    wsConnected: false,
    maintenance: false,
    stations: [],
    units: [],
    missions: [],
    patrolRoutes: [],
    placedPois: [],
    hospital: null,
    helipad: null,
    techPurchased: new Set(),
    defaultPostMissionBehavior: 'auto',
    defaultPatrolMode: 'zone',
    // A different player never inherits the previous account's tour position.
    onboardingStep: 0,
    // Batch 3b state is per-campaign/per-player — never inherited.
    districtSatisfaction: {},
    adoptedCities: [],
    disasterWave: null,
    challenges: emptyChallengeState(),
    fogRevealed: [],
    // Clear career records so a different player never sees stale stats.
    career: { ...EMPTY_CAREER },
    weekly: emptyWeekly(),
  }),
  resetNewGame: () => set({
    player: null,
    stations: [],
    units: [],
    missions: [],
    patrolRoutes: [],
    techPurchased: new Set(),
    criminalRecords: [],
    inmates: [],
    patients: [],
    // A fresh campaign restarts the tour from step 1 (replayable later).
    onboardingStep: 0,
    // Batch 3b: fresh campaign resets district trust + any live wave.
    // The adopted-cities atlas is deliberately KEPT — home bases persist across campaigns.
    districtSatisfaction: {},
    disasterWave: null,
  hospital: null,
  helipad: null,
  placedPois: [],
    investigations: [],
    onlineCount: 0,
    myViewport: null,
  onlinePlayers: [],
    myAlliance: null,
    showAlliesOnMap: false,
    // A fresh campaign has no city until city-select completes — clearing
    // these here means the save guard (never persist boot/reset state over a
    // real save) also covers the brief window between reset and start.
    selectedCity: null,
    selectedService: null,
    mapBounds: null,
    // New campaigns open at 06:00 — morning shift, full daylight ahead.
    gameMinutes: 6 * 30,    shift: { startedAt: Date.now(), missionsCompleted: 0, missionsFailed: 0, creditsEarned: 0, xpEarned: 0, levelUps: 0, dutiesHandled: 0, patrolDistanceKm: 0, patrolShifts: 0, zoneStats: {}, unitShiftStats: {}, tierCounts: {}, crewHoursRidden: 0, peakFatigue: 0, overworkEvents: 0, moraleBoosts: 0, restEvents: 0, seasonalClears: 0, seasonalEventId: null, cpuHandledCalls: 0, emsCleared: 0, wardExpansions: 0, wardBedsAdded: 0, wardCreditsSpent: 0 },
  career: { ...EMPTY_CAREER },
    weekly: emptyWeekly(),
    selectedStationId: null,
    selectedMissionId: null,
    defaultPostMissionBehavior: 'auto',
    defaultPatrolMode: 'zone',
    cooperationEnabled: true,
  }),
  advanceGameClock: (minutes) => set((state) => ({ gameMinutes: Math.max(0, state.gameMinutes + minutes) })),
  recordShiftStats: (updates) => set((state) => ({
    shift: { ...state.shift, ...updates },
  })),
  resetShift: () => set({
    shift: { startedAt: Date.now(), missionsCompleted: 0, missionsFailed: 0, creditsEarned: 0, xpEarned: 0, levelUps: 0, dutiesHandled: 0, patrolDistanceKm: 0, patrolShifts: 0, zoneStats: {}, unitShiftStats: {}, tierCounts: {}, crewHoursRidden: 0, peakFatigue: 0, overworkEvents: 0, moraleBoosts: 0, restEvents: 0, seasonalClears: 0, seasonalEventId: null, cpuHandledCalls: 0, emsCleared: 0, wardExpansions: 0, wardBedsAdded: 0, wardCreditsSpent: 0 },
  }),
  recordCareerStats: (updates) => set((state) => ({
    career: { ...state.career, ...updates },
  })),
  setCareer: (career) => set({ career: { ...EMPTY_CAREER, ...career } }),
  resetCareer: () => set({ career: { ...EMPTY_CAREER } }),
  recordWeekly: (updates) => set((state) => {
    // Roll the week over automatically: if the stored snapshot is from an
    // older ISO week, start fresh rather than carrying stale counts forward.
    const weekKey = isoWeekKey();
    const base = state.weekly && state.weekly.weekKey === weekKey ? state.weekly : emptyWeekly();
    return { weekly: { ...base, ...updates, weekKey } };
  }),
  setWeekly: (weekly) => set({ weekly: { ...emptyWeekly(), ...weekly } }),
  setSelectedCity: (city) => set({ selectedCity: city }),
  setSelectedService: (service) => set({ selectedService: service }),
  setMapBounds: (bounds) => {
    // Keep the radio dialogue engine pointed at the real map: rebuild the zone
    // grid whenever the city bounds land (game start or save load) so mission
    // cards, unit panels, and the UDC all talk about real streets even before
    // the radio panel ever opens. POI context rides the PLACED set (v0.22.12).
    set({ mapBounds: bounds });
    if (bounds) {
      const state = get();
      setRadioCityContext(
        patrolZonesForCity({ bounds, boundary: state.selectedCity?.boundary ?? null }),
        state.selectedCity?.name,
        state.placedPois,
      );
    }
  },
  // ── Player-placed POIs + hospital (v0.22.12) ─────────────────────────────
  placePoi: (poi) => set((state) => {
    const placedPois = [...state.placedPois, poi];
    setRadioCityContext(
      patrolZonesForCity({ bounds: state.mapBounds, boundary: state.selectedCity?.boundary ?? null }),
      state.selectedCity?.name,
      placedPois,
    );
    return { placedPois };
  }),
  removePoi: (id) => set((state) => {
    const placedPois = state.placedPois.filter((p) => p.id !== id);
    setRadioCityContext(
      patrolZonesForCity({ bounds: state.mapBounds, boundary: state.selectedCity?.boundary ?? null }),
      state.selectedCity?.name,
      placedPois,
    );
    return { placedPois };
  }),
  setPlacedPois: (pois) => set((state) => {
    const placedPois = Array.isArray(pois) ? pois : [];
    if (state.mapBounds) {
      setRadioCityContext(
        patrolZonesForCity({ bounds: state.mapBounds, boundary: state.selectedCity?.boundary ?? null }),
        state.selectedCity?.name,
        placedPois,
      );
    }
    return { placedPois };
  }),
  setHospital: (hospital) => set({ hospital }),
  setHelipad: (helipad) => set({ helipad }),
  relocateCity: (city, service, bounds) => set((state) => {
    // Reposition the existing fleet inside the new city limits; career,
    // economy, settings, and crew carry over untouched. Missions and patrol
    // routes are city-specific, so they reset and the city reseeds its records.
    const stations = state.stations.map((s) => {
      const lat = bounds[0][0] + (bounds[1][0] - bounds[0][0]) * (0.25 + Math.random() * 0.5);
      const lng = bounds[0][1] + (bounds[1][1] - bounds[0][1]) * (0.25 + Math.random() * 0.5);
      return { ...s, position: { lat, lng } };
    });
    const units = state.units.map((u, i) => {
      const st = stations[i % Math.max(1, stations.length)];
      return {
        ...u,
        status: 'available' as const,
        position: st.position,
        destination: null,
        waypoints: [],
        waypointIndex: 0,
        eta: null,
        etaTotal: undefined,
        missionId: null,
        patrolRouteId: null,
        patrolWaypointIndex: 0,
        patrolProgress: undefined,
        returnTimer: undefined,
      };
    });
    return {
      selectedCity: city,
      selectedService: service,
      mapBounds: bounds,
      stations,
      units,
      missions: [],
      patrolRoutes: [],
      criminalRecords: generateRecordPool(city.name, city.state || '', 250),
      inmates: [],
      patients: [],
    hospital: null,
    helipad: null,
    placedPois: [],
    investigations: [],
      selectedStationId: null,
      selectedMissionId: null,
    };
  }),
  setNearbyStations: (stations) => set({ nearbyStations: stations }),
  setNearbyUnits: (units) => set({ nearbyUnits: units }),
  setUnitLivery: (unitId, liveryId) => set((state) => ({
    units: state.units.map((u) => (u.id === unitId ? { ...u, liveryId } : u)),
  })),
  setStationTheme: (stationId, themeId) => set((state) => ({
    stations: state.stations.map((s) => (s.id === stationId ? { ...s, themeId } : s)),
  })),
  
  addStation: (station) => set((state) => ({
    stations: [...state.stations, station],
  })),
  
  updateStation: (id, updates) => set((state) => ({
    stations: state.stations.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    ),
  })),
  
  removeStation: (id) => set((state) => ({
    stations: state.stations.filter((s) => s.id !== id),
  })),
  setStations: (stations) => set({ stations }),
  selectStation: (id) => set({ selectedStationId: id }),


  addUnit: (unit) => set((state) => ({
    units: [...state.units, unit],
  })),
  
  updateUnit: (id, updates) => set((state) => ({
    units: state.units.map((u) =>
      u.id === id ? { ...u, ...updates } : u
    ),
  })),

  removeUnit: (id) => set((state) => ({
    units: state.units.filter((u) => u.id !== id),
  })),
  setUnits: (units) => set({ units }),

  addMission: (mission) => set((state) => {
    // Per-zone call heat: attribute every spawned call to the neighborhood that
    // contains it so the shift report can show where the most incidents occurred.
    const bounds = state.mapBounds;
    let zoneId: string | null = null;
    if (bounds && mission.location) {
      zoneId = zoneIdForPoint(patrolZonesForCity({ bounds, boundary: state.selectedCity?.boundary ?? null }), mission.location);
    }
    const zoneStats = state.shift.zoneStats || {};
    const nextZoneStats = zoneId
      ? { ...zoneStats, [zoneId]: { calls: (zoneStats[zoneId]?.calls ?? 0) + 1, patrolKm: zoneStats[zoneId]?.patrolKm ?? 0 } }
      : zoneStats;
    return {
      missions: [...state.missions, mission],
      shift: { ...state.shift, zoneStats: nextZoneStats },
    };
  }),
  
  updateMission: (id, updates) => set((state) => ({
    missions: state.missions.map((m) =>
      m.id === id ? { ...m, ...updates } : m
    ),
  })),
  
  removeMission: (id) => set((state) => ({
    missions: state.missions.filter((m) => m.id !== id),
  })),
  setMissions: (missions) => set({ missions }),
  selectMission: (id) => set({ selectedMissionId: id }),

  addPatrolRoute: (route) => set((state) => ({
    patrolRoutes: [...state.patrolRoutes, route],
  })),
  
  updatePatrolRoute: (id, updates) => set((state) => ({
    patrolRoutes: state.patrolRoutes.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    ),
  })),
  
  removePatrolRoute: (id) => set((state) => ({
    patrolRoutes: state.patrolRoutes.filter((r) => r.id !== id),
  })),
  setPatrolRoutes: (routes) => set({ patrolRoutes: routes }),

  // Patrol defaults
  setDefaultPostMissionBehavior: (behavior) => set({ defaultPostMissionBehavior: behavior }),
  setDefaultPatrolMode: (mode) => set({ defaultPatrolMode: mode }),
  updateUnitPatrolDefaults: (id, updates) => set((state) => ({
    units: state.units.map((u) =>
      u.id === id ? { ...u, ...updates } : u
    ),
  })),

  setTechPurchased: (ids) => set({ techPurchased: new Set(ids) }),
  addTechPurchased: (id) => set((state) => ({
    techPurchased: new Set([...state.techPurchased, id]),
  })),

  setCriminalRecords: (records) => set({ criminalRecords: records }),
  addCriminalRecord: (record) => set((state) => ({
    criminalRecords: [record, ...state.criminalRecords],
  })),
  updateCriminalRecord: (id, updates) => set((state) => ({
    criminalRecords: state.criminalRecords.map((r) =>
      r.id === id ? { ...r, ...updates } : r
    ),
  })),
  linkCriminalRecordToMission: (recordId, missionId) => set((state) => ({
    criminalRecords: state.criminalRecords.map((r) =>
      r.id === recordId ? { ...r, missionId } : r
    ),
  })),
  removeCriminalRecord: (id) => set((state) => ({
    criminalRecords: state.criminalRecords.filter((r) => r.id !== id),
  })),
  seedCriminalRecords: (city) => {
    const state = get();
    if (state.criminalRecords.length > 0) return;
    const records = generateRecordPool(city.name, city.state || '', 250);
    set({ criminalRecords: records });
  },
  setInmates: (inmates) => set({ inmates }),
  addInmate: (inmate) => set((state) => ({
    inmates: [inmate, ...state.inmates],
  })),
  updateInmate: (id, updates) => set((state) => ({
    inmates: state.inmates.map((i) =>
      i.id === id ? { ...i, ...updates } : i
    ),
  })),
  releaseInmate: (id) => set((state) => ({
    inmates: state.inmates.filter((i) => i.id !== id),
  })),

  // EMS: patient transport & city hospital
  setPatients: (patients) => set({ patients }),
  addPatient: (patient) => set((state) => ({
    patients: [patient, ...state.patients],
  })),
  updatePatient: (id, updates) => set((state) => ({
    patients: state.patients.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    ),
  })),
  dischargePatient: (id) => set((state) => ({
    patients: state.patients.map((p) =>
      p.id === id ? { ...p, status: 'discharged', dischargedAt: Date.now() } : p
    ),
  })),

  // Fire: fire marshal bureau
  setInvestigations: (investigations) => set({ investigations }),
  addInvestigation: (investigation) => set((state) => ({
    investigations: [investigation, ...state.investigations],
  })),
  closeInvestigation: (id) => set((state) => ({
    investigations: state.investigations.map((i) =>
      i.id === id ? { ...i, status: 'cleared' } : i
    ),
  })),

  setOnlineCount: (count) => set({ onlineCount: count }),
  setOnlinePlayers: (players) => set({ onlinePlayers: players }),
  setMyViewport: (vp) => set({ myViewport: vp }),
  setMyAlliance: (alliance) => set({ myAlliance: alliance }),
  setShowAlliesOnMap: (show) => set({ showAlliesOnMap: show }),

  toggleCooperation: () => set((state) => ({
    cooperationEnabled: !state.cooperationEnabled,
  })),

  purchaseTech: (id) => {
    const state = get();
    const tech = TECH_BY_ID[id];
    if (!tech || state.techPurchased.has(id)) return false;
    const reqs = tech.requires ?? [];
    if (!reqs.every((r) => state.techPurchased.has(r))) return false;
    if (!state.player || state.player.credits < tech.cost) return false;
    state.updatePlayer({ credits: state.player.credits - tech.cost });
    state.addTechPurchased(id);
    return true;
  },
  isTechUnlocked: (id) => {
    const state = get();
    const tech = TECH_BY_ID[id];
    if (!tech) return false;
    const reqs = tech.requires ?? [];
    return reqs.every((r) => state.techPurchased.has(r));
  },

  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setBuildModalOpen: (open) => set({ isBuildModalOpen: open }),
  setBuildPoiModalOpen: (open) => set({ isBuildPoiModalOpen: open }),
  setOnboardingComplete: (complete) => set({ isOnboardingComplete: complete }),
  setOnboardingStep: (step) => set({ onboardingStep: step }),
  setMapStyle: (style) => set({ mapStyle: style }),
  setShowAI: (show) => set({ showAI: show }),
  setShowCAD: (show) => set({ showCAD: show }),
  setShowTactical: (show) => set({ showTactical: show }),
  setShowRadio: (show) => set({ showRadio: show }),
  toggleTactical: () => set(s => ({ showTactical: !s.showTactical })),
  toggleRadio: () => set(s => ({ showRadio: !s.showRadio })),
  toggleDispatchCenter: () => set(s => ({ showDispatchCenter: !s.showDispatchCenter })),
  togglePatrolHeat: () => set(s => ({ showPatrolHeat: !s.showPatrolHeat })),
  toggleStationCoverage: () => set(s => ({ showStationCoverage: !s.showStationCoverage })),
  toggleCoverageGap: () => set(s => ({ showCoverageGap: !s.showCoverageGap })),
  setWeather: (weather) => set({ weather }),
  setWeatherEvent: (event) => set({ weatherEvent: event }),
  setDisaster: (d) => set({ activeDisaster: d }),
  setDistrictSatisfaction: (record) => set({ districtSatisfaction: record }),
  setAdoptedCities: (cities) => set({ adoptedCities: cities }),
  setDisasterWave: (wave) => set({ disasterWave: wave }),
  setChallenges: (c) => set({ challenges: c }),
  setFogRevealed: (ids) => set({ fogRevealed: ids }),
  setShowDispatchCenter: (show: boolean) => set({ showDispatchCenter: show }),
}));

// Dev affordance: expose the store for debugging from the console.
if (import.meta.env.DEV) {
  (window as any).__dhqStore = useGameStore;
}
