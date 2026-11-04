// ============================================
// Dispatch HQ — Selected Unit Info Panel
// ============================================
// Click any unit marker on the map to open a live dispatcher info card.
// Shows real-time status, ETA, mission assignment, and quick actions.

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Navigation, Crosshair, MapPin, Gauge, Radio, Shield, Flame, Heart, Users, GraduationCap } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from './NotificationCenter';
import { isTraining, trainingRemainingSec, unitTrainCost, unitTrainDurationSec, MAX_UNIT_TRAINING_LEVEL, startUnitTraining } from '@/lib/training';
import { fetchDrivingRoute, generatePatrolRoute, getUnitServiceType } from '@/utils/routing';
import { patrolZonesForCity } from '@/lib/patrol/patrolZones';
import { unitCanPatrol } from '@/lib/dispatchLogic';
import { getPatrolShiftMs } from '@/utils/settings';
import { haversineKm } from '@/utils/roadPathfinding';
import { formatTimer } from '@/utils/timeFormat';
import { broadcastRadioSequence, wasRadioKeyDispatched, markRadioKeyDispatched } from '@/utils/radioEvents';
import { fatigueLabel, crewReadiness } from '@/lib/personnel';
import { loadSettings } from '@/utils/settings';
import { assignmentSequence, startPatrolSequence, returnToStationSequence } from '@/lib/radioDialogueEngine.lazy';
import { UNIT_CONFIGS, skipTrainingCost } from '@dispatch-hq/shared';
import { spendCoins } from '@/lib/apiClient';
import type { Unit, GeoPoint, Station, Player } from '@dispatch-hq/shared';
import { getUnitMaxSpeedMph, getUnitCurrentSpeedMph } from '@/lib/techTree';
import { LiveryPicker } from './LiveryPicker';
import { InlineRename } from './InlineRename';
import { buildUnitProfile } from '@/lib/unitProfile';

interface Props {
  unitId: string;
  onClose: () => void;
  onOpenEmployees?: () => void;
}

function serviceIcon(service: 'fire' | 'police' | 'ems') {
  if (service === 'fire') return <Flame className="w-3.5 h-3.5 text-red-400" />;
  if (service === 'ems') return <Heart className="w-3.5 h-3.5 text-green-400" />;
  return <Shield className="w-3.5 h-3.5 text-blue-400" />;
}

function statusMeta(status: Unit['status']) {
  switch (status) {
    case 'available': return { label: 'Available', color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
    case 'en_route': return { label: 'En Route', color: 'text-cyan-400', bg: 'bg-cyan-500/15' };
    case 'on_scene': return { label: 'On Scene', color: 'text-red-400', bg: 'bg-red-500/15' };
    case 'returning': return { label: 'Returning', color: 'text-gray-400', bg: 'bg-gray-700/40' };
    case 'patrolling': return { label: 'Patrolling', color: 'text-blue-400', bg: 'bg-blue-500/15' };
    default: return { label: 'Dispatched', color: 'text-amber-400', bg: 'bg-amber-500/15' };
  }
}

export function SelectedUnitPanel({ unitId, onClose, onOpenEmployees }: Props) {
  const { units, stations, missions, selectedMissionId, selectedCity, mapBounds, updateUnit, updateMission, addPatrolRoute, updatePatrolRoute, removePatrolRoute, patrolRoutes, updateUnitPatrolDefaults, isSidebarOpen, player, setUnitLivery, helipad, followedUnitId, setFollowedUnitId, shift, gameMinutes } = useGameStore();
  const unit = units.find((u) => u.id === unitId) || null;
  const [routing, setRouting] = useState(false);
  const [patrolMode, setPatrolMode] = useState<'station-beat' | 'zone' | 'hotspot' | 'city-sweep'>(unit?.patrolMode ?? 'city-sweep');
  const [patrolArea, setPatrolArea] = useState<string | null>(unit?.patrolAreaId ?? null);
  const [returnAfterMission, setReturnAfterMission] = useState((unit?.postMissionBehavior ?? 'return') === 'return');

  const station = useMemo(() => unit?.stationId ? stations.find((s) => s.id === unit.stationId) : null, [unit, stations]);

  // City geometry used for patrol route planning + zone selection.
  const cityGeo = useMemo(() => {
    const center = selectedCity
      ? { lat: selectedCity.lat, lng: selectedCity.lng }
      : station?.position ?? { lat: 0, lng: 0 };
    const radiusKm = selectedCity?.bounds
      ? Math.max(2, Math.min(15, Math.max(
          haversineKm(
            { lat: selectedCity.bounds[0][0], lng: selectedCity.bounds[0][1] },
            { lat: selectedCity.bounds[0][0], lng: selectedCity.bounds[1][1] }
          ),
          haversineKm(
            { lat: selectedCity.bounds[0][0], lng: selectedCity.bounds[0][1] },
            { lat: selectedCity.bounds[1][0], lng: selectedCity.bounds[0][1] }
          )
        ) / 2))
      : mapBounds
      ? Math.max(2, (haversineKm(
          { lat: mapBounds[0][0], lng: mapBounds[0][1] },
          { lat: mapBounds[1][0], lng: mapBounds[1][1] }
        ) / 2))
      : 8;
    return { center, radiusKm };
  }, [selectedCity, station, mapBounds]);

  // Zone dropdown aligns to the map's bounds grid so the chosen neighborhood
  // matches the heat overlay labels exactly. Cells with no city land are hidden.
  const zones = useMemo(
    () => patrolZonesForCity({ bounds: mapBounds ?? selectedCity?.bounds ?? null, boundary: selectedCity?.boundary ?? null })
      .filter((z) => z.covered !== false),
    [mapBounds, selectedCity],
  );
  const mission = useMemo(() => unit?.missionId ? missions.find((m) => m.id === unit.missionId) : null, [unit, missions]);
  const service = useMemo(() => unit ? getUnitServiceType(unit.type) : 'police', [unit]);
  // Staged batch (Addition 8): the unit PROFILE card — service, station,
  // jurisdiction, veterancy, certs/academy, crew readiness, and this
  // shift's clears, all from tracked data (see lib/unitProfile). The game
  // tracks no lifetime per-unit mission count, so none is shown.
  const profile = useMemo(() => {
    if (!unit) return null;
    const crew = (station?.employees ?? []).filter((e) => unit.crewIds?.includes(e.id));
    return buildUnitProfile(unit, station, service, shift?.unitShiftStats?.[unit.id] ?? 0, crew, loadSettings().fatigueMode ?? 'full', gameMinutes ?? 0);
  }, [unit, station, service, shift, gameMinutes]);
  const meta = unit ? statusMeta(unit.status) : statusMeta('available');
  const config = unit ? UNIT_CONFIGS[unit.type] : null;

  const dispatchable = unit && (unit.status === 'available' || unit.status === 'returning' || unit.status === 'patrolling') && !isTraining(unit);
  const dispatchTargetMission = useMemo(() => {
    if (!unit) return null;
    if (selectedMissionId) {
      const target = missions.find((m) => m.id === selectedMissionId && (m.status === 'active' || m.status === 'en_route'));
      if (target) return target;
    }
    const serviceMatches = missions
      .filter((m) => m.status === 'active' && m.assignedUnits.length === 0)
      .filter((m) => service === (m.category === 'fire' ? 'fire' : m.category === 'ems' ? 'ems' : 'police'));
    if (serviceMatches.length) return serviceMatches[0];
    return missions.find((m) => m.status === 'active' && m.assignedUnits.length === 0) || null;
  }, [unit, missions, selectedMissionId, service]);

  // Detach a unit from its patrol route, deleting the route when it is the last unit.
  const detachPatrolRoute = useCallback((uid: string) => {
    const u = useGameStore.getState().units.find((x) => x.id === uid);
    if (!u?.patrolRouteId) return;
    const route = patrolRoutes.find((r) => r.id === u.patrolRouteId);
    if (!route) return;
    const remaining = route.assignedUnits.filter((id) => id !== uid);
    if (remaining.length === 0) {
      removePatrolRoute(route.id);
    } else {
      updatePatrolRoute(route.id, { assignedUnits: remaining });
    }
  }, [patrolRoutes, removePatrolRoute, updatePatrolRoute]);

  const handleDispatch = useCallback(async () => {
    if (!unit || !dispatchTargetMission || !unit.position) return;
    setRouting(true);
    try {
      const route = await fetchDrivingRoute(unit.position, dispatchTargetMission.location, unit.speed || 13.9);
      updateUnit(unit.id, {
        status: 'en_route',
        missionId: dispatchTargetMission.id,
        destination: dispatchTargetMission.location,
        eta: route.durationSec,
        etaTotal: route.durationSec,
        waypoints: route.waypoints,
        waypointIndex: 0,
        returnTimer: undefined,
        routeDistanceKm: route.distanceKm,
        // preserve patrol assignment so unit can resume after mission
        postMissionBehavior: unit.postMissionBehavior ?? 'return',
      });
      updateMission(dispatchTargetMission.id, {
        status: 'en_route',
        assignedUnits: [unit.id],
      });
      const allUnits = useGameStore.getState().units;
      const allMissions = useGameStore.getState().missions;
      const key = `assign:${unit.id}:${dispatchTargetMission.id}`;
      if (!wasRadioKeyDispatched(key)) {
        const seq = assignmentSequence(unit, dispatchTargetMission, allUnits, allMissions, useGameStore.getState().helipad?.name);
        broadcastRadioSequence(seq, key);
        markRadioKeyDispatched(key);
      }
    } finally {
      setRouting(false);
    }
  }, [unit, dispatchTargetMission, updateUnit, updateMission]);

  const handleRecall = useCallback(async () => {
    if (!unit || !station || !unit.position) return;
    setRouting(true);
    try {
      const route = await fetchDrivingRoute(unit.position, station.position, unit.speed || 13.9);
      detachPatrolRoute(unit.id);
      updateUnit(unit.id, {
        status: 'returning',
        missionId: null,
        destination: station.position,
        eta: route.durationSec,
        etaTotal: route.durationSec,
        waypoints: route.waypoints,
        waypointIndex: 0,
        returnTimer: undefined,
        patrolRouteId: null,
        patrolWaypointIndex: undefined,
        patrolShiftEndsAt: undefined,
      });
      const svc = getUnitServiceType(unit.type);
      const allUnits = useGameStore.getState().units;
      const allMissions = useGameStore.getState().missions;
      const key = `return:${unit.id}`;
      if (!wasRadioKeyDispatched(key)) {
        broadcastRadioSequence(returnToStationSequence(unit, station.name, allUnits, allMissions), key);
        markRadioKeyDispatched(key);
      }
    } finally {
      setRouting(false);
    }
  }, [unit, station, detachPatrolRoute, updateUnit]);

  const handleStartPatrol = useCallback(async () => {
    if (!unit || !station || unit.status !== 'available') return;
    setRouting(true);
    try {
      const { center: cityCenter, radiusKm: cityRadiusKm } = cityGeo;
      const mode = patrolMode;
      const unitSeed = unit.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const stationRoutes = patrolRoutes.filter((r) => r.stationId === station.id);
      const beatIndex = stationRoutes.length;
      const seed = Date.now() + unitSeed + beatIndex * 7919;
      const waypoints = await generatePatrolRoute(station.position, seed, beatIndex, {
        mode,
        cityCenter,
        cityRadiusKm,
        cityBounds: mapBounds ?? selectedCity?.bounds ?? null,
        boundary: selectedCity?.boundary ?? null,
        missions: missions.map((m) => ({ location: m.location, category: m.category, difficulty: m.difficulty })),
        targetZoneId: mode === 'zone' ? patrolArea : null,
      });
      const route = {
        id: `patrol_${station.id}_${Date.now()}_${unit.id.slice(-4)}`,
        stationId: station.id,
        waypoints: waypoints.map((p: GeoPoint) => [p.lat, p.lng] as [number, number]),
        assignedUnits: [unit.id],
        active: true,
        generatedAt: Date.now(),
      };
      addPatrolRoute(route);
      updateUnit(unit.id, {
        status: 'patrolling',
        patrolRouteId: route.id,
        patrolWaypointIndex: 0,
        patrolProgress: 0,
        patrolMode: mode,
        patrolAreaId: mode === 'zone' ? patrolArea : null,
        patrolShiftEndsAt: Date.now() + getPatrolShiftMs(),
        postMissionBehavior: returnAfterMission ? 'return' : 'patrol',
      });
      const allUnits = useGameStore.getState().units;
      const allMissions = useGameStore.getState().missions;
      broadcastRadioSequence(startPatrolSequence(unit, station.name, allUnits, allMissions), `patrol:${unit.id}`);
    } finally {
      setRouting(false);
    }
  }, [unit, station, cityGeo, missions, patrolRoutes, patrolMode, patrolArea, returnAfterMission, addPatrolRoute, updateUnit]);

  const handleStopPatrol = useCallback(() => {
    if (!unit) return;
    detachPatrolRoute(unit.id);
    updateUnit(unit.id, {
      status: 'available',
      patrolRouteId: null,
      patrolWaypointIndex: undefined,
      patrolShiftEndsAt: undefined,
      postMissionBehavior: 'return',
    });
  }, [unit, detachPatrolRoute, updateUnit]);

  if (!unit) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        className={`absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-6 z-[50] rounded-xl border border-gray-700/60 bg-gray-950/95 shadow-2xl backdrop-blur-md overflow-hidden flex flex-col max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] ${
          isSidebarOpen ? "left-3 md:left-96" : "left-3 md:left-4"
        } right-3 md:right-auto w-auto md:w-80`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-900/60">
          <div className="flex items-center gap-2">
            {serviceIcon(service)}
            <span className="text-xs font-bold text-white">Unit Info</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 text-gray-500 hover:text-gray-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-xl shrink-0">
              {config?.icon || '🚛'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-sm font-bold text-white truncate">{unit.name}</p>
                <span data-tutorial="rename-unit">
                  <InlineRename key={unit.id} value={unit.name} onSave={(name) => updateUnit(unit.id, { name })} maxLength={30} />
                </span>
              </div>
              <p className="text-[11px] text-gray-500 truncate">{config?.name || unit.type.replace(/_/g, ' ')}</p>
            </div>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25">Lv {unit.trainingLevel}</span>
            <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${meta.color} ${meta.bg}`}>
              {meta.label}
            </span>
          </div>

          {/* Staged batch (Addition 8): unit PROFILE card */}
          {profile && (
            <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2 space-y-1.5">
              <p className="text-xs text-gray-500 font-semibold">Unit Profile</p>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 capitalize">{profile.service}</span>
                <span className="text-[11px] text-gray-400 truncate">{profile.stationName}</span>
                <span className="text-[11px] text-gray-500 capitalize">· {profile.jurisdiction}</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/25">Lv {profile.level}</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/25" title={profile.xpToNext != null ? `${profile.xpToNext} XP to next rank` : 'Max rank'}>
                  {profile.rank.toUpperCase()}
                </span>
                {profile.readiness && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    {profile.readiness.label} · {profile.readiness.pct}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                Crew {profile.crewSize}{profile.crewCapacity ? ` / ${profile.crewCapacity}` : ''} · {profile.shiftClears} clear{profile.shiftClears === 1 ? '' : 's'} this shift
                {profile.patrolSummary ? ` · Patrol: ${profile.patrolSummary}` : ''}
              </p>
              {profile.certs.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {profile.certs.map((c) => (
                    <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/25 font-bold">{c.toUpperCase()} ✓</span>
                  ))}
                </div>
              )}
              {profile.academy && (
                <p className="text-[11px] text-purple-200">Academy: {profile.academy.course} — {profile.academy.remainingGameMin} game-min left</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
              <p className="text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Station</p>
              <p className="text-gray-300 font-medium truncate">{station?.name || 'Unassigned'}</p>
            </div>
            <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
              <p className="text-gray-500 flex items-center gap-1"><Gauge className="w-3 h-3" /> Speed</p>
              <p className="text-gray-300 font-medium">
                {getUnitCurrentSpeedMph(unit)} mph
              </p>
              <p className="text-[11px] text-gray-500">max {getUnitMaxSpeedMph(unit.speed || 13.9)} mph</p>
            </div>
            {unit.eta != null && unit.eta > 0 && (
              <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
                <p className="text-gray-500 flex items-center gap-1"><Navigation className="w-3 h-3" /> ETA</p>
                <p className="text-cyan-300 font-medium">{formatTimer(unit.eta)}</p>
              </div>
            )}
            {unit.routeDistanceKm != null && (
              <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
                <p className="text-gray-500">Route</p>
                <p className="text-gray-300 font-medium">{unit.routeDistanceKm.toFixed(1)} mi</p>
              </div>
            )}
          </div>

          {mission && (
            <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
              <p className="text-[11px] text-gray-500 flex items-center gap-1"><Radio className="w-3 h-3" /> Assigned Mission</p>
              <p className="text-xs font-bold text-white">{mission.name}</p>
              {mission.status === 'in_progress' && (
                <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${Math.min(100, mission.progress || 0)}%` }} />
                </div>
              )}
            </div>
          )}

          {dispatchTargetMission && !mission && (
            <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
              <p className="text-[11px] text-gray-500">Next Mission</p>
              <p className="text-xs text-gray-300 truncate">{dispatchTargetMission.name}</p>
            </div>
          )}

          <TrainingBlock unit={unit} player={player} />

          {/* Livery — cosmetic paint scheme for this unit */}
          <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-500 flex items-center gap-1"><Shield className="w-3 h-3" /> Livery</p>
            </div>
            <LiveryPicker
              service={getUnitServiceType(unit.type)}
              value={unit.liveryId}
              onChange={(liveryId) => setUnitLivery(unit.id, liveryId)}
            />
          </div>

          <CrewBlock station={station} unit={unit} onOpenEmployees={onOpenEmployees} />

          {(unit.status === 'available' || unit.status === 'patrolling') && station && !isTraining(unit) && unitCanPatrol(unit.type, helipad) && (
            <div className="space-y-2 rounded-md bg-gray-900/60 border border-gray-800/40 p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Patrol mode</span>
                <select
                  value={patrolMode}
                  onChange={(e) => {
                    const next = e.target.value as any;
                    setPatrolMode(next);
                    updateUnitPatrolDefaults(unit.id, {
                      patrolMode: next,
                      patrolAreaId: next === 'zone' ? (patrolArea ?? 'c') : null,
                    });
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 outline-none focus:border-blue-500"
                >
                  <option value="city-sweep">City sweep</option>
                  <option value="hotspot">Crime hotspot</option>
                  <option value="zone">Single zone</option>
                  <option value="station-beat">Station beat</option>
                </select>
              </div>
              {patrolMode === 'zone' && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Zone</span>
                  <select
                    value={patrolArea ?? 'c'}
                    onChange={(e) => {
                      setPatrolArea(e.target.value);
                      updateUnitPatrolDefaults(unit.id, { patrolAreaId: e.target.value });
                    }}
                    className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 outline-none focus:border-blue-500 max-w-[130px]"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={returnAfterMission}
                  onChange={(e) => {
                    setReturnAfterMission(e.target.checked);
                    updateUnit(unit.id, { postMissionBehavior: e.target.checked ? 'return' : 'patrol' });
                  }}
                  className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0"
                />
                <span className="text-gray-400">Return to station after mission</span>
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {dispatchable && dispatchTargetMission && (
              <button
                onClick={handleDispatch}
                disabled={routing}
                className="flex-1 min-w-[80px] px-2 py-1.5 rounded-md bg-dispatch-red/20 text-dispatch-red border border-dispatch-red/30 text-[11px] font-bold hover:bg-dispatch-red/30 disabled:opacity-40 flex items-center justify-center gap-1"
              >
                <Navigation className="w-3 h-3" /> DISPATCH
              </button>
            )}
            {unit.status === 'available' && station && !isTraining(unit) && unitCanPatrol(unit.type, helipad) && (
              <button
                data-tutorial="start-patrol"
                onClick={handleStartPatrol}
                disabled={routing}
                className="flex-1 min-w-[80px] px-2 py-1.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[11px] font-bold hover:bg-blue-500/20 disabled:opacity-40"
              >
                START PATROL
              </button>
            )}
            {unit.status === 'patrolling' && (
              <button
                onClick={handleStopPatrol}
                className="flex-1 min-w-[80px] px-2 py-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-bold hover:bg-amber-500/20"
              >
                END PATROL
              </button>
            )}
            {(unit.status === 'en_route' || unit.status === 'on_scene' || unit.status === 'patrolling') && station && (
              <button
                onClick={handleRecall}
                disabled={routing}
                className="flex-1 min-w-[80px] px-2 py-1.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700 text-[11px] font-bold hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center gap-1"
              >
                <Crosshair className="w-3 h-3" /> RECALL
              </button>
            )}
            {/* Staged batch: auto-follow toggle. Default off; following is
                explicit per unit. Manual pan/zoom breaks it (MapView). */}
            {unit.status !== 'available' && (
              <button
                onClick={() => setFollowedUnitId(followedUnitId === unit.id ? null : unit.id)}
                className={`flex-1 min-w-[80px] px-2 py-1.5 rounded-md border text-[11px] font-bold flex items-center justify-center gap-1 ${followedUnitId === unit.id ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
              >
                <Crosshair className="w-3 h-3" /> {followedUnitId === unit.id ? 'FOLLOWING ✓' : 'FOLLOW'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function TrainingBlock({ unit, player }: { unit: Unit; player: Player | null }) {
  const { addNotification } = useNotifications();
  if (unit.trainingLevel >= MAX_UNIT_TRAINING_LEVEL) return null;
  const training = isTraining(unit);
  const cost = unitTrainCost(unit.trainingLevel);
  const canAfford = !!player && player.credits >= cost;
  const minutes = Math.round((unitTrainDurationSec(unit.trainingLevel, player?.isPremium ?? false) / 60) * 10) / 10;

  async function skipTraining() {
    const remainingSec = trainingRemainingSec(unit);
    try {
      const res = await spendCoins({ kind: 'skip_training', remainingSec });
      useGameStore.getState().updatePlayer({ coins: res.coins });
      useGameStore.getState().updateUnit(unit.id, {
        trainingEndsAt: undefined,
        trainingLevel: Math.min(MAX_UNIT_TRAINING_LEVEL, unit.trainingLevel + 1),
      });
      addNotification({ type: 'success', title: 'Training Complete', message: `${unit.name} finished training to Level ${unit.trainingLevel + 1}`, icon: '⚡', duration: 3000 });
    } catch (e) {
      addNotification({ type: 'error', title: 'Could not skip', message: (e as Error)?.message ?? 'Not enough coins', icon: '⚠️', duration: 3000 });
    }
  }

  return (
    <div className="rounded-md bg-gray-900/60 border border-yellow-500/20 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500 flex items-center gap-1"><GraduationCap className="w-3 h-3 text-yellow-400" /> Training</p>
        {!training && <span className="text-[11px] text-yellow-400 font-semibold">Lv {unit.trainingLevel} → {unit.trainingLevel + 1}</span>}
      </div>
      {training ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400">Training to Lv {unit.trainingLevel + 1}…</p>
            <p className="text-[11px] text-yellow-300 font-mono font-bold">{formatTimer(trainingRemainingSec(unit))}</p>
          </div>
          <button
            onClick={() => void skipTraining()}
            className="w-full px-2 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold hover:bg-cyan-500/20"
          >
            ⚡ Finish now — {skipTrainingCost(trainingRemainingSec(unit))} 🪙
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">{cost.toLocaleString()} cr · ~{minutes}m</p>
          <button
            disabled={unit.status !== 'available' || !canAfford}
            onClick={() => {
              if (startUnitTraining(unit, player)) {
                addNotification({ type: 'success', title: 'Training Started', message: `${unit.name} is training to Level ${unit.trainingLevel + 1}`, icon: '🎓', duration: 3000 });
              } else {
                addNotification({ type: 'error', title: 'Cannot Train', message: !canAfford ? 'Insufficient credits' : 'Unit must be available at its station', icon: '⚠️', duration: 3000 });
              }
            }}
            className="shrink-0 px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 text-[11px] font-bold hover:bg-yellow-500/20 disabled:opacity-40"
          >
            TRAIN
          </button>
        </div>
      )}
    </div>
  );
}

const READINESS_CHIP: Record<string, { cls: string; pulse: boolean }> = {
  fresh: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', pulse: false },
  weary: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40', pulse: false },
  tired: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/40', pulse: false },
  exhausted: { cls: 'bg-red-500/20 text-red-400 border-red-500/50', pulse: true },
};

function CrewBlock({ station, unit, onOpenEmployees }: { station: Station | null | undefined; unit: Unit; onOpenEmployees?: () => void }) {
  const all = station?.employees || [];
  const crew = all.filter((e) => unit.crewIds?.includes(e.id));
  const config = UNIT_CONFIGS[unit.type];
  const max = config?.capacity ?? 0;
  const short = max > 0 ? Math.max(0, max - crew.length) : 0;
  // Shift Pressure off (v0.20.2): fatigue is inert — always show a fresh crew.
  const fatigueActive = (loadSettings().fatigueMode ?? 'full') !== 'off';
  const readiness = fatigueActive ? crewReadiness(crew) : crew.length > 0 ? { level: 'fresh' as const, label: 'Fresh', worstFatigue: 0, avgEffectiveness: 1 } : null;

  return (
    <div className="rounded-md bg-gray-900/60 border border-gray-800/40 p-2">
      <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-1">
        <Users className="w-3 h-3" /> Crew
        {readiness && (
          <span
            className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wide ${READINESS_CHIP[readiness.level].cls} ${READINESS_CHIP[readiness.level].pulse ? 'animate-pulse' : ''}`}
            title={readiness.level === 'exhausted' ? 'Exhausted crew — response and clear speed are reduced' : `Worst fatigue ${readiness.worstFatigue}%`}
          >
            {readiness.level === 'exhausted' && '⚠ '}{readiness.label} · {Math.round(readiness.avgEffectiveness * 100)}%
          </span>
        )}
      </p>
      {crew.length === 0 ? (
        <p className="text-[11px] text-gray-500">No crew assigned.</p>
      ) : (
        <div className="space-y-1.5">
          {crew.map((e) => {
            const fatigue = e.fatigue ?? 0;
            const morale = e.morale ?? 100;
            return (
              <div key={e.id} className="text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 truncate">{e.name} <span className="text-gray-500">• {e.role} Lv {e.level}</span></span>
                  <span className={`text-[11px] ${fatigue >= 85 ? 'text-red-400 font-semibold' : fatigue >= 60 ? 'text-orange-400' : 'text-gray-500'}`}>{fatigueActive ? fatigueLabel(fatigue) : ''}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden" title={`Fatigue ${fatigue}%`}>
                    <div
                      className={`h-full ${fatigue >= 85 ? 'bg-red-500' : fatigue >= 60 ? 'bg-orange-500' : 'bg-amber-500'}`}
                      style={{ width: `${fatigueActive ? fatigue : 0}%` }}
                    />
                  </div>
                  <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden" title={`Morale ${morale}%`}>
                    <div className="h-full bg-emerald-500" style={{ width: `${morale}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {readiness?.level === 'exhausted' && (
        <p className="text-[11px] text-red-400/90 mt-1.5">⚠ Exhausted crew — response time and clear speed are reduced. Rest them in Personnel Command.</p>
      )}
      <p className="text-[11px] text-gray-500 mt-1">{crew.length}{max ? ` / ${max}` : ''} {short > 0 ? `(${short} open seat${short === 1 ? '' : 's'})` : ''}</p>
      {onOpenEmployees && (
        <button
          onClick={onOpenEmployees}
          className="w-full text-[11px] py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 mt-1.5"
        >
          Manage Crew
        </button>
      )}
    </div>
  );
}
