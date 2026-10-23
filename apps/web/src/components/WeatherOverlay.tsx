// ============================================
// Dispatch HQ — Weather Overlay
// ============================================
// Full-map ambient effects driven by the active random-weather events:
//   storm     → animated rain streaks + dark blue wash
//   fog       → drifting haze bands
//   heatwave  → warm heat shimmer
//   clear     → faint sunny glow (positive)
// All layers are pointer-events-none so the map stays fully interactive.

import { useMemo } from 'react';
import type { RandomEvent } from './RandomEvents';

interface WeatherOverlayProps {
  activeEvents: RandomEvent[];
}

export function WeatherOverlay({ activeEvents }: WeatherOverlayProps) {
  const weather = useMemo(() => {
    const has = (id: string) => activeEvents.some((e) => e.id === id);
    return {
      storm: has('storm'),
      fog: has('fog'),
      heatwave: has('heatwave'),
      clear: has('clear_skies'),
    };
  }, [activeEvents]);

  const anyActive = weather.storm || weather.fog || weather.heatwave || weather.clear;
  if (!anyActive) return null;

  return (
    <div className="absolute inset-0 z-[20] pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Dark storm wash */}
      {weather.storm && (
        <div className="absolute inset-0 bg-blue-900/25 mix-blend-multiply" />
      )}

      {/* Animated rain streaks */}
      {weather.storm && (
        <div className="absolute inset-0 weather-rain" />
      )}

      {/* Lightning flash (occasional) */}
      {weather.storm && (
        <div className="absolute inset-0 weather-flash" />
      )}

      {/* Drifting fog bands */}
      {weather.fog && (
        <>
          <div className="absolute inset-0 bg-gray-200/15" />
          <div className="absolute -inset-x-1/4 top-0 h-2/3 weather-fog weather-fog-a" />
          <div className="absolute -inset-x-1/4 bottom-0 h-2/3 weather-fog weather-fog-b" />
        </>
      )}

      {/* Heatwave warm tint + shimmer */}
      {weather.heatwave && (
        <>
          <div className="absolute inset-0 bg-orange-500/10 mix-blend-overlay" />
          <div className="absolute inset-0 weather-heat" />
        </>
      )}

      {/* Clear skies — subtle warm glow */}
      {weather.clear && (
        <div className="absolute inset-0 bg-amber-200/5" />
      )}
    </div>
  );
}
