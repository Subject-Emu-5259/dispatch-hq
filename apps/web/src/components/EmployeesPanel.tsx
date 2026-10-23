// ============================================
// Dispatch HQ — Employees / Personnel Command Panel
// ============================================
// Full-screen panel for managing station rosters, hiring, training,
// and assigning crew to units across Police, Fire, and EMS.

import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Building2, Shield, Flame, Heart, GraduationCap, UserPlus, UserX, ChevronDown, ChevronUp, Briefcase, Dices } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from './NotificationCenter';
import { STATION_CONFIGS, UNIT_CONFIGS } from '@dispatch-hq/shared';
import type { Employee, Station, Unit, ServiceType } from '@dispatch-hq/shared';
import {
  serviceForStation,
  assignableEmployees,
  autoAssignCrew,
  hireCost,
  trainCost,
  xpToNextLevel,
  employeeCapacity,
  isStationStaff,
  rerollTraits,
} from '@/lib/employees';
import { fatigueLabel, moraleLabel } from '@/lib/personnel';

/** Cost to re-roll a crew member's traits (v0.21.0). */
const REROLL_COST = 300;

interface EmployeesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  focusStationId?: string | null;
  focusUnitId?: string | null;
}

const SERVICE_COLORS: Record<ServiceType, { bg: string; text: string; border: string; icon: ReactNode }> = {
  fire: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', icon: <Flame className="w-4 h-4 text-red-400" /> },
  police: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', icon: <Shield className="w-4 h-4 text-blue-400" /> },
  ems: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', icon: <Heart className="w-4 h-4 text-green-400" /> },
};

function EmployeeRow({
  employee,
  unitName,
  stationPerks,
  onAssign,
  onUnassign,
  onRest,
  onRecall,
  onTrain,
  canAffordTrain,
  onReroll,
  canAffordReroll,
}: {
  employee: Employee;
  unitName?: string;
  stationPerks?: string[];
  onAssign: () => void;
  onUnassign: () => void;
  onRest: () => void;
  onRecall: () => void;
  onTrain: () => void;
  canAffordTrain: boolean;
  onReroll: () => void;
  canAffordReroll: boolean;
}) {
  const cost = trainCost(employee, { perks: stationPerks ?? [] });
  const xpNeeded = xpToNextLevel(employee.level);
  const fatigue = employee.fatigue ?? 0;
  const morale = employee.morale ?? 100;
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/40 rounded-lg text-[11px]">
      <div className={`w-2 h-2 rounded-full ${employee.status === 'available' ? 'bg-emerald-400' : employee.status === 'assigned' ? 'bg-amber-400' : 'bg-gray-500'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-gray-200 font-medium truncate">{employee.name}</p>
        <p className="text-gray-500 truncate">{employee.role} • Lv.{employee.level} {employee.traits?.length ? `• ${employee.traits.join(', ')}` : ''}</p>
        {employee.assignedUnitId && unitName && (
          <p className="text-amber-400/80 truncate flex items-center gap-1 mt-0.5"><Briefcase className="w-3 h-3" /> {unitName}</p>
        )}
        <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-dispatch-red" style={{ width: `${Math.min(100, (employee.xp / xpNeeded) * 100)}%` }} />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-amber-400/90 w-8 shrink-0">{fatigueLabel(fatigue)}</span>
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden" title={`Fatigue ${fatigue}%`}>
              <div className="h-full bg-amber-500" style={{ width: `${fatigue}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-emerald-400/90 w-8 shrink-0">{moraleLabel(morale)}</span>
            <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden" title={`Morale ${morale}%`}>
              <div className="h-full bg-emerald-500" style={{ width: `${morale}%` }} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {isStationStaff(employee) ? (
          <span className="px-2 py-1 rounded bg-gray-800 text-gray-500 border border-gray-700 text-[10px] font-semibold whitespace-nowrap">📞 Station Staff</span>
        ) : employee.status === 'available' ? (
          <>
            <button onClick={onAssign} className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 text-[10px] font-bold">Assign</button>
            <button onClick={onRest} className="px-2 py-1 rounded bg-gray-700/60 text-gray-400 hover:bg-gray-600 text-[10px] font-semibold" title="Send off duty — fatigue recovers twice as fast">Rest</button>
          </>
        ) : employee.status === 'off_duty' ? (
          <button onClick={onRecall} className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] font-bold">Recall</button>
        ) : (
          <button onClick={onUnassign} className="px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 text-[10px] font-bold">Unassign</button>
        )}
        <button
          onClick={onTrain}
          disabled={!canAffordTrain}
          className={`px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
            canAffordTrain ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          <GraduationCap className="w-3 h-3" /> {cost.toLocaleString()}
        </button>
        <button
          onClick={onReroll}
          disabled={!canAffordReroll}
          title="Re-roll traits — retrain this crew member's personality"
          className={`px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 ${
            canAffordReroll ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          <Dices className="w-3 h-3" /> {REROLL_COST.toLocaleString()}
        </button>
      </div>
    </div>
  );
}

export function EmployeesPanel({ isOpen, onClose, focusStationId, focusUnitId }: EmployeesPanelProps) {
  const { stations, units, player, updateStation, updateUnit, updatePlayer } = useGameStore();
  const { addNotification } = useNotifications();
  const [expandedId, setExpandedId] = useState<string | null>(focusStationId || null);
  const [serviceFilter, setServiceFilter] = useState<ServiceType | 'all'>('all');

  const stationUnits = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const u of units) {
      if (!u.stationId) continue;
      const list = map.get(u.stationId) || [];
      list.push(u);
      map.set(u.stationId, list);
    }
    return map;
  }, [units]);

  const filteredStations = useMemo(() => {
    if (serviceFilter === 'all') return stations;
    return stations.filter((s) => serviceForStation(s) === serviceFilter);
  }, [stations, serviceFilter]);

  const handleHire = (station: Station) => {
    if (!player) return;
    const roster = station.employees || [];
    if (roster.length >= employeeCapacity(station)) {
      addNotification({ type: 'warning', title: 'Roster Full', message: 'Upgrade the station or dismiss employees first.', duration: 3000 });
      return;
    }
    const cost = hireCost(station);
    if (player.credits < cost) {
      addNotification({ type: 'warning', title: 'Insufficient Credits', message: `Hiring costs ${cost.toLocaleString()} credits.`, duration: 3000 });
      return;
    }
    import('@/lib/employees').then(({ generateEmployee }) => {
      const emp = generateEmployee(station);
      updateStation(station.id, { employees: [...roster, emp] });
      updatePlayer({ credits: player.credits - cost });
      addNotification({ type: 'success', title: 'Hired', message: `${emp.name} joins ${station.name}`, duration: 3000 });
    });
  };

  const handleReroll = (station: Station, employee: Employee) => {
    if (!player) return;
    if (player.credits < REROLL_COST) {
      addNotification({ type: 'warning', title: 'Insufficient Credits', message: `Re-rolling traits costs ${REROLL_COST.toLocaleString()} credits.`, duration: 3000 });
      return;
    }
    const updated = rerollTraits(employee);
    updateStation(station.id, {
      employees: (station.employees || []).map((e) => (e.id === employee.id ? updated : e)),
    });
    updatePlayer({ credits: player.credits - REROLL_COST });
    const traits = updated.traits ?? [];
    addNotification({ type: 'success', title: 'Traits Re-rolled', message: `${updated.name} now has ${traits.length > 0 ? traits.join(', ') : 'no defining traits'}.`, duration: 3000 });
  };

  const handleTrain = (station: Station, employee: Employee) => {
    if (!player) return;
    const cost = trainCost(employee, { perks: station.perks ?? [] });
    if (player.credits < cost) {
      addNotification({ type: 'warning', title: 'Insufficient Credits', message: `Training costs ${cost.toLocaleString()} credits.`, duration: 3000 });
      return;
    }
    const xpNeeded = xpToNextLevel(employee.level);
    let level = employee.level;
    let xp = employee.xp + xpNeeded;
    while (xp >= xpToNextLevel(level)) {
      xp -= xpToNextLevel(level);
      level += 1;
    }
    const updated: Employee = { ...employee, xp, level, morale: Math.min(100, (employee.morale ?? 100) + 10) };
    updateStation(station.id, {
      employees: (station.employees || []).map((e) => (e.id === employee.id ? updated : e)),
    });
    updatePlayer({ credits: player.credits - cost });
    // Training lifts morale — count it in the shift's morale events.
    const stNow = useGameStore.getState();
    stNow.recordShiftStats({ moraleBoosts: (stNow.shift.moraleBoosts ?? 0) + 1 });
    addNotification({ type: 'success', title: 'Training Complete', message: `${updated.name} is now level ${level} — morale +10.`, duration: 3000 });
  };

  const handleAssign = (station: Station, employee: Employee, focusUnitIdOverride?: string | null) => {
    if (isStationStaff(employee)) {
      addNotification({ type: 'warning', title: 'Station Staff', message: 'Dispatchers work the command floor and never ride in units.', duration: 3000 });
      return;
    }
    const unitList = stationUnits.get(station.id) || [];
    const targetUnit = focusUnitIdOverride
      ? unitList.find((u) => u.id === focusUnitIdOverride)
      : unitList.find((u) => {
          const cfg = UNIT_CONFIGS[u.type];
          return u.crewIds?.length ?? 0 < (cfg?.capacity ?? 2);
        });
    if (!targetUnit) {
      addNotification({ type: 'warning', title: 'No Unit Slot', message: 'All station units are fully crewed.', duration: 3000 });
      return;
    }
    const cfg = UNIT_CONFIGS[targetUnit.type];
    const max = cfg?.capacity ?? 2;
    if ((targetUnit.crewIds?.length || 0) >= max) {
      addNotification({ type: 'warning', title: 'Unit Full', message: `${targetUnit.name} already has a full crew.`, duration: 3000 });
      return;
    }
    const newCrew = [...(targetUnit.crewIds || []), employee.id];
    updateUnit(targetUnit.id, { crewIds: newCrew });
    updateStation(station.id, {
      employees: (station.employees || []).map((e) =>
        e.id === employee.id ? { ...e, assignedUnitId: targetUnit.id, status: 'assigned' as const } : e
      ),
    });
    addNotification({ type: 'success', title: 'Crew Assigned', message: `${employee.name} assigned to ${targetUnit.name}`, duration: 2500 });
  };

  const handleUnassign = (station: Station, employee: Employee) => {
    if (employee.assignedUnitId) {
      const u = units.find((unit) => unit.id === employee.assignedUnitId);
      if (u) updateUnit(u.id, { crewIds: (u.crewIds || []).filter((id) => id !== employee.id) });
    }
    updateStation(station.id, {
      employees: (station.employees || []).map((e) =>
        e.id === employee.id ? { ...e, assignedUnitId: null, status: 'available' as const } : e
      ),
    });
  };

  const handleRest = (station: Station, employee: Employee) => {
    updateStation(station.id, {
      employees: (station.employees || []).map((e) =>
        e.id === employee.id ? { ...e, status: 'off_duty' as const } : e
      ),
    });
    const stNow = useGameStore.getState();
    stNow.recordShiftStats({ restEvents: (stNow.shift.restEvents ?? 0) + 1 });
    addNotification({ type: 'info', title: 'Rest', message: `${employee.name} is off duty — recovering fatigue twice as fast.`, duration: 2500 });
  };

  const handleRecall = (station: Station, employee: Employee) => {
    updateStation(station.id, {
      employees: (station.employees || []).map((e) =>
        e.id === employee.id ? { ...e, status: 'available' as const } : e
      ),
    });
    addNotification({ type: 'info', title: 'Back on Duty', message: `${employee.name} is back on the duty roster.`, duration: 2500 });
  };

  const autoFill = (station: Station) => {
    const unitList = stationUnits.get(station.id) || [];
    let assigned = 0;
    for (const u of unitList) {
      const { crewIds, assigned: newlyAssigned } = autoAssignCrew(station, u);
      if (newlyAssigned.length) {
        updateUnit(u.id, { crewIds });
        updateStation(station.id, {
          employees: (station.employees || []).map((e) =>
            newlyAssigned.some((n) => n.id === e.id) ? { ...e, assignedUnitId: u.id, status: 'assigned' as const } : e
          ),
        });
        assigned += newlyAssigned.length;
      }
    }
    addNotification({ type: "info", title: assigned ? "Auto-Filled Crews" : "No Assignments Made", message: assigned ? (assigned + " employees assigned to units.") : "All units already crewed or no employees available.", duration: 3000 });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-12 left-0 bottom-0 w-full max-w-md z-[60] bg-gray-950 border-r border-gray-800 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-dispatch-cyan" />
                <h2 className="text-sm font-bold text-white">Personnel Command</h2>
                <span className="px-2 py-0.5 rounded-full bg-gray-800 text-[10px] text-gray-400 font-medium">{stations.reduce((sum, s) => sum + (s.employees?.length || 0), 0)}</span>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/50">
              {(['all', 'police', 'fire', 'ems'] as const).map((svc) => (
                <button
                  key={svc}
                  onClick={() => setServiceFilter(svc)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                    serviceFilter === svc
                      ? 'bg-dispatch-cyan/20 text-dispatch-cyan border-dispatch-cyan/40'
                      : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300'
                  }`}
                >
                  {svc === 'all' ? 'All' : svc.charAt(0).toUpperCase() + svc.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {filteredStations.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Building2 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No stations yet</p>
                  <p className="text-[11px] text-gray-600 mt-1 text-center px-6">Build stations to start hiring personnel.</p>
                </div>
              )}

              {filteredStations.map((station) => {
                const config = STATION_CONFIGS[station.type];
                const isExpanded = expandedId === station.id;
                const service = serviceForStation(station);
                const colors = SERVICE_COLORS[service];
                const roster = station.employees || [];
                const capacity = employeeCapacity(station);
                const unitList = stationUnits.get(station.id) || [];
                return (
                  <div key={station.id} className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
                    <div
                      className="p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : station.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-xl ${colors.bg} flex items-center justify-center shrink-0 border ${colors.border}`}>
                          <span className="text-2xl">{config?.icon || '🏢'}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-white truncate">{station.name}</p>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {roster.length}/{capacity} personnel • {unitList.length} units
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${roster.length >= capacity ? 'bg-amber-500' : 'bg-dispatch-cyan'}`} style={{ width: `${Math.min(100, (roster.length / capacity) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-gray-800/50 overflow-hidden"
                        >
                          <div className="p-3 space-y-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleHire(station)}
                                disabled={player?.credits ? player.credits < hireCost(station) : true}
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-bold"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> Hire ({hireCost(station).toLocaleString()})
                              </button>
                              <button
                                onClick={() => autoFill(station)}
                                className="flex-1 px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 text-[11px] font-bold"
                              >
                                Auto-Fill Crews
                              </button>
                            </div>

                            {roster.length === 0 ? (
                              <p className="text-[11px] text-gray-600">No personnel assigned. Hire or build the station to receive a starter roster.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {roster.map((emp) => (
                                  <EmployeeRow
                                    key={emp.id}
                                    employee={emp}
                                    stationPerks={station.perks ?? []}
                                    unitName={units.find((u) => u.id === emp.assignedUnitId)?.name}
                                    onAssign={() => handleAssign(station, emp, focusUnitId)}
                                    onUnassign={() => handleUnassign(station, emp)}
                                    onRest={() => handleRest(station, emp)}
                                    onRecall={() => handleRecall(station, emp)}
                                    onTrain={() => handleTrain(station, emp)}
                                    canAffordTrain={(player?.credits || 0) >= trainCost(emp, { perks: station.perks ?? [] })}
                                    onReroll={() => handleReroll(station, emp)}
                                    canAffordReroll={(player?.credits || 0) >= REROLL_COST}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}