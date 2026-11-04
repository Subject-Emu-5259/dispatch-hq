// ============================================
// Dispatch HQ — Unit Panel (real-time fleet cards)
// ============================================
// Shows live unit cards grouped by status with ETA countdown, route
// progress, assigned mission, speed and recall. Subscribes to the store
// so the 1Hz ETA tick + 10Hz position tick keep it live automatically.

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, Radio, RotateCcw, MapPin, ArrowRight, GraduationCap } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { UNIT_CONFIGS } from '@dispatch-hq/shared';
import type { Unit, UnitStatus } from '@dispatch-hq/shared';
import { isTraining, trainingRemainingSec } from '@/lib/training';
import { veterancyRankFor, veterancyXpToNext, ACADEMY_COURSES, enrollAcademy, academyRemainingGameMin } from '@/lib/unitsStaff';
import { crewReadiness } from '@/lib/personnel';
import { loadSettings } from '@/utils/settings';
import { formatTimer } from '@/utils/timeFormat';
import { getUnitServiceType } from '@/utils/routing';
import { getUnitCurrentSpeedMph } from '@/lib/techTree';
import { LiveryPicker } from './LiveryPicker';
import { InlineRename } from './InlineRename';
import { UnitGlanceStrip } from './UnitGlanceStrip';

const STATUS_META: Record<UnitStatus, { label: string; color: string; dot: string }> = {
  available: { label: 'Available', color: 'text-green-400', dot: 'bg-green-400' },
  dispatched: { label: 'Dispatched', color: 'text-amber-400', dot: 'bg-amber-400' },
  en_route: { label: 'En Route', color: 'text-cyan-400', dot: 'bg-cyan-400 animate-pulse' },
  on_scene: { label: 'On Scene', color: 'text-red-400', dot: 'bg-red-400' },
  returning: { label: 'Returning', color: 'text-gray-400', dot: 'bg-gray-400' },
  patrolling: { label: 'Patrolling', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
};

export function UnitCard({ unit, onClick }: { unit: Unit; onClick?: () => void }) {
  const { missions, stations, updateUnit, updateMission, selectMission, setUnitLivery, gameMinutes } = useGameStore();
  const config = UNIT_CONFIGS[unit.type];
  const meta = STATUS_META[unit.status];
  const assignedMission = unit.missionId ? missions.find((m) => m.id === unit.missionId) : null;
  // Staged batch (Addition 8): the glance strip's inputs come from the same
  // tracked data the profile builder reads — station join, crew readiness
  // (fatigue-off shows no readiness chip, never a fake one).
  const station = stations.find((s) => s.id === unit.stationId) ?? null;
  const crew = (station?.employees ?? []).filter((e) => unit.crewIds?.includes(e.id));
  const fatigueMode = loadSettings().fatigueMode ?? 'full';
  const readiness = crew.length > 0 && fatigueMode !== 'off'
    ? (() => { const r = crewReadiness(crew); return r ? { label: r.label, pct: Math.round(r.avgEffectiveness * 100) } : null; })()
    : null;

  // Route progress for the en_route ETA bar (0..1).
  const etaTotal = unit.etaTotal ?? unit.eta ?? 0;
  const eta = unit.eta ?? 0;
  const progress = etaTotal > 0 ? Math.min(1, 1 - eta / etaTotal) : 0;

  const handleRecall = () => {
    updateUnit(unit.id, {
      status: 'available',
      missionId: undefined,
      eta: null,
      destination: null,
      waypoints: undefined,
      waypointIndex: undefined,
      etaTotal: undefined,
    });
    if (assignedMission) {
      updateMission(assignedMission.id, {
        assignedUnits: assignedMission.assignedUnits.filter((uid) => uid !== unit.id),
        status: assignedMission.assignedUnits.length <= 1 ? 'active' : assignedMission.status,
      });
    }
  };

  const handleLocate = () => {
    if (unit.missionId) selectMission(unit.missionId);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className={`rounded-lg p-3 border transition-colors cursor-pointer
        ${unit.status === 'available' ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40'
          : unit.status === 'en_route' ? 'bg-cyan-500/5 border-cyan-500/25 hover:border-cyan-400/50'
          : unit.status === 'on_scene' ? 'bg-red-500/5 border-red-500/25 hover:border-red-400/50'
          : 'bg-gray-800/40 border-gray-700/30'}`}
      onClick={() => { onClick?.(); handleLocate(); }}
    >
      {/* Row 1 — identity + status only. The old header packed the name +
          three badges on one non-wrapping row and overflowed the narrow
          sidebar card; status/service/readiness now live in the wrapping
          glance strip below (Addition 8 size fix). */}
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <span className="text-xl leading-none">{config?.icon || '🚛'}</span>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-900 ${meta.dot}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-white truncate">{unit.name}</p>
            <InlineRename
              value={unit.name}
              onSave={(name) => updateUnit(unit.id, { name })}
              maxLength={30}
              buttonClassName="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
            />
          </div>
        </div>
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${meta.color} ${
          unit.status === 'available' ? 'bg-green-500/15'
            : unit.status === 'en_route' ? 'bg-cyan-500/15'
            : unit.status === 'on_scene' ? 'bg-red-500/15'
            : 'bg-gray-700/40'}`}>
          {meta.label.toUpperCase()}
        </span>
      </div>

      {/* Row 2 — at-a-glance strip: service, station, level, rank, readiness, speed */}
      <UnitGlanceStrip
        service={getUnitServiceType(unit.type)}
        serviceLabel={config?.name || unit.type}
        stationName={station?.name ?? 'Unassigned'}
        level={unit.trainingLevel}
        rank={veterancyRankFor(unit.veterancyXp)}
        xpToNext={veterancyXpToNext(unit.veterancyXp)}
        readiness={readiness}
        speedMph={getUnitCurrentSpeedMph(unit)}
      />

      {/* Training — unit is off-duty at its station */}
      {isTraining(unit) && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-yellow-300">
          <GraduationCap className="w-3 h-3 shrink-0" />
          <span className="truncate">Training to Lv {unit.trainingLevel + 1} — {formatTimer(trainingRemainingSec(unit))}</span>
        </div>
      )}

      {/* Batch 3a academy — certs held, course in progress, free enrollment */}
      {(unit.certs?.length ? true : false) || unit.academy ? (
        <div className="mt-1.5 text-[11px] text-gray-400 flex flex-wrap items-center gap-1">
          <GraduationCap className="w-3 h-3 shrink-0 text-purple-300" />
          {(unit.certs ?? []).map((c) => (
            <span key={c} className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/25 font-bold">{c.toUpperCase()} ✓</span>
          ))}
          {unit.academy && (
            <span className="text-purple-200">Academy: {unit.academy.course} — {academyRemainingGameMin(unit, gameMinutes)} game-min left</span>
          )}
        </div>
      ) : null}
      {unit.status === 'available' && !isTraining(unit) && !unit.academy && (
        <div className="mt-1.5 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {ACADEMY_COURSES.filter((c) => !(unit.certs ?? []).includes(c.id)).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                const res = enrollAcademy(unit, c.id, gameMinutes);
                if (res) updateUnit(unit.id, res);
              }}
              title={`${c.label} — ${c.durationGameMin} game-min · ${c.tierLabel} tier · free, no pay-skip`}
              className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 text-[11px] font-bold"
            >
              🎓 {c.label}
            </button>
          ))}
        </div>
      )}

      {/* En route — live ETA + progress bar */}
      {unit.status === 'en_route' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500 flex items-center gap-1">
              <Radio className="w-2.5 h-2.5" /> ETA
            </span>
            <span className="text-cyan-300 font-mono font-bold">{formatTimer(eta)}</span>
          </div>
          <div className="h-1.5 bg-gray-700/70 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-cyan-400"
              animate={{ width: `${Math.round(progress * 100)}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* On scene — assigned mission progress */}
      {unit.status === 'on_scene' && assignedMission && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500">On scene</span>
            <span className="text-red-300 font-mono font-bold">{Math.round(assignedMission.progress || 0)}%</span>
          </div>
          <div className="h-1.5 bg-gray-700/70 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-red-500"
              animate={{ width: `${assignedMission.progress || 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* Assigned mission line */}
      {assignedMission && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{assignedMission.name}</span>
          <ArrowRight className="w-2.5 h-2.5 shrink-0 ml-auto opacity-60" />
        </div>
      )}

      {/* Recall button while en route */}
      {unit.status === 'en_route' && (
        <button
          onClick={(e) => { e.stopPropagation(); handleRecall(); }}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 py-1 rounded-md
                     bg-gray-800/60 hover:bg-amber-500/15 border border-gray-700/40 hover:border-amber-500/40
                     text-[11px] text-gray-400 hover:text-amber-400 transition-colors"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Recall to station
        </button>
      )}

      {/* Livery picker — cosmetic paint scheme (stopPropagation so the card stays unselected) */}
      <div
        className="mt-1.5 flex items-center justify-between gap-2 px-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] text-gray-500 uppercase tracking-wider">Livery</span>
        <LiveryPicker
          service={getUnitServiceType(unit.type)}
          value={unit.liveryId}
          onChange={(liveryId) => setUnitLivery(unit.id, liveryId)}
          compact
        />
      </div>
    </motion.div>
  );
}

export function UnitPanel({ onUnitClick }: { onUnitClick?: (unit: Unit) => void }) {
  const { units } = useGameStore();

  const groups = useMemo(() => {
    const byStatus: Record<UnitStatus, Unit[]> = {
      available: [], dispatched: [], en_route: [], on_scene: [], returning: [], patrolling: [],
    };
    units.forEach((u) => byStatus[u.status]?.push(u));
    return byStatus;
  }, [units]);

  const counts = {
    available: groups.available.length,
    enRoute: groups.en_route.length,
    onScene: groups.on_scene.length,
    busy: groups.en_route.length + groups.on_scene.length + groups.dispatched.length + groups.returning.length,
    total: units.length,
  };

  if (units.length === 0) {
    return (
      <div className="text-center py-5 text-gray-500">
        <div className="mx-auto mb-2 opacity-40"><Truck className="w-6 h-6" /></div>
        <p className="text-xs font-medium text-gray-400">No units yet</p>
        <p className="text-[11px] text-gray-700 mt-0.5">Build a station to receive your first units</p>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 space-y-2">
      {/* Fleet summary */}
      <div className="grid grid-cols-4 gap-1.5">
        <SummaryTile value={counts.total} label="Total" tone="text-white" />
        <SummaryTile value={counts.available} label="Ready" tone="text-green-400" />
        <SummaryTile value={counts.enRoute} label="En Route" tone="text-cyan-400" />
        <SummaryTile value={counts.onScene} label="On Scene" tone="text-red-400" />
      </div>

      <UnitGroup title="Available" units={groups.available} accent="text-green-400" onUnitClick={onUnitClick} />
      <UnitGroup title="En Route" units={groups.en_route} accent="text-cyan-400" onUnitClick={onUnitClick} />
      <UnitGroup title="On Scene" units={groups.on_scene} accent="text-red-400" onUnitClick={onUnitClick} />
      {groups.dispatched.length > 0 && (
        <UnitGroup title="Dispatched" units={groups.dispatched} accent="text-amber-400" onUnitClick={onUnitClick} />
      )}
      {groups.returning.length > 0 && (
        <UnitGroup title="Returning" units={groups.returning} accent="text-gray-400" onUnitClick={onUnitClick} />
      )}
    </div>
  );
}

function SummaryTile({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-md bg-gray-800/40 border border-gray-700/30 px-1.5 py-1.5 text-center">
      <p className={`text-sm font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function UnitGroup({
  title, units, accent, onUnitClick,
}: { title: string; units: Unit[]; accent: string; onUnitClick?: (unit: Unit) => void }) {
  if (units.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${accent}`}>{title}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500 font-mono">{units.length}</span>
        <div className="flex-1 h-px bg-gray-800/60" />
      </div>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {units.map((u) => <UnitCard key={u.id} unit={u} onClick={() => onUnitClick?.(u)} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}