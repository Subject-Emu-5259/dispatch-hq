// ============================================
// Dispatch HQ — Alliance Treasury UI
// ============================================
// Shared credit pool: deposit, withdraw, balance display, transaction log.
// Phase 1 of the v1.0 co-op endgame shared-resources system.

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Clock, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import {
  fetchTreasury,
  depositToTreasury,
  withdrawFromTreasury,
  type TreasuryTransaction,
} from '@/lib/apiClient';
import { useGameStore } from '@/stores/gameStore';

interface AllianceTreasuryProps {
  allianceLevel: number;
  memberRole: string;
}

const REASON_ICONS: Record<string, string> = {
  deposit: '💰',
  withdraw: '🏦',
  station_build: '🏗️',
  unit_purchase: '🚒',
  upgrade: '⬆️',
  gift: '🎁',
};

const REASON_LABELS: Record<string, string> = {
  deposit: 'Deposited',
  withdraw: 'Withdrew',
  station_build: 'Station build',
  unit_purchase: 'Unit purchase',
  upgrade: 'Upgrade',
  gift: 'Gift',
};

export function AllianceTreasury({ allianceLevel, memberRole }: AllianceTreasuryProps) {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const playerCredits = useGameStore((s) => s.player?.credits ?? 0);
  const canWithdraw = memberRole === 'leader' || memberRole === 'officer';

  const loadTreasury = useCallback(async () => {
    try {
      const data = await fetchTreasury();
      setBalance(data.balance);
      setTransactions(data.transactions);
    } catch {
      // Silently fail — treasury might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTreasury();
  }, [loadTreasury]);

  const handleDeposit = async () => {
    const amount = parseInt(depositAmount, 10);
    if (!amount || amount < 100) {
      setError('Minimum deposit is 100 credits');
      return;
    }
    if (amount > playerCredits) {
      setError('Insufficient credits');
      return;
    }
    setError(null);
    try {
      const result = await depositToTreasury(amount);
      setBalance(result.balance);
      setDepositAmount('');
      setSuccess(`Deposited ${amount.toLocaleString()} credits`);
      // Update local credits
      const state = useGameStore.getState();
      if (state.player) {
        state.updatePlayer({ credits: state.player.credits - amount });
      }
      loadTreasury();
    } catch (e: any) {
      setError(e.message || 'Deposit failed');
    }
  };

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount, 10);
    if (!amount || amount < 100) {
      setError('Minimum withdrawal is 100 credits');
      return;
    }
    if (amount > balance) {
      setError('Insufficient treasury balance');
      return;
    }
    setError(null);
    try {
      const result = await withdrawFromTreasury(amount);
      setBalance(result.balance);
      setWithdrawAmount('');
      setSuccess(`Withdrew ${amount.toLocaleString()} credits`);
      // Update local credits
      const state = useGameStore.getState();
      if (state.player) {
        state.updatePlayer({ credits: state.player.credits + amount });
      }
      loadTreasury();
    } catch (e: any) {
      setError(e.message || 'Withdrawal failed');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTreasury();
    setRefreshing(false);
  };

  // Clear messages after 3s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="text-center py-4 text-[10px] text-gray-500">
        <RefreshCw className="w-3 h-3 animate-spin inline mr-1" />
        Loading treasury…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Balance card */}
      <div className="bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border border-amber-500/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-bold text-white">Alliance Treasury</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="text-2xl font-black text-amber-400 font-mono">
          {balance.toLocaleString()}
          <span className="text-[10px] text-amber-400/60 ml-1">credits</span>
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1"
          >
            ✅ {success}
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1"
          >
            ❌ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit / Withdraw */}
      <div className="grid grid-cols-2 gap-2">
        {/* Deposit */}
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-gray-300">Deposit</span>
          </div>
          <div className="flex gap-1">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="100"
              className="flex-1 bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
              min={100}
            />
            <button
              onClick={handleDeposit}
              disabled={!depositAmount || parseInt(depositAmount, 10) < 100}
              className="px-2 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-bold hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-[9px] text-gray-600 mt-1">Your credits: {playerCredits.toLocaleString()}</p>
        </div>

        {/* Withdraw */}
        <div className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowUpFromLine className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-gray-300">Withdraw</span>
          </div>
          {canWithdraw ? (
            <div className="flex gap-1">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="100"
                className="flex-1 bg-gray-900/60 border border-gray-700/40 rounded px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                min={100}
              />
              <button
                onClick={handleWithdraw}
                disabled={!withdrawAmount || parseInt(withdrawAmount, 10) < 100}
                className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Take
              </button>
            </div>
          ) : (
            <p className="text-[9px] text-gray-600 py-1">Officer+ only</p>
          )}
        </div>
      </div>

      {/* Transaction log */}
      <div>
        <div className="flex items-center gap-1 mb-2">
          <Clock className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] font-bold text-gray-400">Recent Activity</span>
        </div>
        {transactions.length === 0 ? (
          <p className="text-[10px] text-gray-600 text-center py-3">No transactions yet</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-2 text-[10px] py-1 px-2 rounded bg-gray-800/30"
              >
                <span className="text-sm">{REASON_ICONS[tx.reason] ?? '📝'}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-300 font-medium">{tx.playerName}</span>
                  <span className="text-gray-500 mx-1">{REASON_LABELS[tx.reason] ?? tx.reason}</span>
                </div>
                <span className={`font-mono font-bold ${tx.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {tx.delta > 0 ? '+' : ''}{tx.delta.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
