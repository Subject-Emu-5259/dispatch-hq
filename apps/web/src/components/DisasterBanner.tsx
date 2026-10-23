// ============================================
// Dispatch HQ — Disaster Status (v0.22.13)
// ============================================
// Active disaster info lives in the Notifications tab instead of a floating
// banner over the map. Two compact pieces, both driven by the store's
// `activeDisaster`:
//   DisasterStatusChip  — TopBar chip (icon + countdown) so an active
//                         emergency is visible at a glance without covering
//                         the map. Clicking it opens the Notifications tab.
//   DisasterStatusStrip — pinned at the top of the Notifications Alerts tab
//                         with the full status (phase, countdown, progress).
// The old full-width floating banner is gone.

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatTimer } from '@/utils/timeFormat';
import { disasterProgress, aftermathProgress, type ActiveDisaster } from '@/lib/disasters';
import { useGameStore } from '@/stores/gameStore';

/** Seconds left in the current disaster window (emergency or recovery). */
function disasterSecondsLeft(disaster: ActiveDisaster): number {
  const deadline = disaster.phase === 'aftermath' ? (disaster.aftermathEndsAt ?? 0) : disaster.endsAt;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/**
 * Compact TopBar chip — the at-a-glance replacement for the floating banner.
 * Icon + live countdown in the top bar's chip row; click opens the
 * Notifications tab where the full strip lives.
 */
export function DisasterStatusChip({ onOpen }: { onOpen?: () => void }) {
  const disaster = useGameStore((s) => s.activeDisaster);
  const [, forceTick] = useState(0);

  // Re-render each second so the countdown stays live.
  useEffect(() => {
    if (!disaster) return;
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [disaster]);

  if (!disaster) return null;
  const recovering = disaster.phase === 'aftermath';
  const secondsLeft = disasterSecondsLeft(disaster);

  return (
    <button
      onClick={onOpen}
      title={`${disaster.name} — ${recovering ? 'recovery' : 'emergency'} in progress · ${formatTimer(secondsLeft)} left`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold select-none transition-colors ${
        recovering
          ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/70'
          : 'bg-red-950/70 border-red-500/40 text-red-300 hover:bg-red-900/70'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${recovering ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
      <span className="text-xs leading-none">{disaster.icon}</span>
      <span className="hidden sm:inline uppercase tracking-wider text-[8px]">
        {recovering ? 'Recovery' : 'Disaster'}
      </span>
      <span className="font-mono">{formatTimer(secondsLeft)}</span>
    </button>
  );
}

/**
 * Full-status strip pinned at the top of the Notifications Alerts tab while a
 * disaster (or its recovery aftermath) is active: name, phase, live countdown,
 * containment progress, and calls contained.
 */
export function DisasterStatusStrip() {
  const disaster = useGameStore((s) => s.activeDisaster);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!disaster) return;
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [disaster]);

  if (!disaster) return null;
  const recovering = disaster.phase === 'aftermath';
  const progress = Math.min(100, Math.max(0, recovering ? aftermathProgress(disaster) : disasterProgress(disaster)));
  const secondsLeft = disasterSecondsLeft(disaster);

  return (
    <div
      className={`rounded-xl border backdrop-blur-md px-3 py-2.5 ${
        recovering ? 'border-emerald-500/40 bg-emerald-950/70' : 'border-red-500/40 bg-red-950/70'
      }`}
    >
      <div className="flex items-center gap-2">
        {recovering
          ? <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
        <p className="text-xs font-bold text-white truncate flex-1">
          {recovering ? 'Recovery' : disaster.name}
        </p>
        <span className={`text-[10px] font-mono shrink-0 ${recovering ? 'text-emerald-300' : 'text-red-300'}`}>
          {formatTimer(secondsLeft)}
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-black/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${recovering ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-[9px] text-gray-400 leading-snug">
        {recovering
          ? 'City returning to normal — recovery calls active in the affected zone.'
          : `${disaster.completed}/${disaster.spawned} calls contained — dispatch units to the affected zone.`}
      </p>
    </div>
  );
}
