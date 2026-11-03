// ============================================
// Dispatch HQ — Social Panel
// ============================================
// Friends & profiles: search players by username, send friend requests,
// accept/decline incoming requests, and browse friends' profiles with their
// live rank. Refreshes on open and after every action.

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, X, UserPlus, Check, X as XIcon, Search, Trash2 } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { rankForLevel } from '@dispatch-hq/shared';
import { fetchSocial, searchPlayers, sendFriendRequest, respondFriendRequest, removeFriend, type SocialProfile } from '@/lib/apiClient';
import { loadSettings } from '@/utils/settings';

interface SocialPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SocialPanel({ isOpen, onClose }: SocialPanelProps) {
  const player = useGameStore((s) => s.player);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [incoming, setIncoming] = useState<SocialProfile[]>([]);
  const [outgoing, setOutgoing] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; username: string; level: number; xp: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSocial();
      setFriends(s.friends);
      setIncoming(s.incoming);
      setOutgoing(s.outgoing);
    } catch {
      // Server unreachable — keep whatever we have.
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, refresh]);

  const runSearch = useCallback(async (q: string) => {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      setResults(await searchPlayers(q.trim()));
    } catch {
      setResults([]);
    }
  }, []);

  const doSend = useCallback(async (username: string) => {
    setBusy(username);
    setError(null);
    try {
      await sendFriendRequest(username);
      await refresh();
      setQuery('');
      setResults([]);
    } catch (e) {
      setError((e as Error)?.message ?? 'Request failed');
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const doRespond = useCallback(async (fromId: string, accept: boolean) => {
    setBusy(fromId);
    try {
      await respondFriendRequest(fromId, accept);
      await refresh();
    } catch {
      setError('Could not update request');
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const doRemove = useCallback(async (friendId: string) => {
    setBusy(friendId);
    try {
      await removeFriend(friendId);
      await refresh();
    } catch {
      setError('Could not remove friend');
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  if (!isOpen) return null;
  const myAvatar = loadSettings().avatarEmoji || '🚨';

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
          className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Friends & Community</h2>
                <p className="text-[11px] text-gray-500">{friends.length} friends · {incoming.length} pending</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto">
            {error && (
              <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Add friend */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                <UserPlus className="w-3 h-3" /> Add a Friend
              </p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Search dispatch username…"
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                />
              </div>
              {results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.map((r) => {
                    const isFriend = friends.some((f) => f.id === r.id);
                    const isOutgoing = outgoing.includes(r.username);
                    const isMe = player?.id === r.id;
                    return (
                      <div key={r.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border border-gray-700/40 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{r.username}</p>
                          <p className="text-[11px] text-gray-500">{rankForLevel(r.level).icon} {rankForLevel(r.level).title} · Lv {r.level}</p>
                        </div>
                        {isMe ? (
                          <span className="text-[11px] text-gray-600">You</span>
                        ) : isFriend ? (
                          <span className="text-[11px] text-blue-400">Friend ✓</span>
                        ) : isOutgoing ? (
                          <span className="text-[11px] text-gray-500">Requested</span>
                        ) : (
                          <button
                            onClick={() => doSend(r.username)}
                            disabled={busy === r.username}
                            className="px-2.5 py-1 bg-blue-500 text-white text-[11px] font-bold rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
                          >
                            {busy === r.username ? '…' : 'Add'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {query.trim().length >= 2 && results.length === 0 && (
                <p className="mt-2 text-[11px] text-gray-600">No players found.</p>
              )}
            </div>

            {/* Incoming requests */}
            {incoming.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Requests ({incoming.length})</p>
                <div className="space-y-1.5">
                  {incoming.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/40 border border-amber-500/20 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                          <span>{r.avatarEmoji || '🚨'}</span> {r.username}
                        </p>
                        <p className="text-[11px] text-gray-500">{rankForLevel(r.level).icon} {rankForLevel(r.level).title} · Lv {r.level}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => doRespond(r.id, true)}
                          disabled={busy === r.id}
                          className="w-7 h-7 rounded-lg bg-dispatch-green text-gray-950 flex items-center justify-center hover:bg-emerald-400 transition-colors disabled:opacity-50"
                          title="Accept"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => doRespond(r.id, false)}
                          disabled={busy === r.id}
                          className="w-7 h-7 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition-colors disabled:opacity-50"
                          title="Decline"
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends list */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Friends ({friends.length})</p>
              {friends.length === 0 && (
                <div className="text-center py-6 bg-gray-800/30 border border-gray-800/40 rounded-xl">
                  <p className="text-2xl mb-1">🤝</p>
                  <p className="text-xs text-gray-400">No friends yet — search a username above to connect.</p>
                </div>
              )}
              <div className="space-y-1.5">
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/40 border border-gray-700/40 rounded-xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center text-base shrink-0">
                        {f.avatarEmoji || '🚨'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{f.username}</p>
                        <p className="text-[11px] text-gray-500">{rankForLevel(f.level).icon} {rankForLevel(f.level).title} · Lv {f.level}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => doRemove(f.id)}
                      disabled={busy === f.id}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Remove friend"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-gray-600 text-center">
              Signed in as <span className="text-gray-400">{player?.username ?? 'guest'}</span> · {myAvatar} profile
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
