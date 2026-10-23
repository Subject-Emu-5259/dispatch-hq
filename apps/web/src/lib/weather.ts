// ============================================
// Dispatch HQ — Weather Effects
// ============================================
// The active weather event (storm / fog / heatwave / clear) shifts gameplay:
// spawn weights, road vs water call bias, and unit response speed. Weather is
// driven by the RandomEvents system; App.tsx syncs the active event into the
// store (`setWeather`), and these pure helpers translate it into multipliers.

import { useGameStore } from '@/stores/gameStore';

export type ActiveWeather = 'storm' | 'fog' | 'heatwave' | 'clear';

/**
 * The live weather event synced into the store (v0.22.16) — what the Alerts
 * tab's weather status strip renders. Same shape as the RandomEvents weather
 * templates plus a spawn timestamp so the strip can show a live countdown.
 */
export interface ActiveWeatherEvent {
  id: 'storm' | 'fog' | 'heatwave';
  name: string;
  icon: string;
  effect: string;
  /** Epoch ms when the weather started (attached at spawn). */
  startedAt: number;
  /** Event duration in seconds. */
  duration: number;
}

/** Seconds left in the weather window (0 when elapsed or no event). */
export function weatherSecondsLeft(event: ActiveWeatherEvent | null | undefined, now = Date.now()): number {
  if (!event) return 0;
  return Math.max(0, Math.ceil((event.startedAt + event.duration * 1000 - now) / 1000));
}

/** 0 → 100 elapsed progress through the weather window. */
export function weatherProgress(event: ActiveWeatherEvent | null | undefined, now = Date.now()): number {
  if (!event) return 0;
  const elapsed = Math.max(0, now - event.startedAt);
  return Math.min(100, (elapsed / (event.duration * 1000)) * 100);
}

export interface WeatherEffects {
  /** Per-service spawn weight multipliers (missing service = neutral 1). */
  spawnWeights: Partial<Record<'fire' | 'police' | 'ems', number>>;
  /** Extra weight for road/highway/intersection calls (0..1+). */
  roadBias: number;
  /** Extra weight for water-rescue calls. */
  waterBias: number;
  /** Unit response speed multiplier (< 1 in fog). */
  responseSpeedMult: number;
}

const CLEAR: WeatherEffects = {
  spawnWeights: {},
  roadBias: 1,
  waterBias: 1,
  responseSpeedMult: 1,
};

export function getWeatherEffects(w: ActiveWeather): WeatherEffects {
  switch (w) {
    case 'storm':
      return { spawnWeights: { ems: 1.3, police: 1.2 }, roadBias: 2.2, waterBias: 2.5, responseSpeedMult: 1 };
    case 'fog':
      return { spawnWeights: {}, roadBias: 1.6, waterBias: 1, responseSpeedMult: 0.85 };
    case 'heatwave':
      return { spawnWeights: { ems: 1.4, fire: 1.3 }, roadBias: 1, waterBias: 0.5, responseSpeedMult: 1 };
    default:
      return CLEAR;
  }
}

/** The store's current weather, defaulting to clear when none is set. */
export function currentWeather(): ActiveWeather {
  return useGameStore.getState().weather ?? 'clear';
}
