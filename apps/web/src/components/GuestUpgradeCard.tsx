// ============================================
// Dispatch HQ — Guest Upgrade Card
// ============================================
// Shared "Create an Account" offer for guests: username/email/password plus
// the merge-consent checkbox that carries the guest campaign into the new
// identity. Used in the Profile modal and as a one-time prompt on the main
// menu. The server identifies the guest from their cookie — the client never
// sends a guest id.

import { useState } from 'react';
import { UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import type { Player } from '@dispatch-hq/shared';
import { resetSettingsCache, initSettings } from '@/utils/settings';
import { refreshSaveSlots } from '@/hooks/useSaveSystem';
import { api } from '@/lib/apiClient';
import { SignupPausedNotice } from './SignupPausedNotice';

interface GuestUpgradeCardProps {
  /** Show a "Maybe later" link that fires this callback (main menu prompt). */
  onDismiss?: () => void;
  /** Fired after a successful upgrade so the caller can refresh/close. */
  onUpgraded?: () => void;
}

export function GuestUpgradeCard({ onDismiss, onUpgraded }: GuestUpgradeCardProps) {
  const player = useGameStore((s) => s.player);
  const career = useGameStore((s) => s.career);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [merge, setMerge] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleUpgrade = async () => {
    if (upgrading) return;
    setUpgrading(true);
    setMsg(null);
    try {
      const res = await api.upgrade(username.trim(), email.trim(), password, merge);
      // Swap the identity but keep the live client-authoritative stats — the
      // server row can lag the session, and replacing them wholesale would
      // visibly roll back credits/XP earned this session (same convention as
      // promo redemption). The merged campaign + save live under the new
      // account server-side; refresh the slot cache so Continue sees it, and
      // reload settings for the new identity.
      const state = useGameStore.getState();
      const live = state.player;
      state.setPlayer({
        ...(live ?? {}),
        id: res.player.id,
        email: res.player.email,
        username: res.player.username,
      } as Player);
      resetSettingsCache();
      void initSettings().catch(() => {});
      void refreshSaveSlots().catch(() => {});
      setMsg({
        ok: true,
        text: res.merged
          ? 'Account created — your guest campaign was merged in. Welcome, Commander!'
          : 'Account created. You chose to start fresh — your guest campaign stays on this device.',
      });
      setPassword('');
      onUpgraded?.();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error)?.message ?? 'Upgrade failed — please try again' });
    } finally {
      setUpgrading(false);
    }
  };

  const border = 'border-amber-500/20';
  const focus = 'focus:border-amber-400/60';
  const submit = 'bg-amber-500 hover:bg-amber-400';

  return (
    <div className={`bg-gray-800/40 border ${border} rounded-xl p-4 space-y-2.5`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5`}>
        <UserPlus className="w-3 h-3" /> Create an Account
      </p>
      <p className="text-[10px] text-gray-400">
        Guest progress lives on this device. Create a real account so your city follows you anywhere — and keep everything you've built.
      </p>
      {/* Founder-closed signup gate: pause notice + live reopen countdown */}
      <SignupPausedNotice compact />
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={30}
          placeholder="Your call sign"
          className={`w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none ${focus}`}
        />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={`w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none ${focus}`}
        />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 block mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          className={`w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none ${focus}`}
        />
      </div>
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={merge}
          onChange={(e) => setMerge(e.target.checked)}
          className="mt-0.5 accent-amber-400"
        />
        <span className="text-[10px] text-gray-300 leading-snug">
          Merge my guest campaign — Lv {player?.level ?? 1} · {player?.credits?.toLocaleString() ?? 0} credits · {career.missionsCompleted} missions cleared — into this account.
        </span>
      </label>
      <button
        onClick={handleUpgrade}
        disabled={upgrading || !username.trim() || !email.trim() || password.length < 6}
        className={`w-full px-3 py-2 ${submit} text-gray-950 text-xs font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {upgrading ? 'Creating account…' : 'Create Account'}
      </button>
      {onDismiss && !msg?.ok && (
        <button
          onClick={onDismiss}
          className="w-full text-center text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Maybe later — I'll keep playing as a guest
        </button>
      )}
      {msg && (
        <p className={`flex items-center gap-1.5 text-[10px] ${msg.ok ? 'text-green-400' : 'text-dispatch-red'}`}>
          {msg.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
