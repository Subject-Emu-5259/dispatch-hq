// ============================================
// Dispatch HQ — Stations Command Panel
// ============================================
// Full-screen station management overlay opened from the Stations nav icon.
// Shows every station, its assigned units, capacity, and buy/upgrade actions.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Plus, ChevronDown, ChevronUp, MapPin, Shield, Truck, Crown } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from './NotificationCenter';
import { autoAssignCrew, assignableEmployees } from '@/lib/employees';
import { StationDetailModal } from './StationDetailModal';
import { STATION_CONFIGS, STATION_LEVELS, UNIT_CONFIGS, perkAdjustedRadius } from '@dispatch-hq/shared';
import { getUnitCostMultiplier, getEliteStatMultiplier, getStationBuildCostMultiplier } from '@/lib/techTree';
import type { Station } from '@dispatch-hq/shared';

interface StationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBuild?: () => void;
}

const STATION_UNITS: Record<string, string[]> = {
  fire_station: ['engine', 'ladder', 'rescue', 'battalion_chief'],
  police_station: ['patrol_car', 'swat_van', 'k9_unit', 'police_suv', 'trooper_car', 'deputy_car'],
  ems_station: ['ambulance', 'paramedic_unit', 'ems_supervisor', 'fire_ambulance'],
};

export function StationsPanel({ isOpen, onClose, onOpenBuild }: StationsPanelProps) {
  const {
    stations, units, player, addUnit, updateStation, updatePlayer,
    updateUnit, selectedService,
  } = useGameStore();
  const { addNotification } = useNotifications();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingStation, setViewingStation] = useState<Station | null>(null);

  const handleBuyUnit = (station: Station, unitTypeKey: string) => {
    if (!player) return;
    const config = UNIT_CONFIGS[unitTypeKey];
    if (!config) return;

    const cost = Math.round(config.cost * getUnitCostMultiplier());
    if ((station.unitCount || 0) >= station.capacity) {
      addNotification({ type: 'warning', title: 'Station Full', message: `${station.name} is at capacity. Upgrade to add more units.`, duration: 3000 });
      return;
    }
    if (player.credits < cost) {
      addNotification({ type: 'warning', title: 'Insufficient Credits', message: `${config.name} costs ${cost.toLocaleString()} credits.`, duration: 3000 });
      return;
    }

    const newUnit = {
      id: `unit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      ownerId: player.id,
      stationId: station.id,
      type: unitTypeKey as any,
      // Staged batch: jurisdiction follows the unit type (legacy types = city).
      jurisdiction: unitTypeKey === 'trooper_car' ? 'state' as const : unitTypeKey === 'deputy_car' ? 'county' as const : 'city' as const,
      name: `${config.name} ${Math.floor(Math.random() * 99)}`,
      status: 'available' as const,
      position: { ...station.position },
      destination: null,
      heading: 0,
      speed: config.speed * getEliteStatMultiplier(),
      eta: null,
      missionId: null,
      trainingLevel: 1,
      createdAt: new Date().toISOString(),
    };

    const { crewIds, assigned } = autoAssignCrew(station, newUnit as any);
    const unitWithCrew = { ...newUnit, crewIds };
    const updatedEmployees = (station.employees || []).map((e) =>
      assigned.find((a) => a.id === e.id) ? { ...e, assignedUnitId: newUnit.id, status: 'assigned' as const } : e
    );
    addUnit(unitWithCrew as any);
    updateStation(station.id, { unitCount: (station.unitCount || 0) + 1, employees: updatedEmployees });
    updatePlayer({ credits: player.credits - cost });
    setExpandedId(null);

    addNotification({
      type: 'success',
      title: `${config.name} Purchased`,
      message: `${newUnit.name} assigned to ${station.name}`,
      icon: config.icon,
      duration: 3000,
    });
  };

  const handleUpgrade = (station: Station) => {
    if (!player) return;
    const nextLevel = STATION_LEVELS.find((l) => l.level === station.level + 1);
    if (!nextLevel) return;
    const cost = Math.round(nextLevel.cost * getStationBuildCostMultiplier());
    if (player.credits < cost) {
      addNotification({ type: 'warning', title: 'Insufficient Credits', message: `Upgrade costs ${cost.toLocaleString()} credits.`, duration: 3000 });
      return;
    }

    updatePlayer({ credits: player.credits - cost });
    updateStation(station.id, {
      level: nextLevel.level,
      capacity: nextLevel.capacity,
      coverageRadius: perkAdjustedRadius(nextLevel.coverageRadius, station),
    });

    addNotification({
      type: 'success',
      title: `${station.name} Upgraded`,
      message: `Now Level ${nextLevel.level} — capacity ${nextLevel.capacity} units`,
      icon: '⬆️',
      duration: 4000,
    });
  };

  const handleRecallAll = (station: Station) => {
    let count = 0;
    units
      .filter((u) => u.stationId === station.id && (u.status === 'en_route' || u.status === 'patrolling'))
      .forEach((u) => {
        updateUnit(u.id, { status: 'available', missionId: null, waypoints: undefined, waypointIndex: undefined, destination: null, eta: null, patrolRouteId: null, patrolWaypointIndex: undefined });
        count += 1;
      });
    if (count > 0) {
      addNotification({ type: 'info', title: 'Units Recalled', message: `${count} unit${count === 1 ? '' : 's'} recalled to ${station.name}`, duration: 3000 });
    } else {
      addNotification({ type: 'info', title: 'No Units Out', message: `All ${station.name} units are already at the station.`, duration: 3000 });
    }
  };

  const stationUnits = (stationId: string) => units.filter((u) => u.stationId === stationId);

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
                <Building2 className="w-5 h-5 text-dispatch-red" />
                <h2 className="text-sm font-bold text-white">Stations Command</h2>
                <span className="px-2 py-0.5 rounded-full bg-gray-800 text-[11px] text-gray-400 font-medium">
                  {stations.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onOpenBuild?.()}
                  className="px-2 py-1.5 bg-dispatch-red hover:bg-red-700 text-white text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Build
                </button>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {stations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Building2 className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No stations yet</p>
                  <p className="text-[11px] text-gray-600 mt-1 text-center px-6">
                    Build your first {selectedService === 'police' ? 'police' : selectedService === 'ems' ? 'EMS' : 'fire'} station to start responding.
                  </p>
                  <button
                    data-tutorial="build-station"
                    onClick={() => onOpenBuild?.()}
                    className="mt-4 px-4 py-2 bg-dispatch-red text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Build Station
                  </button>
                </div>
              ) : (
                stations.map((station) => {
                  const config = STATION_CONFIGS[station.type];
                  const isExpanded = expandedId === station.id;
                  const isFull = (station.unitCount || 0) >= station.capacity;
                  const unitList = stationUnits(station.id);
                  const nextLevel = STATION_LEVELS.find((l) => l.level === station.level + 1);
                  const upgradeCost = nextLevel ? Math.round(nextLevel.cost * getStationBuildCostMultiplier()) : 0;
                  const canAffordUpgrade = nextLevel && (player?.credits || 0) >= upgradeCost;

                  return (
                    <div
                      key={station.id}
                      className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden"
                    >
                      <div
                        className="p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : station.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-xl bg-dispatch-red/15 flex items-center justify-center shrink-0">
                            <span className="text-2xl">{config?.icon || '🚒'}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-white truncate">{station.name}</p>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {config?.name} • Level {station.level} • {station.unitCount || 0}/{station.capacity} units
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isFull ? 'bg-amber-500' : 'bg-dispatch-red'}`}
                                  style={{ width: `${Math.min(100, ((station.unitCount || 0) / station.capacity) * 100)}%` }}
                                />
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
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => setViewingStation(station)}
                                  className="flex items-center justify-center gap-1.5 px-2 py-2 bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg text-[11px] font-medium transition-colors"
                                >
                                  <MapPin className="w-3.5 h-3.5" /> Details
                                </button>
                                <button
                                  onClick={() => handleRecallAll(station)}
                                  className="flex items-center justify-center gap-1.5 px-2 py-2 bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 rounded-lg text-[11px] font-medium transition-colors"
                                >
                                  <Shield className="w-3.5 h-3.5" /> Recall
                                </button>
                              </div>

                              {unitList.length > 0 && (
                                <div className="space-y-1.5">
                                  <p className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold">Assigned Units</p>
                                  {unitList.map((u) => (
                                    <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/40 rounded-lg text-[11px]">
                                      <span className="text-base">{UNIT_CONFIGS[u.type]?.icon || '🚒'}</span>
                                      <span className="text-gray-300 truncate flex-1">{u.name}</span>
                                      <span className={`capitalize text-[11px] px-1.5 py-0.5 rounded ${
                                        u.status === 'available' ? 'bg-green-500/15 text-green-400' :
                                        u.status === 'en_route' ? 'bg-dispatch-red/15 text-dispatch-red' :
                                        u.status === 'on_scene' ? 'bg-amber-500/15 text-amber-400' :
                                        'bg-blue-500/15 text-blue-400'
                                      }`}>{u.status.replace('_', ' ')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <p className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold">Acquire Unit</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {(STATION_UNITS[station.type] || []).map((unitTypeKey) => {
                                    const unitConfig = UNIT_CONFIGS[unitTypeKey];
                                    if (!unitConfig) return null;
                                    const cost = Math.round(unitConfig.cost * getUnitCostMultiplier());
                                    const canAfford = (player?.credits || 0) >= cost && !isFull;
                                    return (
                                      <button
                                        key={unitTypeKey}
                                        onClick={() => handleBuyUnit(station, unitTypeKey)}
                                        disabled={!canAfford}
                                        className={`flex flex-col items-start p-2 rounded-lg border text-left transition-colors ${
                                          canAfford
                                            ? 'bg-gray-800/40 border-gray-700/50 hover:border-dispatch-red/40 hover:bg-gray-800/70'
                                            : 'bg-gray-800/20 border-gray-800/30 opacity-50 cursor-not-allowed'
                                        }`}
                                      >
                                        <span className="text-[11px] font-medium text-gray-200">{unitConfig.icon} {unitConfig.name}</span>
                                        <span className="text-[11px] text-amber-400 font-mono mt-0.5">💰{cost.toLocaleString()}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {isFull && (
                                  <div className="flex items-center gap-1.5 text-amber-400 text-[11px]">
                                    <Crown className="w-3 h-3" /> Station at capacity — upgrade to add more units.
                                  </div>
                                )}
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold">Station Crew</p>
                                <p className="text-[11px] text-gray-500">{station.employees?.length || 0} personnel • {assignableEmployees(station).length} available</p>
                                <button
                                  onClick={() => setViewingStation(station)}
                                  className="w-full text-[11px] font-medium text-dispatch-blue hover:text-blue-300 border border-dispatch-blue/30 bg-dispatch-blue/10 rounded-lg px-2 py-1.5 transition-colors">
                                  Manage Crew
                                </button>
                              </div>

                              {nextLevel ? (
                                <button
                                  onClick={() => handleUpgrade(station)}
                                  disabled={!canAffordUpgrade}
                                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-[11px] font-medium transition-colors ${
                                    canAffordUpgrade
                                      ? 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300'
                                      : 'bg-gray-800/30 border border-gray-800/30 text-gray-600 cursor-not-allowed'
                                  }`}
                                >
                                  <span>Upgrade to Level {nextLevel.level} (capacity {nextLevel.capacity})</span>
                                  <span className="font-mono">💰{upgradeCost.toLocaleString()}</span>
                                </button>
                              ) : (
                                <div className="text-center text-[11px] text-gray-600 py-1">Station fully upgraded</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>

          {viewingStation && (
            <StationDetailModal station={viewingStation} units={stationUnits(viewingStation.id)} onClose={() => setViewingStation(null)} />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
