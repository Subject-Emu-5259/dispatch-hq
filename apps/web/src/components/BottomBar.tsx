// ============================================
// Dispatch HQ — Bottom Status Bar
// ============================================

import { motion } from 'framer-motion';
import { Coins, Star, Zap, Clock, Handshake, Banknote, Crown } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { levelProgress } from '@/utils/levelProgress';
import { missionService } from '@/lib/rewards';

interface BottomBarProps {
  onOpenShop?: () => void;
}

export function BottomBar({ onOpenShop }: BottomBarProps) {
  const { player, missions, stations, selectedService } = useGameStore();

  const { levelXp, xpForNext, atMaxLevel, pct: xpPct } = levelProgress(player);

  const activeMissions = missions.filter((m) => m.status !== 'completed' && m.status !== 'failed');
  // Same department-vs-Mutual Aid split as the Sidebar / Dispatch Board.
  const mainMissions = selectedService
    ? activeMissions.filter((m) => missionService(m) === selectedService)
    : activeMissions;
  const mutualAidCount = selectedService
    ? activeMissions.filter((m) => missionService(m) !== selectedService).length
    : 0;
  const totalUnits = stations.reduce((sum, s) => sum + (s.unitCount || 0), 0);

  return (
    <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-20 pointer-events-none">
      <div className="pointer-events-auto">
        {/* Gradient fade — keeps the strip legible over the map */}
        <div className="h-5 md:h-6 bg-gradient-to-t from-gray-950/90 to-transparent" />

        <div className="bg-gray-950/95 backdrop-blur-md border-t border-gray-800/50">
          <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2 max-w-screen-2xl mx-auto">
            {/* Left: Game stats */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-400 font-mono">
                  {(player?.credits || 0).toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline">cr</span>
              </div>

              {/* Coins — premium currency (v0.31.0). Click to open the shop. */}
              <button
                onClick={onOpenShop}
                className="flex items-center gap-1.5 group"
                aria-label="Open shop"
                title="Coins — open the shop"
              >
                <Coins className="w-4 h-4 text-yellow-300" />
                <span className="text-sm font-bold text-yellow-300 font-mono tabular-nums">
                  {(player?.coins || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-500 group-hover:text-yellow-300 transition-colors hidden sm:inline">shop</span>
              </button>

              {player?.isPremium && (
                <span
                  className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5"
                  title="Commander member"
                >
                  <Crown className="w-3 h-3" /> ✦
                </span>
              )}

              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-dispatch-green" />
                  <span className="text-sm font-bold text-dispatch-green font-mono">
                    {atMaxLevel ? `${levelXp.toLocaleString()}` : `${levelXp.toLocaleString()} / ${xpForNext.toLocaleString()}`}
                  </span>
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    {atMaxLevel ? 'XP max' : 'XP'}
                  </span>
                </div>
                <div className="ml-5 mt-0.5 w-16 h-0.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${atMaxLevel ? 'bg-amber-400' : 'bg-dispatch-green'}`}
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-dispatch-red" />
                <span className="text-sm font-bold text-dispatch-red font-mono">
                  {player?.level || 1}
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline">Lvl</span>
              </div>
            </div>

            {/* Center: Server time / status */}
            <div className="hidden md:flex items-center gap-2 text-gray-500 text-xs">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Dispatch Center Online</span>
              <span className="text-gray-600">•</span>
              <span>{stations.length} station{stations.length !== 1 ? 's' : ''}</span>
              <span className="text-gray-600">•</span>
              <span>{totalUnits} unit{totalUnits !== 1 ? 's' : ''}</span>
            </div>

            {/* Right: Active missions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-bold text-orange-400 font-mono">
                  {mainMissions.length}
                </span>
                <span className="text-xs text-gray-500 hidden sm:inline">active</span>
              </div>

              {/* Mission urgency bar — your department's call load */}
              {mainMissions.length > 0 && (
                <div className="hidden lg:flex items-center gap-1">
                  {mainMissions.slice(0, 8).map((m) => {
                    const urgency = m.timeRemaining / m.totalTime;
                    const color =
                      urgency < 0.3 ? 'bg-red-500' :
                      urgency < 0.6 ? 'bg-orange-500' : 'bg-amber-500';
                    return (
                      <motion.div
                        key={m.id}
                        className={`w-1.5 h-3 rounded-full ${color}`}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.1 }}
                      />
                    );
                  })}
                  {mainMissions.length > 8 && (
                    <span className="text-[10px] text-gray-500">+{mainMissions.length - 8}</span>
                  )}
                </div>
              )}

              {/* Mutual Aid requests — labeled, kept out of the department count */}
              {mutualAidCount > 0 && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-[10px] font-semibold text-blue-300"
                  title="Mutual Aid requests from partner departments (see the labeled section in your call list)"
                >
                  <Handshake className="w-3 h-3" /> {mutualAidCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
