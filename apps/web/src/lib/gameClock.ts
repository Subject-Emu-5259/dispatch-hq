// ============================================
// Dispatch HQ — Virtual Game Clock
// ============================================
// The city runs on an accelerated day/night cycle: 1 real minute = 30 game
// minutes at gameSpeed 1. The clock advances 0.5 game-minutes per sim tick,
// so it scales with gameSpeed like the rest of the simulation (fast-forward
// days pass faster). `gameMinutes` accumulates in the store; these pure
// helpers derive the hour of day, whether it's night, and a clock label.

export const NIGHT_SPAWN_MODIFIER = 0.7; // fewer but more serious calls at night
export const MINUTES_PER_GAME_HOUR = 30; // 1 real min = 30 game min
export const NIGHT_START_HOUR = 20;      // 8 PM
export const NIGHT_END_HOUR = 6;         // 6 AM

function totalGameHours(gameMinutes: number): number {
  return Math.floor(gameMinutes / MINUTES_PER_GAME_HOUR) % 24;
}

export function hourOfDay(gameMinutes: number): number {
  return totalGameHours(gameMinutes);
}

export function isNight(gameMinutes: number): boolean {
  const h = hourOfDay(gameMinutes);
  return h < NIGHT_END_HOUR || h >= NIGHT_START_HOUR;
}

/** 12-hour clock label, e.g. "07:15" (no AM/PM — the UI adds night context). */
export function clockLabel(gameMinutes: number): string {
  const total = totalGameHours(gameMinutes);
  const h = total % 12 === 0 ? 12 : total % 12;
  const m = Math.floor(gameMinutes % MINUTES_PER_GAME_HOUR);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
