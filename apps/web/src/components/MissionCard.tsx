// ============================================
// Dispatch HQ — Mission Card Component
// Multi-unit dispatch with requirement-aware unit picker
// ============================================

import { motion } from 'framer-motion';
import { Clock, Zap, Send, CheckCircle, RotateCcw, AlertTriangle, Handshake, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { skipChainStage } from '@/lib/missionChains';
import { fetchDrivingRoute, getUnitServiceType } from '@/utils/routing';
import { applyTravelTech, getMaxDispatchUnits } from '@/lib/techTree';
import { haversineKm } from '@/utils/roadPathfinding';
import { broadcastRadioSequence, wasRadioKeyDispatched, markRadioKeyDispatched } from '@/utils/radioEvents';
import { formatTimer } from '@/utils/timeFormat';
import { assignmentSequence } from '@/lib/radioDialogueEngine.lazy';
import { playDispatchTone, playFailure, playHover } from '@/utils/sound';
import { missionService } from '@/lib/rewards';
import { requiredServicesForMission, unitCommittedElsewhere, dispatchPlanParts } from '@/lib/dispatchLogic';
import type { Mission, Unit } from '@dispatch-hq/shared';
import { difficultyTierFor, TIER_META } from '@dispatch-hq/shared';
import { buildMissionCardDetail } from '@/lib/missionCardDetail';
import { useNotifications } from './NotificationCenter';
import { wsClient } from '@/lib/wsClient';

interface MissionCardProps {
  mission: Mission;
  index: number;
  /** Cross-service call (disaster wave, partner agency) — rendered with a Mutual Aid chip. */
  isMutualAid?: boolean;
}

export function MissionCard({ mission, index, isMutualAid = false }: MissionCardProps) {
  const { selectedMissionId, selectMission, units, updateUnit, updateMission } = useGameStore();
  const { addNotification } = useNotifications();
  const maxDispatchUnits = getMaxDispatchUnits();
  const [isRouting, setIsRouting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const isSelected = mission.id === selectedMissionId;
  const isUrgent = mission.timeRemaining < 120;
  const isExpired = mission.timeRemaining <= 0;
  const isDispatched = mission.status === 'en_route' || mission.status === 'in_progress';
  const isInProgress = mission.status === 'in_progress';

  const tierMeta = TIER_META[difficultyTierFor(mission.difficulty)];

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty <= 3) return 'text-green-400';
    if (difficulty <= 6) return 'text-amber-400';
    return 'text-red-400';
  };

  // Same readiness rule as the popup + board (v0.22.6): available, returning,
  // and patrolling units can all be re-routed to a call — a unit heading home
  // after its last job is still the right one to offer.
  const availableUnits = units.filter(u =>
    (u.status === 'available' || u.status === 'returning' || u.status === 'patrolling') &&
    u.position &&
    !(u.trainingEndsAt && u.trainingEndsAt > Date.now()),
  );

  const unitMatchesRequirement = (unit: Unit, reqType: string) => unit.type === reqType;

  const requirementSatisfaction = (reqType: string) => {
    const required = mission.requirements
      .filter(r => r.unitType === reqType)
      .reduce((sum, r) => sum + r.count, 0);
    const assigned = mission.assignedUnits.filter(id => {
      const u = units.find(unit => unit.id === id);
      return u && unitMatchesRequirement(u, reqType);
    }).length;
    const selected = [...selectedUnitIds].filter(id => {
      const u = availableUnits.find(unit => unit.id === id);
      return u && unitMatchesRequirement(u, reqType);
    }).length + assigned;
    return { required, assigned, selected };
  };

  const uniqueRequirementTypes = Array.from(new Set(mission.requirements.map(r => r.unitType)));

  const allRequirementsMet = uniqueRequirementTypes.every(t => {
    const { required, selected } = requirementSatisfaction(t);
    return selected >= required;
  });

  // Keep selection in sync if mission is already dispatched
  useEffect(() => {
    if (mission.assignedUnits.length > 0) {
      setSelectedUnitIds(new Set(mission.assignedUnits));
    }
  }, [mission.assignedUnits.join(',')]);

  const toggleUnit = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxDispatchUnits) {
        next.add(id);
      } else {
        addNotification({
          type: 'warning',
          title: 'Dispatch Limit',
          message: `Research Multi-Unit Dispatch to send more than ${maxDispatchUnits} unit${maxDispatchUnits === 1 ? '' : 's'} at once.`,
          duration: 3000,
        });
      }
      return next;
    });
  };

  const handleRecallUnit = (e: React.MouseEvent, unitId: string) => {
    e.stopPropagation();
    updateUnit(unitId, { status: 'available', missionId: undefined, eta: null, destination: null, waypoints: undefined, waypointIndex: undefined });
    updateMission(mission.id, {
      assignedUnits: mission.assignedUnits.filter(uid => uid !== unitId),
      status: mission.assignedUnits.length <= 1 ? 'active' : mission.status,
    });
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      next.delete(unitId);
      return next;
    });
  };

  const getDistance = (a?: {lat: number; lng: number} | null, b?: {lat: number; lng: number} | null) => {
    if (!a || !b) return 0;
    return haversineKm(a, b);
  };

  // Chain bypass (per-stage skip): remove this stage and spawn the next.
  // The skipped stage earns no reward and the chain loses its +25% bonus
  // for the remaining stages (skipChainStage marks the chain broken).
  // Undispatched stages only — skipping a call with units en route would
  // strand them on a mission that no longer exists.
  const handleSkipStage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      const st = useGameStore.getState();
      const result = await skipChainStage(
        mission,
        st.selectedCity,
        st.player?.level ?? 1,
        st.addMission,
        st.removeMission,
      );
      if (!result.skipped) return;
      if (result.next) {
        addNotification({
          type: 'dispatch',
          title: 'Stage Skipped',
          message: `${result.next.name} — the next stage is on the board. The chain's +25% bonus is forfeited for the remaining stages.`,
          icon: '🔗',
          duration: 5000,
        });
      } else {
        addNotification({
          type: 'info',
          title: 'Chain Ended',
          message: `You skipped the final stage of ${mission.name} — the chain is over.`,
          icon: '🔗',
          duration: 4000,
        });
      }
    } finally {
      setIsSkipping(false);
    }
  };

  const handleDispatch = async () => {
    if (selectedUnitIds.size === 0) return;
    const toDispatch = [...selectedUnitIds]
      .map(id => availableUnits.find(u => u.id === id))
      .filter(Boolean) as Unit[];
    if (toDispatch.length === 0) return;

    setIsRouting(true);
    try {
      const { updateMission: commitMission } = useGameStore.getState();
      const dispatchedIds: string[] = [];
      const routePromises = toDispatch.map(async (unit) => {
        if (!unit.position) return null;
        // v0.22.12 duplicate-dispatch guard: the unit may have been grabbed by
        // another call between the picker render and this click — consult
        // fresh state so it is never double-assigned.
        const stNow = useGameStore.getState();
        const live = stNow.units.find((x) => x.id === unit.id);
        if (unitCommittedElsewhere(live, mission.id, stNow.missions)) return null;
        const route = await fetchDrivingRoute(unit.position, mission.location, unit.speed || 13.9);
        if (route.waypoints.length < 2) return null;
        updateUnit(unit.id, {
          status: 'en_route',
          missionId: mission.id,
          eta: route.durationSec,
          etaTotal: route.durationSec,
          destination: mission.location,
          waypoints: route.waypoints,
          waypointIndex: 0,
          returnTimer: undefined,
          routeDistanceKm: route.distanceKm,
        });
        dispatchedIds.push(unit.id);
        return unit.id;
      });

      const results = await Promise.allSettled(routePromises);
      results.forEach((r) => {
        if (r.status === 'rejected') console.error('Routing failure', r.reason);
      });

      if (dispatchedIds.length > 0) {
        commitMission(mission.id, {
          status: 'en_route',
          assignedUnits: [...new Set([...mission.assignedUnits, ...dispatchedIds])],
        });
        playDispatchTone();
        for (const uid of dispatchedIds) {
          const u = availableUnits.find(x => x.id === uid);
          if (!u) continue;
          const key = `assign:${u.id}:${mission.id}`;
          if (wasRadioKeyDispatched(key)) continue;
          const seq = assignmentSequence(u, mission, availableUnits, [mission], useGameStore.getState().helipad?.name);
          broadcastRadioSequence(seq, key);
          markRadioKeyDispatched(key);
        }
      } else {
        playFailure();
      }
    } finally {
      setIsRouting(false);
      setSelectedUnitIds(new Set());
    }
  };

  const progressPercent = mission.progress || 0;

  // Staged batch (Addition 9): the collapsed-visible detail row — crime
  // type, severity, place, gang link, escalation, responding units — all
  // derived from this mission record (see lib/missionCardDetail).
  const detail = buildMissionCardDetail(mission);

  return (
    <motion.div
      key={mission.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => selectMission(isSelected ? null : mission.id)}
      onMouseEnter={playHover}
      // Keyboard operability (a11y): the card is a toggle — focusable, Enter /
      // Space activate it. The target guard stops nested controls (checkboxes,
      // the dispatch button) from double-firing; the global :focus-visible
      // rule supplies the ring.
      role="button"
      tabIndex={0}
      aria-expanded={isSelected}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMission(isSelected ? null : mission.id);
        }
      }}
      className={`
        p-3 rounded-xl cursor-pointer transition-all duration-200
        ${isSelected 
          ? 'bg-dispatch-red/20 border border-dispatch-red/50' 
          : 'bg-gray-800/60 border border-gray-700/30 hover:bg-gray-800/80 hover:border-gray-600/50'
        }
        ${isExpired ? 'opacity-50' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
          missionService(mission) === 'fire'
            ? 'bg-red-500/15 border-red-500/30'
            : missionService(mission) === 'ems'
              ? 'bg-emerald-500/15 border-emerald-500/30'
              : 'bg-blue-500/15 border-blue-500/30'
        }`}>
          <span className="text-lg leading-none">{mission.icon || '🔥'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm text-white truncate leading-tight">{mission.name}</h3>
          <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{mission.description}</p>
        </div>
      </div>

      {/* Dispatch plan — the services needed, visible before any unit is picked.
          Primary department first, cross-service requirements tinted so the
          crossover need reads at a glance (v0.22.13). */}
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-gray-500">Needs</span>
        {dispatchPlanParts(mission).map((p) => (
          <span
            key={p.label}
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
              p.crossover
                ? p.service === 'fire'
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : p.service === 'ems'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-gray-800/80 text-gray-300 border-gray-700/40'
            }`}
            title={p.crossover ? `Cross-service — answered by ${p.service.toUpperCase()} units` : `Answered by your ${p.service} department`}
          >
            {p.label}
          </span>
        ))}
      </div>

      {/* Status badge */}
      {isDispatched && (
        <div className={`mt-2 px-2 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-1 ${
          isInProgress 
            ? 'bg-dispatch-red/20 text-dispatch-red border border-dispatch-red/30'
            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
        }`}>
          {isInProgress ? '⚡ In Progress' : '🚗 En Route'}
        </div>
      )}

      {/* Progress bar */}
      {isInProgress && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-dispatch-red rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[11px] text-gray-500">Progress</span>
            <span className="text-[11px] text-gray-400 font-mono">{Math.round(progressPercent)}%</span>
          </div>
        </div>
      )}

      {/* Stats Row — wraps to a second line on narrow cards so chips never overflow. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 py-1.5 px-2 bg-gray-800/40 rounded-lg">
        {isMutualAid && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-blue-300" title="Belongs to another department — answering it earns a +25% mutual aid bonus">
            <Handshake className="w-2.5 h-2.5" /> Mutual Aid +25%
          </span>
        )}
        <div className="flex items-center gap-1 text-amber-400">
          <Zap className="w-3 h-3" />
          <span className="text-[11px] font-mono font-medium">{mission.creditsReward.toLocaleString()}</span>
        </div>

        <div className="w-px h-3 bg-gray-700" />

        <div className={`flex items-center gap-1 ${getDifficultyColor(mission.difficulty)}`}>
          <span className="text-[11px] font-medium">Lv.{mission.difficulty}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${tierMeta.chipClass}`}>
            {tierMeta.icon} {tierMeta.label}
          </span>
          {mission.chainId && mission.chainStage && (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-400">
              🔗 CHAIN {mission.chainStage}/{mission.chainTotal}{mission.chainSkipped ? ' · no bonus' : ''}
            </span>
          )}
        </div>

        <div className="w-px h-3 bg-gray-700" />

        <div className={`flex items-center gap-1 ml-auto ${isUrgent ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
          <Clock className="w-3 h-3" />
          <span className="text-[11px] font-mono">{formatTimer(mission.timeRemaining)}</span>
        </div>
      </div>

      {/* Staged batch (Addition 9): detail row — type, severity, place,
          gang link, escalation, responding units. Visible collapsed (not
          expanded-only) so the board reads at a glance; every chip comes
          from this mission's own record, and absent data shows no chip. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-300 border border-gray-700/40">
          {detail.categoryLabel}
        </span>
        {detail.priority && detail.priorityTone && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border capitalize ${detail.priorityTone}`}>
            {detail.priority} priority
          </span>
        )}
        {detail.poiLabel && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 border border-gray-700/40">
            📍 {detail.poiLabel}
          </span>
        )}
        {detail.gangName && detail.gangColor && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border" style={{ color: detail.gangColor, borderColor: `${detail.gangColor}55`, backgroundColor: `${detail.gangColor}14` }}>
            {detail.gangName}
          </span>
        )}
        {detail.escalated && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
            ⚠️ Escalated
          </span>
        )}
        {detail.respondingCount > 0 && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
            {detail.respondingCount} unit{detail.respondingCount === 1 ? '' : 's'} responding
          </span>
        )}
      </div>

      {/* Expanded details with unit picker */}
      {isSelected && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="mt-3 pt-3 border-t border-gray-700/50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* CPU Mutual Aid: the city is handling this call — no player dispatch. */}
          {mission.cpuHandled ? (
            <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-gray-800/60 px-2 py-2 rounded-lg mb-2">
              <span className="text-base">🏙️</span>
              The city is responding — a partner agency is handling this call automatically.
            </div>
          ) : (<>
          {/* Requirements summary */}
          <div className="mb-2">
            <p className="text-xs text-gray-400 mb-2">Requirements:</p>
            <div className="flex flex-wrap gap-2">
              {uniqueRequirementTypes.map(t => {
                const { required, selected } = requirementSatisfaction(t);
                const met = selected >= required;
                return (
                  <span key={t} className={`px-2 py-0.5 text-[11px] border rounded-full ${met ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-dispatch-red/20 text-dispatch-red border-dispatch-red/30'}`}>
                    {selected}/{required}× {t.replace('_', ' ')}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Unit picker */}
          {!isDispatched && !isExpired && availableUnits.length > 0 && (
            <div className="space-y-3 mb-3">
              {uniqueRequirementTypes.map(reqType => {
                const candidates = availableUnits.filter(u => unitMatchesRequirement(u, reqType));
                if (candidates.length === 0) return null;
                return (
                  <div key={reqType}>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">{reqType.replace('_', ' ')}</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {candidates.map(unit => {
                        const crossService = getUnitServiceType(unit.type) !== missionService(mission);
                        return (
                          <label
                            key={unit.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                              selectedUnitIds.has(unit.id) ? 'bg-dispatch-red/20 border border-dispatch-red/30' : 'bg-gray-800/50 hover:bg-gray-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUnitIds.has(unit.id)}
                              onChange={(e) => toggleUnit(e as unknown as React.MouseEvent, unit.id)}
                              className="accent-dispatch-red rounded"
                            />
                            <span className="text-gray-300 flex-1 truncate">{unit.name}</span>
                            {crossService && (
                              <span className={`px-1 rounded text-[11px] font-bold uppercase ${
                                getUnitServiceType(unit.type) === 'fire' ? 'bg-red-500/20 text-red-400'
                                : getUnitServiceType(unit.type) === 'ems' ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {getUnitServiceType(unit.type)}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-500">{getDistance(unit.position, mission.location).toFixed(1)} km</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Answer-service top-up (v0.22.10): units from the call's primary
                  + requirement services that aren't already listed above — a
                  traffic accident still shows its nearest engine, and a call
                  with no requirements still offers its nearest right-service
                  units instead of an empty picker. */}
              {(() => {
                const answerServices = new Set(requiredServicesForMission(mission));
                const extras = availableUnits
                  .filter(u => answerServices.has(getUnitServiceType(u.type)) && !uniqueRequirementTypes.includes(u.type))
                  .sort((a, b) => getDistance(a.position, mission.location) - getDistance(b.position, mission.location))
                  .slice(0, 4);
                if (extras.length === 0) return null;
                return (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                      Nearest {answerServices.size > 1 ? 'required-service' : 'ready'} units
                    </p>
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {extras.map(unit => {
                        const crossService = getUnitServiceType(unit.type) !== missionService(mission);
                        return (
                          <label
                            key={unit.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                              selectedUnitIds.has(unit.id) ? 'bg-dispatch-red/20 border border-dispatch-red/30' : 'bg-gray-800/50 hover:bg-gray-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUnitIds.has(unit.id)}
                              onChange={(e) => toggleUnit(e as unknown as React.MouseEvent, unit.id)}
                              className="accent-dispatch-red rounded"
                            />
                            <span className="text-gray-300 flex-1 truncate">{unit.name}</span>
                            {crossService && (
                              <span className={`px-1 rounded text-[11px] font-bold uppercase ${
                                getUnitServiceType(unit.type) === 'fire' ? 'bg-red-500/20 text-red-400'
                                : getUnitServiceType(unit.type) === 'ems' ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {getUnitServiceType(unit.type)}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-500">{getDistance(unit.position, mission.location).toFixed(1)} km</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {!isDispatched && !isExpired && availableUnits.length === 0 && (
            <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-2 rounded-lg mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              No available units — build or recall units first.
            </div>
          )}

          {/* Batch 3c: live mutual aid — ask online alliance members for help.
              Only when the socket is live and this mission hasn't already
              asked; the helper's CLEARED BY credit lands via the WS handler
              in App.tsx. No server money moves — the 60/40 split applies to
              the local save reward (see lib/mutualAidLive.ts). */}
          {!isDispatched && !isExpired && (useGameStore.getState().wsConnected) && !(mission as any).aidRequested && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const city = useGameStore.getState().selectedCity?.name ?? '';
                wsClient.sendMutualAidRequest(mission.id, mission.name, city);
                updateMission(mission.id, { aidRequested: true } as any);
                addNotification({ type: 'info', title: 'Aid Requested', message: `Alliance members notified about ${mission.name}`, icon: '🤝', duration: 3000 });
              }}
              className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 bg-blue-600/80 text-white hover:bg-blue-600 active:scale-[0.98]"
            >
              <Handshake className="w-3.5 h-3.5" /> Request Alliance Aid (60/40 split)
            </button>
          )}

          {/* Dispatch / recall action */}
          {!isDispatched && !isExpired && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDispatch(); }}
              disabled={selectedUnitIds.size === 0 || isRouting}
              className={`w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                selectedUnitIds.size > 0 && !isRouting
                  ? 'bg-dispatch-red text-white hover:bg-red-700 active:scale-[0.98]'
                  : 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-700/30'
              }`}
            >              <Send className="w-3.5 h-3.5" />
              {isRouting
                ? 'Routing…'
                : selectedUnitIds.size > 0
                  ? `Dispatch ${selectedUnitIds.size} Unit${selectedUnitIds.size > 1 ? 's' : ''}`
                  : 'Select units to dispatch'
              }
            </button>
          )}

          {/* Chain bypass: skip this stage (undispatched chain missions only).
              No reward for the skipped stage; the chain loses its +25% bonus. */}
          {!isDispatched && !isExpired && mission.chainId && mission.chainStage && (
            <button
              onClick={handleSkipStage}
              disabled={isSkipping}
              title="Skip this stage — no reward for it, and the chain loses its +25% bonus for the remaining stages."
              className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 bg-gray-800/70 text-gray-300 hover:bg-gray-800 border border-gray-700/50 active:scale-[0.98] disabled:opacity-50"
            >
              <SkipForward className="w-3.5 h-3.5" />
              {isSkipping ? 'Skipping…' : 'Skip stage'}
            </button>
          )}
          </>)}




          {!allRequirementsMet && !isDispatched && !isExpired && (
            <p className="text-[11px] text-amber-400 mt-2">
              Recommended: assign at least one unit per requirement for best response.
            </p>
          )}

          {isDispatched && mission.assignedUnits.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-gray-500 mb-1">Assigned units</p>
              {mission.assignedUnits.map(uid => {
                const unit = units.find(u => u.id === uid);
                if (!unit) return null;
                return (
                  <div key={uid} className="flex items-center gap-2 text-[11px] px-2 py-1 bg-gray-800/60 rounded-md">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      unit.status === 'on_scene' ? 'bg-dispatch-red' : 'bg-amber-400 animate-pulse'
                    }`} />
                    <span className="text-gray-300">{unit.name}</span>
                    <span className="ml-auto text-gray-500 capitalize">{unit.status.replace('_', ' ')}</span>
                    {unit.eta !== undefined && unit.eta !== null && unit.eta > 0 && unit.status === 'en_route' && (
                      <span className="text-amber-400 font-mono">ETA {formatTimer(unit.eta as number)}</span>
                    )}
                    {unit.status === 'en_route' && (
                      <button
                        onClick={(e) => handleRecallUnit(e, unit.id)}
                        className="p-0.5 hover:bg-gray-700 rounded transition-colors"
                        title="Recall unit"
                      >
                        <RotateCcw className="w-3 h-3 text-gray-500 hover:text-amber-400" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
