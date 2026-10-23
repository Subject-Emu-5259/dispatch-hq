// ============================================
// Dispatch HQ — Stress Meter System
// ============================================
// Tracks dispatch stress from active missions, failures, and time pressure.
// Visual bar + tips for managing stress.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, AlertTriangle, Heart, Shield, TrendingUp } from 'lucide-react';

interface StressMeterProps {
  activeMissions: number;
  failedMissions: number;
  availableUnits: number;
  isPaused: boolean;
  /** Renders the tooltip above the button (for docks anchored near the screen bottom). */
  tooltipUp?: boolean;
}

const STRESS_TIPS = [
  'Dispatch more units to reduce active mission load.',
  'Upgrade stations for faster response times.',
  'Complete missions quickly to maintain focus.',
  'Recall idle units to prevent burnout.',
  'Critical incidents increase stress faster.',
  'A balanced unit mix handles stress better.',
];

/** What each severity level means and how to recover (v0.28.0). */
const CONSEQUENCES: Record<string, string> = {
  Critical: 'Overextended — your department is running hot. Clear calls, recall units, and let recovery bring stress down before outcomes start slipping.',
  High: 'Heavy load — complete missions and keep units available, or stress climbs toward critical.',
  Moderate: 'Watch your load — balance calls against available units to keep response sharp.',
  Low: 'Steady — keep balancing calls and available units.',
  Calm: 'All clear — keep responding and stress stays low.',
};

/** How stress ticks — exposed so the meter's recovery math is transparent. */
const STRESS_MECHANICS = [
  { label: 'Active mission', change: '+2', cls: 'text-red-400' },
  { label: 'Failed mission', change: '+15', cls: 'text-red-400' },
  { label: 'Available unit', change: '−3', cls: 'text-green-400' },
  { label: 'Natural decay', change: '−1', cls: 'text-green-400' },
];

export function StressMeter({ activeMissions, failedMissions, availableUnits, isPaused, tooltipUp = false }: StressMeterProps) {
  const [stress, setStress] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const [stressHistory, setStressHistory] = useState<number[]>([]);

  // Calculate stress based on game state
  useEffect(() => {
    if (isPaused) return;

    setStress(prev => {
      let newStress = prev;

      // Stress from active missions
      newStress += activeMissions * 2;

      // Stress from failed missions
      newStress += failedMissions * 15;

      // Relief from available units
      newStress -= availableUnits * 3;

      // Natural decay
      newStress -= 1;

      // Clamp
      newStress = Math.max(0, Math.min(100, newStress));

      // Update history inside the setter to avoid dependency cycle
      setStressHistory(h => [...h.slice(-20), newStress]);

      return newStress;
    });
  }, [activeMissions, failedMissions, availableUnits, isPaused]);

  const getStressLevel = () => {
    if (stress >= 80) return { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500', icon: AlertTriangle };
    if (stress >= 60) return { label: 'High', color: 'text-orange-400', bg: 'bg-orange-500', icon: TrendingUp };
    if (stress >= 40) return { label: 'Moderate', color: 'text-amber-400', bg: 'bg-amber-500', icon: Shield };
    if (stress >= 20) return { label: 'Low', color: 'text-green-400', bg: 'bg-green-500', icon: Heart };
    return { label: 'Calm', color: 'text-emerald-400', bg: 'bg-emerald-500', icon: Brain };
  };

  const level = getStressLevel();
  const Icon = level.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setShowTips(!showTips)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border border-gray-700/30 rounded-lg
                   hover:bg-gray-800/80 transition-all group"
      >
        <Icon className={`w-4 h-4 ${level.color}`} />
        <div className="flex flex-col items-start">
          <span className="text-[10px] text-gray-500 font-medium uppercase">Stress</span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${level.bg}`}
                animate={{ width: `${stress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className={`text-[10px] font-bold ${level.color}`}>
              {level.label === 'Critical' && <span className="mr-0.5 animate-pulse" aria-hidden>⚠</span>}
              {Math.round(stress)}%
            </span>
          </div>
        </div>
      </button>

      {/* Tooltip */}
      <AnimatePresence>
        {showTips && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className={`absolute w-64 bg-gray-900/95 backdrop-blur-xl border border-gray-700/50
                       rounded-xl shadow-2xl p-3 z-50 ${tooltipUp ? 'bottom-full mb-2 right-0' : 'top-full mt-2 left-0'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-dispatch-yellow" />
              <h3 className="text-xs font-bold text-white">Dispatch Stress</h3>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Active Missions</span>
                <span className="text-white">{activeMissions}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Failed Missions</span>
                <span className="text-red-400">{failedMissions}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-400">Available Units</span>
                <span className="text-green-400">{availableUnits}</span>
              </div>
            </div>

            {/* What this level means + how to recover (v0.28.0) */}
            <div className={`border-t border-gray-800 pt-2 ${stress >= 60 ? 'bg-red-500/5 rounded-lg mt-1 -mx-1 px-1' : ''}`}>
              <p className="text-[10px] text-gray-500 font-medium mb-1 flex items-center gap-1">
                <AlertTriangle className={`w-3 h-3 ${level.color}`} /> Consequence
              </p>
              <p className={`text-[10px] ${stress >= 60 ? 'text-amber-300/90' : 'text-gray-400'}`}>
                {CONSEQUENCES[level.label]}
              </p>
            </div>

            <div className="border-t border-gray-800 pt-2 mt-1">
              <p className="text-[10px] text-gray-500 font-medium mb-1.5">Recovery per tick</p>
              <div className="space-y-0.5">
                {STRESS_MECHANICS.map((m) => (
                  <div key={m.label} className="flex justify-between text-[10px]">
                    <span className="text-gray-400">{m.label}</span>
                    <span className={`font-mono font-bold ${m.cls}`}>{m.change}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-800 pt-2 mt-1">
              <p className="text-[10px] text-gray-500 font-medium mb-1">💡 Tip:</p>
              <p className="text-[10px] text-gray-400">
                {STRESS_TIPS[Math.floor(Math.random() * STRESS_TIPS.length)]}
              </p>
            </div>

            {/* Mini stress graph */}
            <div className="mt-3">
              <p className="text-[9px] text-gray-500 mb-1">History</p>
              <div className="flex items-end gap-[1px] h-6">
                {stressHistory.map((val, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t ${val >= 80 ? 'bg-red-500' : val >= 60 ? 'bg-orange-500' : val >= 40 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ height: `${(val / 100) * 24}px` }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
