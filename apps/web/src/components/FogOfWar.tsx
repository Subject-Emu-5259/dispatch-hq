// ============================================
// Dispatch HQ — Fog of War System
// ============================================
// Simulates map visibility zones: explored (clear), unexplored (fogged).
// Areas become clear when units are dispatched nearby.

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, MapPin, Layers } from 'lucide-react';
import { getFogRevealMultiplier } from '@/lib/techTree';
import { useGameStore } from '@/stores/gameStore';

interface FogZone {
  id: string;
  lat: number;
  lng: number;
  radius: number; // in km
  revealed: boolean;
  revealedBy?: string;
  discoveredAt?: number;
}

interface FogOfWarProps {
  mapCenter: [number, number];
  stations: Array<{ lat: number; lng: number }>;
  missions: Array<{ lat: number; lng: number }>;
  isVisible: boolean;
  onToggle: () => void;
}

// Generate initial fog zones around the map
function generateFogZones(center: [number, number], count: number = 20): FogZone[] {
  const zones: FogZone[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const distance = 0.01 + Math.random() * 0.04;
    zones.push({
      id: `fog_${i}`,
      lat: center[0] + Math.cos(angle) * distance,
      lng: center[1] + Math.sin(angle) * distance,
      radius: 0.005 + Math.random() * 0.01,
      revealed: false,
    });
  }
  return zones;
}

export function FogOfWar({ mapCenter, stations, missions, isVisible, onToggle }: FogOfWarProps) {
  const [fogZones, setFogZones] = useState<FogZone[]>(() => generateFogZones(mapCenter));
  const [revealedCount, setRevealedCount] = useState(0);
  const techPurchased = useGameStore((s) => s.techPurchased);
  const revealMult = getFogRevealMultiplier(techPurchased);

  // Reveal zones near stations and active missions
  useEffect(() => {
    setFogZones(prev =>
      prev.map(zone => {
        // Check distance to stations
        const nearStation = stations.some(s => {
          const dist = Math.sqrt(
            Math.pow(s.lat - zone.lat, 2) + Math.pow(s.lng - zone.lng, 2)
          );
          return dist < 0.015 * revealMult;
        });

        // Check distance to missions
        const nearMission = missions.some(m => {
          const dist = Math.sqrt(
            Math.pow(m.lat - zone.lat, 2) + Math.pow(m.lng - zone.lng, 2)
          );
          return dist < 0.01 * revealMult;
        });

        if ((nearStation || nearMission) && !zone.revealed) {
          return { ...zone, revealed: true, revealedBy: nearStation ? 'Station' : 'Unit', discoveredAt: Date.now() };
        }
        return zone;
      })
    );
  }, [stations, missions, revealMult]);

  // Count revealed zones
  useEffect(() => {
    setRevealedCount(fogZones.filter(z => z.revealed).length);
  }, [fogZones]);

  const totalZones = fogZones.length;
  const percentRevealed = totalZones > 0 ? (revealedCount / totalZones) * 100 : 0;

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
        <div className="flex justify-between text-[10px] mb-1">
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
          <span className="text-[10px] text-gray-400">Unexplored ({totalZones - revealedCount})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-dispatch-cyan/20 border border-dispatch-cyan/40" />
          <span className="text-[10px] text-gray-400">Revealed ({revealedCount})</span>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 mt-3 border-t border-gray-800 pt-2">
        Dispatch units to explore new areas of the map.
      </p>
    </motion.div>
  );
}
