// ============================================
// Dispatch HQ — Fog of War System (Batch 3d deepened)
// ============================================
// Simulates map visibility zones: explored (clear), unexplored (fogged).
// Zones are deterministic (same center → same zones) and reveal from the
// live travel trail — stations, missions, AND unit positions — via the
// App-level sync hook; this panel reads the persisted revealed list from
// the store (save blob) and shows the dispatch bonus it pays.

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, MapPin, Layers } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { fogZonesForCenter, exploredBonusPct, FOG_ZONE_COUNT } from '@/lib/fogExploration';

interface FogOfWarProps {
  mapCenter: [number, number];
  stations: Array<{ lat: number; lng: number }>;
  missions: Array<{ lat: number; lng: number }>;
  /** Live unit positions (travel trail) — accepted for API parity; the
   * App sync hook owns reveal, so the panel stays a pure view. */
  units?: Array<{ lat: number; lng: number }>;
  isVisible: boolean;
  onToggle: () => void;
}

export function FogOfWar({ mapCenter, isVisible, onToggle }: FogOfWarProps) {
  const fogRevealed = useGameStore((s) => s.fogRevealed);
  const fogZones = useMemo(() => fogZonesForCenter(mapCenter), [mapCenter]);
  const revealedCount = fogZones.filter((z) => fogRevealed.includes(z.id)).length;

  const totalZones = fogZones.length;
  const percentRevealed = totalZones > 0 ? (revealedCount / totalZones) * 100 : 0;
  const bonusPct = exploredBonusPct(revealedCount, FOG_ZONE_COUNT);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute top-20 right-4 z-[40] bg-gray-900/95 backdrop-blur-xl border border-gray-700/50
                 rounded-xl shadow-2xl p-3 w-48"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-dispatch-cyan" />
          <h3 className="text-xs font-bold text-white">Fog of War</h3>
        </div>
        <button
          onClick={onToggle}
          className="p-1 rounded-md hover:bg-gray-800 transition-colors"
        >
          <EyeOff className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-gray-400">Area Explored</span>
          <span className="text-dispatch-cyan font-semibold">{Math.round(percentRevealed)}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-dispatch-cyan to-dispatch-green rounded-full"
            animate={{ width: `${percentRevealed}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-gray-700/60 border border-gray-600/40" />
          <span className="text-[11px] text-gray-400">Unexplored ({totalZones - revealedCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-dispatch-cyan/20 border border-dispatch-cyan/40" />
          <span className="text-[11px] text-gray-400">Revealed ({revealedCount})</span>
        </div>
      </div>

      <p className="text-[11px] text-gray-600 mt-3 border-t border-gray-800 pt-2">
        Dispatch units to explore new areas of the map.
        {bonusPct > 0 && (
          <span className="block text-dispatch-cyan mt-1">
            Explored-zone bonus: +{bonusPct}% mission rewards{revealedCount >= totalZones ? ' (map fully explored!)' : ''}.
          </span>
        )}
      </p>
    </motion.div>
  );
}
