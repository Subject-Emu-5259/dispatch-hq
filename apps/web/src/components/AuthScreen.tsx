// ============================================
// Dispatch HQ — Auth Screen
// ============================================
// Login / Register / Quick Play (guest) screen. On success the JWT is
// stored and the player is pushed into the game store, then onAuthed
// is called so the parent can advance to the menu.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Zap, Play, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useGameStore } from '../stores/gameStore';
import { hasSaveGame, refreshSaveSlots, loadGame } from '../hooks/useSaveSystem';
import { initSettings, resetSettingsCache } from '../utils/settings';
import { useNotifications } from './NotificationCenter';
import { SignupPausedNotice } from './SignupPausedNotice';
import {
  SESSION_RESET_NOTICE,
  sessionResetFlagValue,
  markSessionResetNoticeShown,
  shouldShowSessionResetNotice,
} from '../lib/sessionNotice';
import type { Player } from '@dispatch-hq/shared';

type AuthMode = 'login' | 'register';

interface AuthScreenProps {
  onAuthed: () => void;
}

export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const setPlayer = useGameStore((s) => s.setPlayer);
  const { addNotification } = useNotifications();

  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    let mounted = true;
    refreshSaveSlots()
      .then(() => mounted && setHasSave(hasSaveGame()))
      .catch(() => mounted && setHasSave(false));
    return () => { mounted = false; };
  }, []);

  // One-time notice after the pre-launch session-key rotation (v0.22.17):
  // only an explicit LOGIN re-establishes a pre-rotation account, so only
  // that path may queue it — once per browser, only for accounts that
  // existed before the rotation day.
  const handleSessionResetNotice = (player: Player) => {
    if (!shouldShowSessionResetNotice(player, sessionResetFlagValue())) return;
    markSessionResetNoticeShown();
    addNotification({
      type: SESSION_RESET_NOTICE.type,
      title: SESSION_RESET_NOTICE.title,
      message: SESSION_RESET_NOTICE.message,
      icon: SESSION_RESET_NOTICE.icon,
      duration: SESSION_RESET_NOTICE.duration,
    });
  };

  const handleSuccess = async (player: Player, { isLogin = false }: { isLogin?: boolean } = {}) => {
    setPlayer(player);
    if (isLogin) handleSessionResetNotice(player);
    // Settings hydrate once per module lifetime and the boot-time fetch may
    // have run before this login (defaults cached). Drop the cached snapshot
    // and re-fetch so the authenticated player's own settings load on the menu
    // screen — otherwise returning players would see their preferences "reset".
    // Await (with a cap) so the menu can't render defaults a user might then
    // save over their real settings.
    resetSettingsCache();
    await Promise.race([
      initSettings(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    onAuthed();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(username, email, password);
      await handleSuccess(res.player, { isLogin: mode === 'login' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      const res = await api.guest();
      await handleSuccess(res.player);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setGuestLoading(false);
    }
  };

  const handleContinue = async () => {
    setError(null);
    setContinueLoading(true);
    try {
      const result = await loadGame();
      if (result === 'loaded') {
        onAuthed();
      } else if (result === 'error') {
        setError('Could not reach the dispatch cloud. Check your connection and try again.');
      } else {
        setError('No saved game found. Start a new game with Quick Play.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue game');
    } finally {
      setContinueLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-gray-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md bg-gray-900 border border-gray-800/60 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <img
            src="/logo.png?v=13"
            alt="Dispatch HQ"
            className="w-20 h-20 rounded-full object-cover border border-gray-700/50 shadow-xl shadow-dispatch-red/20 mx-auto mb-4"
          />
          <h1 className="text-2xl font-black text-white tracking-tight">Dispatch HQ</h1>
          <p className="text-gray-500 text-xs mt-1 font-medium">Command the chaos</p>
        </div>

        {/* Continue / Quick Play */}
        <div className="px-8 pb-4 space-y-2">
          {hasSave && (
            <motion.button
              whileHover={{ scale: continueLoading ? 1 : 1.01 }}
              whileTap={{ scale: continueLoading ? 1 : 0.99 }}
              onClick={handleContinue}
              disabled={continueLoading || guestLoading || loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white
                         bg-dispatch-blue hover:bg-dispatch-blue/90 disabled:opacity-60 transition-colors"
            >
              {continueLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              {continueLoading ? 'Loading...' : 'Continue Game'}
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: guestLoading ? 1 : 1.01 }}
            whileTap={{ scale: guestLoading ? 1 : 0.99 }}
            onClick={handleGuest}
            disabled={guestLoading || loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white
                       bg-dispatch-green hover:bg-dispatch-green/90 disabled:opacity-60 transition-colors"
          >
            {guestLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5" />
            )}
            {guestLoading ? 'Connecting...' : 'Quick Play'}
          </motion.button>
          <p className="text-center text-[10px] text-gray-600 mt-2">
            {hasSave ? 'Pick up where you left off, or start fresh as a guest.' : 'Jump in as a guest — progress saved per device.'}
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-8 py-2">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-[10px] text-gray-600 font-medium">OR</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Mode toggle */}
        <div className="px-8 pt-2 pb-3">
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-800/50 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <LogIn className="w-4 h-4" /> Login
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'register' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <UserPlus className="w-4 h-4" /> Register
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-3">
          {/* Founder-closed signup gate: pause notice + live reopen countdown */}
          {mode === 'register' && <SignupPausedNotice />}
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] text-gray-400 font-medium mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                placeholder="ChiefOperator"
                className="w-full px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50 text-white
                           placeholder:text-gray-600 text-sm focus:outline-none focus:border-gray-500"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] text-gray-400 font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@dispatch.gov"
              className="w-full px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50 text-white
                         placeholder:text-gray-600 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700/50 text-white
                         placeholder:text-gray-600 text-sm focus:outline-none focus:border-gray-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <motion.button
            type="submit"
            whileHover={{ scale: loading ? 1 : 1.01 }}
            whileTap={{ scale: loading ? 1 : 0.99 }}
            disabled={loading || guestLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white
                       bg-gray-700 hover:bg-gray-600 disabled:opacity-60 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-5 h-5" />
            ) : (
              <UserPlus className="w-5 h-5" />
            )}
            {loading ? 'Connecting...' : mode === 'login' ? 'Login' : 'Create Account'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
