// ============================================
// Dispatch HQ — Profile Modal
// ============================================
// Your dispatch identity: display name + avatar (persisted via the server-side
// settings blob), rank badge from the shared rank ladder, career records, and
// account email — with a founder badge on the founder account.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, X, Crown, Star, Siren, Shield, HeartHandshake, Ticket, CheckCircle2, AlertCircle } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { rankForLevel, nextRank, advanceLevel } from '@dispatch-hq/shared';
import { loadSettings, saveSettings, displayEmailFor } from '@/utils/settings';
import { formatTimer } from '@/utils/timeFormat';
import { redeemPromoCode, type PromoRewards } from '@/lib/apiClient';
import { setSavedPlayerBaseline } from '@/hooks/useSaveSystem';
import { levelProgress } from '@/utils/levelProgress';
import { GuestUpgradeCard } from './GuestUpgradeCard';
import { FOUNDER_EMAIL } from '@/lib/founder';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVATARS = ['🚨', '🚒', '🚔', '🚑', '🔥', '🛡️', '⚡', '⭐', '🧑‍🚒', '👮', '🧑‍⚕️', '🎖️'];

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const player = useGameStore((s) => s.player);
  const career = useGameStore((s) => s.career);
  const selectedService = useGameStore((s) => s.selectedService);

  const settings = loadSettings();
  const [name, setName] = useState(settings.profileName || player?.username || 'Commander');
  const [avatar, setAvatar] = useState(settings.avatarEmoji || '🚨');
  const [saved, setSaved] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!isOpen) return null;

  const isFounder = player?.email?.toLowerCase() === FOUNDER_EMAIL;
  // Hide synthetic guest emails (guest_xxx@dispatchhq.game) behind a friendly label.
  const displayEmail = displayEmailFor(player);
  const isGuest = player?.email ? player.email.toLowerCase().startsWith('guest_') : false;
  const rank = rankForLevel(player?.level ?? 1, selectedService ?? undefined);
  const next = nextRank(player?.level ?? 1);

  const { level, levelXp, xpForNext, atMaxLevel, pct: levelPct } = levelProgress(player);

  const save = () => {
    saveSettings({
      profileName: name.trim().slice(0, 24) || player?.username || 'Commander',
      avatarEmoji: avatar,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const redeem = async () => {
    const code = promoCode.trim();
    if (!code || redeeming) return;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const res = await redeemPromoCode(code);
      // Apply the granted rewards additively to local state — the game is
      // client-authoritative, so server totals may be stale relative to the
      // credits/XP earned locally this session.
      const state = useGameStore.getState();
      const player = state.player;
      // XP grants level up through the shared curve; explicit level bumps are
      // applied first, then the XP is consumed the same way as mission payouts.
      const leveled = advanceLevel(
        (player?.level ?? 1) + (res.granted.level ?? 0),
        player?.xp ?? 0,
        res.granted.xp ?? 0
      );
      state.updatePlayer({
        credits: (player?.credits ?? 0) + (res.granted.credits ?? 0),
        coins: (player?.coins ?? 0) + (res.granted.coins ?? 0),
        xp: leveled.xpIntoLevel,
        level: leveled.level,
      });
      // Refresh the saved-player baseline to the server's post-redeem totals
      // so the /me live-sync poll sees a zero delta — otherwise the next poll
      // would re-derive the grant and (with the curve) level the player twice.
      if (res.player) setSavedPlayerBaseline(res.player);
      setPromoCode('');
      setRedeemMsg({ ok: true, text: rewardsText(res.granted) });
    } catch (err) {
      setRedeemMsg({ ok: false, text: (err as Error)?.message ?? 'Redemption failed' });
    } finally {
      setRedeeming(false);
    }
  };

  const rewardsText = (g: PromoRewards): string => {
    const parts: string[] = [];
    if (g.credits) parts.push(`${g.credits.toLocaleString()} credits`);
    if (g.xp) parts.push(`${g.xp.toLocaleString()} XP`);
    if (g.coins) parts.push(`${g.coins} coins`);
    if (g.level) parts.push(`${g.level} level${g.level > 1 ? 's' : ''}`);
    return `Redeemed! +${parts.join(' + ') || 'bonus'}.`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      redeem();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-dispatch-cyan/20 border border-dispatch-cyan/30 flex items-center justify-center">
                <User className="w-4 h-4 text-dispatch-cyan" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Your Profile</h2>
                <p className="text-[10px] text-gray-500">Dispatch identity & records</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 flex items-center justify-center text-3xl">
                  {avatar}
                </div>
                {isFounder && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-dispatch-red border-2 border-gray-900 flex items-center justify-center">
                    <Crown className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-white truncate">{name}</p>
                  {isFounder && (
                    <span className="px-1.5 py-0.5 rounded bg-dispatch-red/20 border border-dispatch-red/40 text-[9px] font-bold text-dispatch-red uppercase tracking-wider shrink-0">
                      Founder
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 truncate">{displayEmail ?? 'Guest account'}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm">{rank.icon}</span>
                  <span className="text-xs font-semibold text-white">{rank.title}</span>
                  <span className="text-[10px] text-gray-500">· Lv {player?.level ?? 1}</span>
                </div>
              </div>
            </div>

            {/* Edit identity */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Display Identity</p>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Display name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  className="w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-cyan/60"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1.5">Avatar</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVATARS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAvatar(a)}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center border transition-all ${
                        avatar === a
                          ? 'bg-dispatch-cyan/20 border-dispatch-cyan/60 scale-110'
                          : 'bg-gray-900 border-gray-700/60 hover:border-gray-500'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={save}
                className="w-full px-3 py-2 bg-dispatch-cyan text-gray-950 text-xs font-bold rounded-lg hover:bg-cyan-400 transition-colors"
              >
                {saved ? 'Saved ✓' : 'Save Profile'}
              </button>
            </div>

            {/* Guest → account upgrade */}
            {isGuest && (
              <GuestUpgradeCard />
            )}

            {/* Level progress (v0.19 curve) */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Level Progress</p>
                {atMaxLevel && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-400 uppercase tracking-wider">
                    Max Level
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between text-[11px]">
                <span className="text-gray-300">Lv {level}</span>
                {atMaxLevel ? (
                  <span className="text-amber-400 font-semibold">Top of the ladder — {levelXp.toLocaleString()} XP banked</span>
                ) : (
                  <span className="text-gray-500">{levelXp.toLocaleString()} / {xpForNext.toLocaleString()} XP</span>
                )}
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-900 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${atMaxLevel ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-dispatch-cyan to-dispatch-red'}`}
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              {!atMaxLevel && (
                <p className="mt-1.5 text-[9px] text-gray-600">
                  {(xpForNext - levelXp).toLocaleString()} XP to Level {level + 1}
                </p>
              )}
            </div>

            {/* Rank progress */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Rank Progress</p>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-300">{rank.icon} {rank.title}</span>
                {next ? (
                  <span className="text-gray-500">{next.icon} {next.title} · Lv {next.minLevel}</span>
                ) : (
                  <span className="text-amber-400 font-semibold">Highest rank reached</span>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-900 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-dispatch-cyan to-dispatch-red"
                  style={{ width: `${next ? Math.min(100, (level / next.minLevel) * 100) : 100}%` }}
                />
              </div>
            </div>

            {/* Career records */}
            <div className="grid grid-cols-2 gap-2">
              <StatTile icon={<Siren className="w-3.5 h-3.5" />} label="Missions" value={String(career.missionsCompleted)} color="text-dispatch-green" />
              <StatTile icon={<Star className="w-3.5 h-3.5" />} label="Credits earned" value={career.totalCreditsEarned.toLocaleString()} color="text-amber-400" />
              <StatTile icon={<Shield className="w-3.5 h-3.5" />} label="Best response" value={fmtTime(career.bestResponseTime)} color="text-dispatch-cyan" />
              <StatTile icon={<HeartHandshake className="w-3.5 h-3.5" />} label="Mutual aid" value={String(career.mutualAidAnswered)} color="text-blue-400" />
            </div>

            {/* Redeem a promo code */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <Ticket className="w-3 h-3" /> Redeem a Promo Code
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="DHQ-XXXX-XXXX"
                  maxLength={40}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-white placeholder-gray-600 uppercase focus:outline-none focus:border-dispatch-cyan/60"
                />
                <button
                  onClick={redeem}
                  disabled={redeeming || !promoCode.trim()}
                  className="px-3 py-1.5 bg-dispatch-cyan text-gray-950 text-xs font-bold rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {redeeming ? '…' : 'Redeem'}
                </button>
              </div>
              {redeemMsg && (
                <p className={`mt-2 flex items-center gap-1.5 text-[10px] ${redeemMsg.ok ? 'text-green-400' : 'text-dispatch-red'}`}>
                  {redeemMsg.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                  {redeemMsg.text}
                </p>
              )}
              <p className="mt-1.5 text-[9px] text-gray-600">
                Balance: {player?.credits?.toLocaleString() ?? 0} credits · {levelXp.toLocaleString()} XP into Lv {level}{atMaxLevel ? ' (max)' : ''}
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function fmtTime(seconds: number): string {
  // Records keep their own guard (unset = Infinity); the clock itself is the
  // shared formatter so fractional response times never render as decimals.
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return formatTimer(seconds);
}

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
      <div className={`flex items-center gap-1.5 ${color} mb-1`}>
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base font-bold text-white">{value}</p>
    </div>
  );
}
