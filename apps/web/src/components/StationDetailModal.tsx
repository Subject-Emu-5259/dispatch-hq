// ============================================
// Dispatch HQ — Station Detail Modal
// ============================================

import { useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { employeeCapacity, hireCost, trainCost, xpToNextLevel, generateEmployee, isStationStaff } from '@/lib/employees';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Users, TrendingUp, MapPin, Shield, Flame, Heart, UserPlus, GraduationCap, UserCheck, Award } from 'lucide-react';
import type { Station, Unit, Employee, EmployeeStatus } from '@dispatch-hq/shared';
import {
  STATION_CONFIGS, STATION_LEVELS, UNIT_CONFIGS, STATION_THEMES, stationThemeFor,
  availablePerkChoices, perkById, perkAdjustedRadius,
} from '@dispatch-hq/shared';
import { fatigueLabel, moraleLabel } from '@/lib/personnel';
import { InlineRename } from './InlineRename';

interface StationDetailModalProps {
  station: Station;
  units: Unit[];
  onClose: () => void;
  onSelectUnit?: (unitId: string) => void;
}

function serviceIcon(type?: string) {
  if (!type) return <Shield className="w-4 h-4 text-blue-400" />;
  if (type === 'fire_station') return <Flame className="w-4 h-4 text-red-400" />;
  if (type === 'ems_station') return <Heart className="w-4 h-4 text-green-400" />;
  return <Shield className="w-4 h-4 text-blue-400" />;
}

function statusBadge(status: string) {
  const color =
    status === 'available' ? 'bg-green-500/20 text-green-400' :
    status === 'en_route' ? 'bg-cyan-500/20 text-cyan-400' :
    status === 'on_scene' ? 'bg-red-500/20 text-red-400' :
    status === 'returning' ? 'bg-amber-500/20 text-amber-400' :
    status === 'patrolling' ? 'bg-purple-500/20 text-purple-400' :
    'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${color}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export function StationDetailModal({ station, units, onClose, onSelectUnit }: StationDetailModalProps) {
  const { setStationTheme, stations, updateStation } = useGameStore();
  // Live station from the store — the incoming prop may be a snapshot, so
  // theme changes reflect immediately instead of on next open.
  const liveStation = stations.find((s) => s.id === station.id) ?? station;
  const config = STATION_CONFIGS[liveStation.type] || STATION_CONFIGS.fire_station;
  const assignedUnits = useMemo(() => units.filter(u => u.stationId === liveStation.id), [units, liveStation.id]);
  const nextLevel = STATION_LEVELS.find(l => l.level === (liveStation.level || 1) + 1);
  const theme = stationThemeFor(liveStation.themeId);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-dispatch-red/15 flex items-center justify-center">
                <span className="text-xl">{config.icon}</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-bold text-white">{liveStation.name}</h2>
                  <InlineRename
                    value={liveStation.name}
                    onSave={(name) => updateStation(liveStation.id, { name })}
                    maxLength={50}
                  />
                </div>
                <p className="text-[10px] text-gray-500">{config.name} • Level {liveStation.level || 1}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-white">{assignedUnits.length}</p>
                <p className="text-[9px] text-gray-500 uppercase">Units</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-white">{liveStation.capacity}</p>
                <p className="text-[9px] text-gray-500 uppercase">Capacity</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
                <p className="text-lg font-bold text-white">{Math.round((liveStation.coverageRadius || 5))}km</p>
                <p className="text-[9px] text-gray-500 uppercase">Radius</p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/30 rounded-lg p-2.5">
              <MapPin className="w-3.5 h-3.5 text-dispatch-red shrink-0 mt-0.5" />
              <span>
                {liveStation.position.lat.toFixed(4)}, {liveStation.position.lng.toFixed(4)}
              </span>
            </div>

            {/* Theme — cosmetic identity preset */}
            <div>
              <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-1.5">
                <Building2 className="w-3 h-3" /> Theme — {theme.name}
              </p>
              <div className="flex items-center gap-2">
                {STATION_THEMES.map((t) => {
                  const active = stationThemeFor(liveStation.themeId).id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setStationTheme(liveStation.id, t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                        active
                          ? 'border-white bg-gray-700/60 text-white'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:text-gray-200'
                      }`}
                      style={active ? { boxShadow: `0 0 10px ${t.markerColor}55` } : undefined}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: t.markerColor }}
                      />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Units */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-xs font-bold text-white uppercase">Assigned Units</h3>
              </div>
              {assignedUnits.length === 0 ? (
                <p className="text-[11px] text-gray-600">No units assigned to this station.</p>
              ) : (
                <div className="space-y-1.5">
                  {assignedUnits.map(u => {
                    const uc = UNIT_CONFIGS[u.type];
                    return (
                      <button
                        key={u.id}
                        onClick={() => onSelectUnit?.(u.id)}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 transition-colors text-left"
                      >
                        <span className="text-base">{uc?.icon || '🚛'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{u.name}</p>
                          <p className="text-[10px] text-gray-500">{uc?.name || u.type}</p>
                        </div>
                        {statusBadge(u.status)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Employees */}
            <div>
              <EmployeeRoster station={station} />
            </div>

            {/* Upgrade */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
                <h3 className="text-xs font-bold text-white uppercase">Next Upgrade</h3>
              </div>
              {nextLevel ? (
                <div className="p-2.5 rounded-lg bg-gray-800/30 border border-dispatch-red/20">
                  <p className="text-xs text-white">Level {nextLevel.level}</p>
                  <p className="text-[10px] text-gray-500">
                    Capacity {liveStation.capacity} → {nextLevel.capacity} • Coverage {Math.round(perkAdjustedRadius(nextLevel.coverageRadius, liveStation))}km
                    {hasRadiusPerk(liveStation) ? ' (with Response Radius)' : ''}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-gray-600">Station is at maximum level.</p>
              )}
            </div>

            {/* Specializations (v0.20.1) */}
            <StationPerksSection station={liveStation} />
          </div>

          <div className="p-4 border-t border-gray-800">
            <button
              onClick={onClose}
              className="w-full py-2 bg-dispatch-red/20 hover:bg-dispatch-red/30 text-dispatch-cyan font-semibold rounded-xl transition-colors text-sm"
            >
              Close Station Details
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface EmployeeRosterProps {
  station: Station;
}

function statusBadgeSmall(status: EmployeeStatus) {
  if (status === 'available') return <span className="px-1.5 py-0.5 rounded text-[9px] bg-green-500/15 text-green-400">Available</span>;
  if (status === 'assigned') return <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-400">Unit</span>;
  if (status === 'training') return <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/15 text-amber-400">Training</span>;
  if (status === 'off_duty') return <span className="px-1.5 py-0.5 rounded text-[9px] bg-gray-700 text-gray-400">Off</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/15 text-red-400">Injured</span>;
}

function hasRadiusPerk(station: Station): boolean {
  return (station.perks ?? []).some((id) => perkById(id)?.kind === 'radius');
}

function StationPerksSection({ station }: { station: Station }) {
  const { updateStation } = useGameStore();
  const choices = availablePerkChoices(station);
  const owned = (station.perks ?? []).map(perkById).filter((p): p is NonNullable<typeof p> => Boolean(p));

  const pick = (perkId: string) => {
    const perk = perkById(perkId);
    if (!perk) return;
    updateStation(station.id, {
      perks: [...(station.perks ?? []), perkId],
      coverageRadius:
        perk.kind === 'radius'
          ? Math.round((station.coverageRadius || 5) * (1 + perk.value))
          : station.coverageRadius,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-3.5 h-3.5 text-gray-400" />
        <h3 className="text-xs font-bold text-white uppercase">Specializations</h3>
        <span className="text-[9px] text-gray-500">{owned.length}/3 chosen</span>
      </div>
      {choices.length > 0 && (
        <div className="mb-2 space-y-1.5">
          <p className="text-[10px] text-amber-400/90">New specialization unlocked — choose one:</p>
          {choices.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              className="w-full text-left flex items-start gap-2 p-2 rounded-lg bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/40 hover:border-dispatch-red/40 transition-colors"
            >
              <span className="text-base">{p.icon}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white">{p.name}</p>
                <p className="text-[10px] text-gray-500">{p.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {owned.length === 0 ? (
        <p className="text-[11px] text-gray-600">No specializations yet — upgrade to level 2 to unlock the first slot.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {owned.map((p) => (
            <span key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800/50 border border-gray-700/40 text-[10px] text-gray-300">
              <span>{p.icon}</span> {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeRoster({ station }: EmployeeRosterProps) {
  const { updateStation, updateUnit, units, player, updatePlayer } = useGameStore();
  const employees = useMemo(() => station.employees || [], [station.employees]);
  const unitMap = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const assignedIds = useMemo(() => new Set(employees.filter((e) => e.assignedUnitId).map((e) => e.assignedUnitId!)), [employees]);
  const stationUnits = useMemo(() => units.filter((u) => u.stationId === station.id), [units, station.id]);

  const canHire = (player?.credits || 0) >= hireCost(station) && employees.length < employeeCapacity(station);

  const handleHire = () => {
    if (!player || !canHire) return;
    const emp = generateEmployee(station);
    updateStation(station.id, { employees: [...employees, emp] });
    updatePlayer({ credits: player.credits - hireCost(station) });
  };

  const handleTrain = (emp: Employee) => {
    if (!player || emp.status === 'training') return;
    const cost = trainCost(emp, { perks: station.perks ?? [] });
    if ((player.credits || 0) < cost) return;
    if (emp.status === 'assigned' && emp.assignedUnitId) {
      updateUnit(emp.assignedUnitId, {
        crewIds: (unitMap[emp.assignedUnitId]?.crewIds || []).filter((id) => id !== emp.id),
      });
    }
    // Training rests the crew and lifts morale (+10) — count it in the shift.
    updateStation(station.id, {
      employees: employees.map((e) =>
        e.id === emp.id
          ? { ...e, status: 'training', xp: e.xp + 300, assignedUnitId: null, morale: Math.min(100, (e.morale ?? 100) + 10) }
          : e
      ),
    });
    updatePlayer({ credits: player.credits - cost });
    const stNow = useGameStore.getState();
    stNow.recordShiftStats({ moraleBoosts: (stNow.shift.moraleBoosts ?? 0) + 1 });
  };

  const handleAssign = (emp: Employee, unitId: string) => {
    if (!unitId || isStationStaff(emp)) return;
    const unit = unitMap[unitId];
    if (!unit) return;
    const config = UNIT_CONFIGS[unit.type];
    const max = config?.capacity ?? 4;
    const current = (unit.crewIds || []).length;
    if (current >= max) return;
    const existingUnitId = emp.assignedUnitId;
    if (existingUnitId) {
      updateUnit(existingUnitId, { crewIds: (unitMap[existingUnitId]?.crewIds || []).filter((id) => id !== emp.id) });
    }
    updateUnit(unitId, { crewIds: [...(unit.crewIds || []), emp.id] });
    updateStation(station.id, {
      employees: employees.map((e) => (e.id === emp.id ? { ...e, status: 'assigned' as EmployeeStatus, assignedUnitId: unitId } : e)),
    });
  };

  const handleUnassign = (emp: Employee) => {
    if (!emp.assignedUnitId) return;
    updateUnit(emp.assignedUnitId, { crewIds: (unitMap[emp.assignedUnitId]?.crewIds || []).filter((id) => id !== emp.id) });
    updateStation(station.id, {
      employees: employees.map((e) => (e.id === emp.id ? { ...e, status: 'available' as EmployeeStatus, assignedUnitId: null } : e)),
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-xs font-bold text-white uppercase">Station Personnel</h3>
        </div>
        <span className="text-[10px] text-gray-500">{employees.length}/{employeeCapacity(station)}</span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
        {employees.length === 0 && <p className="text-[11px] text-gray-600">No employees on roster.</p>}
        {employees.map((emp) => (
          <div key={emp.id} className="p-2 rounded-lg bg-gray-800/30 border border-gray-700/20 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-gray-300 truncate font-medium">{emp.name}</p>
                <p className="text-[9px] text-gray-500 truncate">{emp.role} • Lv {emp.level} • XP {emp.xp}/{xpToNextLevel(emp.level)}</p>
                <p className="text-[9px] mt-0.5 text-gray-600">
                  <span className="text-amber-400/80">{fatigueLabel(emp.fatigue ?? 0)} {emp.fatigue ?? 0}%</span>
                  {' · '}
                  <span className="text-emerald-400/80">{moraleLabel(emp.morale ?? 100)} {emp.morale ?? 100}%</span>
                </p>
              </div>
              {statusBadgeSmall(emp.status)}
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              {isStationStaff(emp) ? (
                <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700 text-[10px] font-semibold whitespace-nowrap">📞 Station Staff</span>
              ) : emp.status !== 'assigned' && emp.status !== 'training' && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) handleAssign(emp, e.target.value); e.target.value = ''; }}
                  className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none"
                >
                  <option value="">Assign to unit…</option>
                  {stationUnits
                    .filter((u) => (u.crewIds || []).length < (UNIT_CONFIGS[u.type]?.capacity ?? 4))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              )}
              {emp.status === 'assigned' && (
                <button onClick={() => handleUnassign(emp)} className="px-1.5 py-0.5 rounded bg-gray-700 text-[10px] text-gray-300 hover:bg-gray-600">
                  Unassign
                </button>
              )}
              {emp.status !== 'training' && (
                <button
                  onClick={() => handleTrain(emp)}
                  disabled={(player?.credits || 0) < trainCost(emp, { perks: station.perks ?? [] })}
                  className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] hover:bg-amber-500/25 disabled:opacity-40 flex items-center gap-1"
                >
                  <GraduationCap className="w-3 h-3" /> Train
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleHire}
        disabled={!canHire}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dispatch-blue/30 bg-dispatch-blue/10 text-dispatch-blue text-[11px] font-medium hover:bg-dispatch-blue/20 disabled:opacity-40"
      >
        <UserPlus className="w-3.5 h-3.5" /> Hire ({hireCost(station).toLocaleString()} cr)
      </button>
    </div>
  );
}

