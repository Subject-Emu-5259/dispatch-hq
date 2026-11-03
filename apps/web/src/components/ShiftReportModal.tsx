// ============================================
// Dispatch HQ — End of Shift Report
// ============================================
// Session summary of the current dispatch shift: missions run, credits/xp earned,
// level-ups, and traffic duties handled. Opened from the pause screen.

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, CheckCircle2, XCircle, Banknote, Zap, TrendingUp,
  ShieldCheck, Clock, Siren, Route, RefreshCw, Flame, Copy, Flag,
  Users, BatteryLow, Trophy, Share2, Landmark, HeartPulse, Stethoscope, Plane, Building2,
} from 'lucide-react';
import { loadSettings } from '@/utils/settings';
import { useGameStore } from '@/stores/gameStore';
import { patrolZonesForCity } from '@/lib/patrol/patrolZones';
import { patientOutcomesForShift } from '@/lib/hospital';
import { formatTimer } from '@/utils/timeFormat';
import { rankForLevel } from '@dispatch-hq/shared';
import { buildShiftSummary, TIER_LABELS } from '@/lib/shiftSummary';
import { shiftCoverage, shiftKeyFor } from '@/lib/unitsStaff';
import { fetchSeasonalLeaderboard } from '@/lib/apiClient';
import { SEASONAL_EVENTS, seasonalTimeLeft } from '@/lib/seasonal';
import {
  buildShareCardData, renderShareCard, loadCardLogo, shareCardPng,
  CARD_WIDTH, CARD_HEIGHT,
} from '@/lib/shareCard';
import { useNotifications } from './NotificationCenter';
import { playClick } from '../utils/sound';

interface ShiftReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function fmtElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${totalSec % 60}s`;
}

export function ShiftReportModal({ isOpen, onClose }: ShiftReportModalProps) {
  const shift = useGameStore((s) => s.shift);
  const { addNotification } = useNotifications();
  const player = useGameStore((s) => s.player);
  const units = useGameStore((s) => s.units);
  const stations = useGameStore((s) => s.stations);
  const gameMinutes = useGameStore((s) => s.gameMinutes);
  const patients = useGameStore((s) => s.patients);
  const career = useGameStore((s) => s.career);
  const selectedService = useGameStore((s) => s.selectedService);
  const mapBounds = useGameStore((s) => s.mapBounds);
  const selectedCity = useGameStore((s) => s.selectedCity);
  const [showDebrief, setShowDebrief] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharedAsImage, setSharedAsImage] = useState<'clipboard' | 'download' | null>(null);
  // Best-effort total standing in the live contest (fetched when the debrief opens).
  const [contestTotal, setContestTotal] = useState<{ rank: number | null; calls: number } | null>(null);

  // Pull the player's total contest standing so the debrief shows live progress
  // beyond this shift's tally (fire-and-forget; the row renders without it).
  useEffect(() => {
    if (!isOpen || (shift.seasonalClears ?? 0) <= 0 || !shift.seasonalEventId) {
      setContestTotal(null);
      return;
    }
    let live = true;
    setContestTotal(null);
    fetchSeasonalLeaderboard(shift.seasonalEventId)
      .then((res) => {
        if (live && res.me) setContestTotal({ rank: res.me.rank, calls: res.me.callsCleared });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isOpen, shift.seasonalClears, shift.seasonalEventId]);

  const shiftMs = Math.max(0, Date.now() - (shift.startedAt || Date.now()));

  // Hospital recovery (v0.22.10): patient milestones that happened this shift.
  const patientOutcomes = patientOutcomesForShift(patients, shift.startedAt ?? 0);

  // Per-neighborhood heat: zone id → display name (bounds-aligned grid).
  const zoneNames = useMemo(() => {
    const m = new Map<string, string>();
    if (mapBounds) patrolZonesForCity({ bounds: mapBounds, boundary: selectedCity?.boundary ?? null }).forEach((z) => m.set(z.id, z.name));
    return m;
  }, [mapBounds, selectedCity]);

  // Sort by call volume first, then patrol coverage, so the hot neighborhoods lead.
  const zoneRows = useMemo(() => {
    const zs = shift.zoneStats || {};
    return Object.entries(zs)
      .filter(([, v]) => v.calls > 0 || v.patrolKm > 0.05)
      .sort((a, b) => b[1].calls - a[1].calls || b[1].patrolKm - a[1].patrolKm)
      .map(([id, v]) => ({ id, name: zoneNames.get(id) ?? id, calls: v.calls, patrolKm: v.patrolKm }));
  }, [shift.zoneStats, zoneNames]);
  const totalZoneCalls = zoneRows.reduce((sum, r) => sum + r.calls, 0);

  const crewHours = (shift.crewHoursRidden ?? 0);
  const crewHoursLabel = `${Math.floor(crewHours)}h ${Math.round((crewHours % 1) * 60)}m`;
  const stats = [
    { label: 'Shift Duration', value: fmtElapsed(shiftMs), icon: Clock, color: 'text-dispatch-cyan', bg: 'bg-dispatch-cyan/10 border-dispatch-cyan/20' },
    { label: 'Missions Completed', value: String(shift.missionsCompleted), icon: CheckCircle2, color: 'text-dispatch-green', bg: 'bg-dispatch-green/10 border-dispatch-green/20' },
    { label: 'Missions Failed', value: String(shift.missionsFailed), icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'City-Handled Calls', value: String(shift.cpuHandledCalls ?? 0), icon: Landmark, color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
    { label: 'Traffic Duties', value: String(shift.dutiesHandled), icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    ...(patientOutcomes.transported > 0 ? [
      { label: 'Patients Transported', value: String(patientOutcomes.transported), icon: HeartPulse, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
      {
        label: 'Patients Recovered',
        value: `${patientOutcomes.recovered}/${patientOutcomes.recovered + patientOutcomes.released}`
          + (patientOutcomes.recoveryRate != null ? ` · ${Math.round(patientOutcomes.recoveryRate * 100)}%` : ''),
        icon: Stethoscope, color: 'text-dispatch-green', bg: 'bg-dispatch-green/10 border-dispatch-green/20',
      },
      // Airlift tally (v0.22.14): how transported patients arrived this shift.
      ...(patientOutcomes.airlifted + patientOutcomes.roadTransported > 0 ? [
        {
          label: 'Airlifted vs Road',
          value: `✈️ ${patientOutcomes.airlifted} · 🚑 ${patientOutcomes.roadTransported}`,
          icon: Plane, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20',
        },
      ] : []),
      ...(patientOutcomes.diverted > 0 ? [
        {
          label: 'Patients Diverted',
          value: String(patientOutcomes.diverted),
          icon: Landmark, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20',
        },
      ] : []),
    ] : []),
    ...((shift.wardExpansions ?? 0) > 0 ? [
      {
        label: 'Ward Expansions',
        value: `${shift.wardExpansions} upgrade${shift.wardExpansions === 1 ? '' : 's'} · +${shift.wardBedsAdded ?? 0} beds · $${(shift.wardCreditsSpent ?? 0).toLocaleString()}`,
        icon: Building2, color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20',
      },
    ] : []),
    { label: 'Patrol Coverage', value: `${(shift.patrolDistanceKm || 0).toFixed(1)} km`, icon: Route, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Patrol Shifts', value: String(shift.patrolShifts || 0), icon: RefreshCw, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    ...(stations.length > 0 ? [{ label: 'Shift Coverage', value: `${stations.filter((st) => shiftCoverage(st, gameMinutes) === 'covered').length}/${stations.length} covered · ${shiftKeyFor(gameMinutes)} shift`, icon: Users, color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' }] : []),
    ...(crewHours > 0 ? [{ label: 'Crew Hours Ridden', value: crewHoursLabel, icon: Users, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' }] : []),
    { label: 'Credits Earned', value: `$${shift.creditsEarned.toLocaleString()}`, icon: Banknote, color: 'text-yellow-300', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'XP Earned', value: String(shift.xpEarned.toLocaleString()), icon: Zap, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: 'Level-Ups', value: String(shift.levelUps), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ];

  const completionRate = shift.missionsCompleted + shift.missionsFailed > 0
    ? Math.round((shift.missionsCompleted / (shift.missionsCompleted + shift.missionsFailed)) * 100)
    : 0;

  // Layout data for the 1080×1350 share card (v0.22.0 Task 3) — built here where
  // every store selector lives, so the canvas painter stays a pure consumer.
  const shareData = useMemo(() => {
    const ev = SEASONAL_EVENTS.find((e) => e.id === shift.seasonalEventId);
    const rank = rankForLevel(player?.level ?? 1, selectedService ?? undefined);
    return buildShareCardData({
      username: player?.username ?? null,
      rankIcon: rank.icon,
      rankTitle: rank.title,
      level: player?.level ?? 1,
      serviceLabel: (selectedService ?? 'police').toUpperCase(),
      shiftDurationLabel: fmtElapsed(shiftMs),
      summary: buildShiftSummary({ shift, units, career, stations, patients, gameMinutes }),
      creditsEarned: shift.creditsEarned,
      xpEarned: shift.xpEarned,
      zoneRows,
      contest: (shift.seasonalClears ?? 0) > 0
        ? {
            icon: ev?.icon ?? '🎆',
            name: ev?.name ?? 'Holiday Event',
            clears: shift.seasonalClears ?? 0,
            totalCalls: contestTotal?.calls ?? null,
            rank: contestTotal?.rank ?? null,
            timeLeft: ev ? seasonalTimeLeft(ev) : null,
          }
        : null,
    });
  }, [shift, units, career, stations, player, selectedService, shiftMs, zoneRows, contestTotal]);

  const handleShareImage = async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      const logo = await loadCardLogo('/logo.png?v=13');
      renderShareCard(canvas, shareData, logo);
      const outcome = await shareCardPng(canvas, `dispatch-hq-shift-${Date.now()}.png`);
      setSharedAsImage(outcome);
      setTimeout(() => setSharedAsImage(null), 2400);
    } catch {
      // Batch 1 polish: a failed share used to look like a dead button — the
      // button simply stayed idle. Surface it as a toast instead.
      addNotification({
        type: 'error',
        title: 'Share failed',
        message: "Couldn't create the image — try again.",
        icon: '⚠️',
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-br from-dispatch-red/20 via-gray-900 to-gray-900 px-6 pt-6 pb-5 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-dispatch-red/20 border border-dispatch-red/30 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-dispatch-red" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white tracking-wide">SHIFT REPORT</h2>
                  <p className="text-[11px] text-gray-400">
                    {player?.username ? `${player.username} — ` : ''}{rankForLevel(player?.level ?? 1, selectedService ?? undefined).icon} {rankForLevel(player?.level ?? 1, selectedService ?? undefined).title} · Lv {player?.level ?? 1}
                  </p>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="p-5 grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${s.bg}`}
                >
                  <s.icon className={`w-5 h-5 shrink-0 ${s.color}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 truncate">{s.label}</p>
                    <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  </div>
                </div>
              ))}

              {/* Completion rate bar */}
              <div className="col-span-2 p-3 rounded-xl bg-gray-800/40 border border-gray-700/30">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="text-gray-400">Shift Clearance Rate</span>
                  <span className="text-dispatch-green font-semibold">{completionRate}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-dispatch-green to-dispatch-cyan rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionRate}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>

            {/* Seasonal contest progress (v0.21.2) */}
            {(shift.seasonalClears ?? 0) > 0 && (() => {
              const ev = SEASONAL_EVENTS.find((e) => e.id === shift.seasonalEventId);
              const timeLeft = ev ? seasonalTimeLeft(ev) : null;
              return (
                <div className="px-5 pb-5 pt-0">
                  <div className="rounded-xl bg-dispatch-red/5 border border-dispatch-red/20 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-dispatch-red flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5" /> Seasonal Contest
                      </p>
                      <span className="text-[11px] text-gray-400">
                        {ev ? `${ev.icon} ${ev.name}` : 'Holiday Event'}
                        {timeLeft && (
                          <span className="ml-1.5 font-semibold text-amber-300/90">⏳ {timeLeft}</span>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300">
                      <span className="font-black text-white text-sm">{shift.seasonalClears}</span>
                      {' '}call{shift.seasonalClears === 1 ? '' : 's'} cleared this shift toward the contest
                      {(shift.cpuHandledCalls ?? 0) > 0 && (
                        <span className="text-gray-400">
                          {' '}— {shift.cpuHandledCalls} by the city
                        </span>
                      )}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-[11px] text-gray-500">Full standings: Leaderboard → Seasonal tab.</p>
                      {contestTotal && (
                        <p className="text-[11px] font-semibold text-dispatch-red">
                          {contestTotal.rank ? `#${contestTotal.rank} · ` : ''}{contestTotal.calls} total
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Per-neighborhood heat breakdown */}
            {zoneRows.length > 0 && (
              <div className="px-5 pb-5 pt-0">
                <div className="rounded-xl bg-gray-800/40 border border-gray-700/30 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-400" /> Neighborhood Heat
                    </p>
                    <span className="text-[11px] text-gray-500">{totalZoneCalls} calls this shift</span>
                  </div>
                  <div className="space-y-1.5">
                    {zoneRows.map((row) => {
                      const pct = totalZoneCalls > 0 ? Math.round((row.calls / totalZoneCalls) * 100) : 0;
                      return (
                        <div key={row.id} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-[11px] text-gray-300" title={row.name}>{row.name}</span>
                          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-red-600 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="w-5 shrink-0 text-right text-[11px] font-bold text-orange-300">{row.calls}</span>
                          <span className="w-14 shrink-0 text-right text-[11px] text-gray-500" title="Patrol coverage">{row.patrolKm.toFixed(1)} km</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 space-y-2">
              <button
                onClick={() => { playClick(); setShowDebrief(true); }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-dispatch-cyan/20 border border-dispatch-cyan/30
                           text-white text-sm font-semibold hover:bg-dispatch-cyan/30 transition-colors"
              >
                <Flag className="w-4 h-4 text-dispatch-cyan" />
                End Shift — Debrief
              </button>
              <button
                onClick={() => { playClick(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-dispatch-red/20 border border-dispatch-red/30
                           text-white text-sm font-semibold hover:bg-dispatch-red/30 transition-colors"
              >
                <Siren className="w-4 h-4 text-dispatch-red" />
                Back to Dispatch
              </button>
            </div>
          </motion.div>

          {/* End-of-shift debrief overlay */}
          <DebriefOverlay
            open={showDebrief}
            onClose={() => setShowDebrief(false)}
            summary={buildShiftSummary({ shift, units, career, stations, patients, gameMinutes })}
            fatigueActive={(loadSettings().fatigueMode ?? 'full') !== 'off'}
            rankLabel={`${rankForLevel(player?.level ?? 1, selectedService ?? undefined).icon} ${rankForLevel(player?.level ?? 1, selectedService ?? undefined).title}`}
            copied={copied}
            onCopy={() => {
              const s = buildShiftSummary({ shift, units, career, stations, patients, gameMinutes });
              navigator.clipboard?.writeText(s.copyText).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }).catch(() => {});
            }}
            sharedAsImage={sharedAsImage}
            onShareImage={handleShareImage}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DebriefOverlay({ open, onClose, summary, fatigueActive, rankLabel, copied, onCopy, sharedAsImage, onShareImage }: {
  open: boolean;
  onClose: () => void;
  summary: ReturnType<typeof buildShiftSummary>;
  fatigueActive: boolean;
  rankLabel: string;
  copied: boolean;
  onCopy: () => void;
  sharedAsImage: 'clipboard' | 'download' | null;
  onShareImage: () => void;
}) {
  const tierRows = (Object.keys(TIER_LABELS) as Array<keyof typeof TIER_LABELS>).filter((k) => summary.tierMix[k] > 0);
  const maxTier = Math.max(1, ...tierRows.map((k) => summary.tierMix[k]));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.94, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
          >
            <div className="relative bg-gradient-to-br from-dispatch-cyan/20 via-gray-900 to-gray-900 px-6 pt-6 pb-5 border-b border-gray-800 shrink-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-dispatch-cyan">End of Shift</p>
              <h2 className="text-xl font-black text-white mt-1">Debrief — {rankLabel}</h2>
              <p className="text-[11px] text-gray-400 mt-1">A summary of the shift, ready to share.</p>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">Clearance</p>
                  <p className="text-lg font-bold text-dispatch-green">{Math.round(summary.clearanceRate * 100)}%</p>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500">Best Response</p>
                  <p className="text-lg font-bold text-white">{summary.bestResponseSec != null ? formatTimer(summary.bestResponseSec) : '--:--'}</p>
                </div>
              </div>

              <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Busiest Neighborhood</p>
                <p className="text-sm font-bold text-orange-300">{summary.topZone ?? '—'}</p>
              </div>

              {tierRows.length > 0 && (
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Difficulty Mix</p>
                  <div className="space-y-1.5">
                    {tierRows.map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-[11px] text-gray-300 capitalize">{TIER_LABELS[k]}</span>
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-dispatch-cyan to-dispatch-red rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(summary.tierMix[k] / maxTier) * 100}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                          />
                        </div>
                        <span className="w-5 text-right text-[11px] font-bold text-gray-300">{summary.tierMix[k]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {summary.unitLeaders.length > 0 && (
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Unit Leaders</p>
                  <div className="space-y-1">
                    {summary.unitLeaders.map((u, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-xs text-gray-300">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {u.name}</span>
                        <span className="text-xs font-bold text-white">{u.missions} cleared</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crew condition (v0.20.5) */}
              {summary.avgFatigue != null && (
                <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-400" /> Crew Condition
                    </p>
                    <span className="text-[11px] text-gray-500">{summary.crewHoursRidden.toFixed(1)}h ridden</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-24 shrink-0 text-[11px] text-gray-400">Avg fatigue</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${summary.avgFatigue >= 70 ? 'bg-red-500' : summary.avgFatigue >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${summary.avgFatigue}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[11px] font-bold text-gray-200">{Math.round(summary.avgFatigue)}%</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-24 shrink-0 text-[11px] text-gray-400">Peak fatigue</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-amber-500 to-red-600 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${summary.peakFatigue}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[11px] font-bold text-gray-200">{summary.peakFatigue}%</span>
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                    <BatteryLow className="w-3 h-3 text-gray-500" />
                    {fatigueActive
                      ? `Morale events: ${summary.overworkEvents} overwork · ${summary.moraleBoosts} training boosts · ${summary.restEvents} rest breaks`
                      : 'Shift Pressure is off — crews never tired this shift.'}
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-0 space-y-2 shrink-0">
              <button
                onClick={onShareImage}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-dispatch-red/20 border border-dispatch-red/30
                           text-white text-sm font-semibold hover:bg-dispatch-red/30 transition-colors"
              >
                <Share2 className="w-4 h-4 text-dispatch-red" />
                {sharedAsImage === 'clipboard'
                  ? 'Image Copied to Clipboard ✓'
                  : sharedAsImage === 'download'
                    ? 'Image Downloaded ✓'
                    : 'Share as Image'}
              </button>
              <button
                onClick={onCopy}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-dispatch-cyan/20 border border-dispatch-cyan/30
                           text-white text-sm font-semibold hover:bg-dispatch-cyan/30 transition-colors"
              >
                <Copy className="w-4 h-4 text-dispatch-cyan" />
                {copied ? 'Copied to Clipboard ✓' : 'Copy Summary'}
              </button>
              <button
                onClick={() => { playClick(); onClose(); }}
                className="w-full p-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Back to Shift Report
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
