// ============================================
// Dispatch HQ — Shared Timer/ETA Formatter
// ============================================
// The single source of truth for every m:ss timer and ETA display in the
// game. All components must use this instead of local formatters.
//
// Why ceil: ETA values can be fractional (weather speed multipliers, OSRM
// route durations), so a raw `seconds % 60` renders values like 14.5 as
// "0:14.5". Ceiling first keeps the display a clean clock and never shows a
// countdown sitting at 0:00 while a fraction of a second remains.

export interface TimerFormatOptions {
  /** When true, render sub-minute values as "Xs" (map marker style). */
  compact?: boolean;
}

export function formatTimer(seconds: number, options: TimerFormatOptions = {}): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.ceil(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (options.compact && m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
