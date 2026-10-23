// ============================================
// Dispatch HQ — Weather Status Strip (v0.22.16)
// ============================================
// The Alerts-tab counterpart to DisasterStatusStrip: while severe weather is
// active (storm / fog / heatwave), a pinned card shows the event, its live
// countdown, and how much of the window has elapsed — so players see the
// conditions affecting calls and response speed right where the disaster
// emergency lives, without anything floating over the map.

import { useEffect, useState } from 'react';
import { CloudLightning, CloudFog, Sun } from 'lucide-react';
import { formatTimer } from '@/utils/timeFormat';
import { weatherSecondsLeft, weatherProgress, type ActiveWeatherEvent } from '@/lib/weather';
import { useGameStore } from '@/stores/gameStore';

const WEATHER_ICONS: Record<ActiveWeatherEvent['id'], React.ElementType> = {
  storm: CloudLightning,
  fog: CloudFog,
  heatwave: Sun,
};

/**
 * Pinned at the top of the Notifications Alerts tab while severe weather is
 * active: icon, event name, live countdown, elapsed progress, and the
 * gameplay effect. Re-renders every second so the countdown stays live, and
 * hides itself when the weather clears.
 */
export function WeatherStatusStrip() {
  const weatherEvent = useGameStore((s) => s.weatherEvent);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!weatherEvent) return;
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [weatherEvent]);

  const secondsLeft = weatherSecondsLeft(weatherEvent);
  // Self-hide once the window elapses — the store sync (RandomEvents prune +
  // App.tsx effect) normally clears it within a second, but never show a
  // stale 0:00 card if that lags.
  if (!weatherEvent || secondsLeft <= 0) return null;
  const Icon = WEATHER_ICONS[weatherEvent.id] ?? CloudLightning;
  const progress = weatherProgress(weatherEvent);

  return (
    <div className="rounded-xl border border-sky-500/40 bg-sky-950/70 backdrop-blur-md px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-sky-400 shrink-0" />
        <p className="text-xs font-bold text-white truncate flex-1">
          {weatherEvent.icon} {weatherEvent.name}
        </p>
        <span className="text-[10px] font-mono text-sky-300 shrink-0">
          {formatTimer(secondsLeft)}
        </span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-black/30 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 bg-sky-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-[9px] text-gray-400 leading-snug">
        {weatherEvent.effect} — severe weather shifts the call mix and response speed until it clears.
      </p>
    </div>
  );
}
