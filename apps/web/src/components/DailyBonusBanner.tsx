// ============================================
// Dispatch HQ — Daily Login Bonus Banner (v0.44.0)
// ============================================
// A small banner shown on the main menu when the player hasn't claimed
// today's daily coin bonus. Tapping it claims the bonus and shows a
// brief success animation. Commander members see 5 coins; free players
// see 2.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Check, Gift } from 'lucide-react';
import { fetchDailyBonusStatus, claimDailyBonus } from '@/lib/apiClient';
import { useGameStore } from '@/stores/gameStore';
import { playClick } from '@/utils/sound';

export function DailyBonusBanner() {
  const [status, setStatus] = useState<{ claimed: boolean; coins: number } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const player = useGameStore((s) => s.player);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    fetchDailyBonusStatus()
      .then((s) => { if (!cancelled) setStatus({ claimed: s.claimed, coins: s.coinsGranted }); })
      .catch(() => { /* silently ignore — banner just won't show */ });
    return () => { cancelled = true; };
  }, [player]);

  // Don't render if already claimed, still loading, or no player.
  if (!status || status.claimed) return null;

  async function handleClaim() {
    if (claiming) return;
    playClick();
    setClaiming(true);
    try {
      const res = await claimDailyBonus();
      if (res.success) {
        setJustClaimed(true);
        // Update the player's coin balance in the store.
        const st = useGameStore.getState();
        const p = st.player;
        if (p) st.updatePlayer({ coins: p.coins + res.coinsGranted });
        // Hide after a short celebration.
        setTimeout(() => setJustClaimed(false), 2500);
      }
    } catch {
      // Silently fail — the banner just stays visible for retry.
    } finally {
      setClaiming(false);
    }
  }

  return (
    <AnimatePresence>
      {!justClaimed && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          onClick={() => void handleClaim()}
          disabled={claiming}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-colors group"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] font-bold text-amber-300">
              Daily Login Bonus
            </p>
            <p className="text-[10px] text-gray-400">
              {claiming ? 'Claiming…' : `Tap to claim ${status.coins} coins`}
            </p>
          </div>
          <div className="flex items-center gap-1 text-amber-300 shrink-0">
            <Coins className="w-3.5 h-3.5" />
            <span className="text-sm font-black tabular-nums">+{status.coins}</span>
          </div>
        </motion.button>
      )}
      {justClaimed && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30"
        >
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] font-bold text-green-300">
              Bonus Claimed!
            </p>
            <p className="text-[10px] text-gray-400">
              +{status.coins} coins added to your balance
            </p>
          </div>
          <div className="flex items-center gap-1 text-green-300 shrink-0">
            <Coins className="w-3.5 h-3.5" />
            <span className="text-sm font-black tabular-nums">+{status.coins}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
