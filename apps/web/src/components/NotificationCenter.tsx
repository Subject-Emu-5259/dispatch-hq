// ============================================
// Dispatch HQ — Notification Center
// ============================================
// Replaces centered toast pop-ups with a single dropdown/sheet tied to the
// top-bar bell. Notifications are de-duplicated and kept as a rolling history.

import { useState, useCallback, useRef, createContext, useContext, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, AlertTriangle, Info, X, Zap, Star, Building2, Megaphone, Radio, Siren, Bell,
  Mail, Inbox as InboxIcon, Trash2, CheckCheck, Wrench,
} from 'lucide-react';
import {
  fetchInbox, markInboxRead as markInboxReadApi, markInboxAllRead as markInboxAllReadApi,
  deleteInboxMessage as deleteInboxApi, type InboxMessage,
} from '@/lib/apiClient';
import { useGameStore } from '../stores/gameStore';
import { DisasterStatusStrip } from './DisasterBanner';
import { WeatherStatusStrip } from './WeatherStatusStrip';

export type NotificationType = 'success' | 'warning' | 'error' | 'info' | 'xp' | 'levelup' | 'station' | 'mission' | 'dispatch' | 'radio' | 'emergency';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  icon?: string;
  value?: string;
  service?: string;
  /** Partial-coverage suggestions (e.g. a patrol intercept that needs backup) render dimmed. */
  dimmed?: boolean;
  read: boolean;
  createdAt: number;
  action?: () => void;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  removeNotification: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
  // Persistent inbox (v0.22.x)
  inbox: InboxMessage[];
  inboxUnread: number;
  refreshInbox: () => void;
  markInboxRead: (id: string) => void;
  markInboxAllRead: () => void;
  deleteInbox: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

const DEDUPE_WINDOW_MS = 8000;
const MAX_HISTORY = 50;

const STYLE: Record<NotificationType, { bg: string; border: string; iconColor: string; Icon: React.ElementType }> = {
  success: { bg: 'bg-green-900/80', border: 'border-green-500/30', iconColor: 'text-green-400', Icon: CheckCircle },
  warning: { bg: 'bg-amber-900/80', border: 'border-amber-500/30', iconColor: 'text-amber-400', Icon: AlertTriangle },
  error: { bg: 'bg-red-900/80', border: 'border-red-500/30', iconColor: 'text-red-400', Icon: AlertTriangle },
  info: { bg: 'bg-gray-800/80', border: 'border-gray-600/30', iconColor: 'text-gray-400', Icon: Info },
  xp: { bg: 'bg-emerald-900/80', border: 'border-emerald-500/30', iconColor: 'text-emerald-400', Icon: Star },
  levelup: { bg: 'bg-purple-900/80', border: 'border-purple-500/30', iconColor: 'text-purple-400', Icon: Star },
  station: { bg: 'bg-red-900/80', border: 'border-red-500/30', iconColor: 'text-red-400', Icon: Building2 },
  mission: { bg: 'bg-amber-900/80', border: 'border-amber-500/30', iconColor: 'text-amber-400', Icon: Zap },
  dispatch: { bg: 'bg-blue-900/80', border: 'border-blue-500/30', iconColor: 'text-blue-400', Icon: Megaphone },
  radio: { bg: 'bg-cyan-900/80', border: 'border-cyan-500/30', iconColor: 'text-cyan-400', Icon: Radio },
  emergency: { bg: 'bg-red-950/90', border: 'border-red-500/50', iconColor: 'text-red-400', Icon: Siren },
};

const SERVICE_BADGE: Record<string, { label: string; color: string }> = {
  fire: { label: 'FIRE', color: 'text-red-400 bg-red-500/20' },
  police: { label: 'POLICE', color: 'text-blue-400 bg-blue-500/20' },
  ems: { label: 'EMS', color: 'text-green-400 bg-green-500/20' },
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const counterRef = useRef(0);
  const lastDedupeRef = useRef<Map<string, number>>(new Map());

  // ── Persistent inbox (v0.22.x) — server-side messages. Fetched on mount,
  // on every focus/visibility-return, and on a slow poll so new admin
  // broadcasts land without a reload even while playing. Gated on a signed-in
  // player: with no session the /inbox calls would 401 every poll (and the
  // bell only exists in-game anyway).
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const [inboxUnread, setInboxUnread] = useState(0);
  const player = useGameStore((s) => s.player);
  const refreshInbox = useCallback(async () => {
    if (!useGameStore.getState().player) return;
    try {
      const res = await fetchInbox();
      setInbox(res.messages);
      setInboxUnread(res.unreadCount);
    } catch {
      // Best-effort — the game still works offline; the next poll retries.
    }
  }, []);
  useEffect(() => {
    if (!player) return;
    void refreshInbox();
    const timer = setInterval(() => void refreshInbox(), 45_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshInbox();
    };
    // The server fires 'dhq:inbox-refresh' the moment a maintenance window
    // flips (WS message landed), so the bell badge appears immediately instead
    // of waiting for the next 45s poll (v0.22.18).
    const onInboxRefresh = () => void refreshInbox();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('dhq:inbox-refresh', onInboxRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('dhq:inbox-refresh', onInboxRefresh);
    };
  }, [player, refreshInbox]);

  const markInboxRead = useCallback((id: string) => {
    setInbox((prev) => prev.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)));
    setInboxUnread((u) => Math.max(0, u - 1));
    void markInboxReadApi(id).catch(() => {});
  }, []);
  const markInboxAllRead = useCallback(() => {
    setInbox((prev) => prev.map((m) => ({ ...m, readAt: m.readAt ?? new Date().toISOString() })));
    setInboxUnread(0);
    void markInboxAllReadApi().catch(() => {});
  }, []);
  const deleteInbox = useCallback((id: string) => {
    setInbox((prev) => prev.filter((m) => m.id !== id));
    void deleteInboxApi(id).catch(() => {});
  }, []);

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => {
    // Dedupe by source/type/title so tiny message differences (distances, names) don't bypass the window.
    const key = `${n.type}|${n.title}|${n.service || ''}`;
    const now = Date.now();
    const last = lastDedupeRef.current.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) {
      return;
    }
    // Prune stale keys occasionally to keep the map bounded.
    if (lastDedupeRef.current.size > 200) {
      for (const [k, v] of lastDedupeRef.current) {
        if (now - v > DEDUPE_WINDOW_MS) lastDedupeRef.current.delete(k);
      }
    }
    lastDedupeRef.current.set(key, now);

    counterRef.current += 1;
    const id = `ntf_${counterRef.current}_${now}`;
    const item: Notification = { ...n, id, read: false, createdAt: now };

    setNotifications((prev) => {
      const next = [item, ...prev].slice(0, MAX_HISTORY);
      return next;
    });

    if (n.duration && n.duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.map((p) => p.id === id ? { ...p, read: true } : p));
      }, n.duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    addNotification,
    removeNotification,
    markRead,
    markAllRead,
    clearNotifications,
    inbox,
    inboxUnread,
    refreshInbox,
    markInboxRead,
    markInboxAllRead,
    deleteInbox,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/**
 * Classify an inbox note as a maintenance notice by its title (the exact
 * titles the server writes: "🛠️ Maintenance Started" / "✅ Online Restored").
 * Maintenance notes get amber/emerald highlighting in the inbox so players
 * returning after a window see the notice at a glance (v0.22.18).
 */
export function maintenanceNoteKind(title: string): 'started' | 'restored' | null {
  if (title.startsWith('🛠️')) return 'started';
  if (title.startsWith('✅')) return 'restored';
  return null;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const {
    notifications, unreadCount, removeNotification, markRead, markAllRead, clearNotifications,
    inbox, inboxUnread, markInboxRead, markInboxAllRead, deleteInbox,
  } = useNotifications();
  const [tab, setTab] = useState<'alerts' | 'inbox'>('alerts');
  const totalUnread = unreadCount + inboxUnread;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-12 right-0 bottom-0 w-full max-w-sm z-[65] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-bold text-white">Notifications</h2>
                {totalUnread > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-dispatch-red text-white text-[10px] font-bold rounded-full">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {tab === 'alerts' && notifications.length > 0 && (
                  <>
                    <button
                      onClick={markAllRead}
                      className="px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                    >
                      Mark read
                    </button>
                    <button
                      onClick={clearNotifications}
                      className="px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                    >
                      Clear
                    </button>
                  </>
                )}
                {tab === 'inbox' && inboxUnread > 0 && (
                  <button
                    onClick={markInboxAllRead}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800/50">
              <button
                onClick={() => setTab('alerts')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                  tab === 'alerts' ? 'text-white border-dispatch-red' : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <Bell className="w-3.5 h-3.5" /> Alerts
                {unreadCount > 0 && (
                  <span className="min-w-[16px] h-4 px-1 flex items-center justify-center bg-dispatch-red text-white text-[9px] font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('inbox')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                  tab === 'inbox' ? 'text-white border-dispatch-cyan' : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                <InboxIcon className="w-3.5 h-3.5" /> Inbox
                {inboxUnread > 0 && (
                  <span className="min-w-[16px] h-4 px-1 flex items-center justify-center bg-dispatch-cyan text-gray-950 text-[9px] font-bold rounded-full">
                    {inboxUnread}
                  </span>
                )}
              </button>
            </div>

            {tab === 'inbox' ? (
              <div className="flex-1 overflow-y-auto p-2 space-y-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                {inbox.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Mail className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs">Inbox zero — admin broadcasts and system mail land here</p>
                  </div>
                ) : (
                  inbox.map((m) => {
                    const unread = !m.readAt;
                    const maint = maintenanceNoteKind(m.title);
                    const kindChip = maint === 'started'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : maint === 'restored'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : unread
                          ? 'bg-dispatch-cyan/10 border-dispatch-cyan/30'
                          : 'bg-gray-800/30 border-gray-800/30 opacity-70';
                    const kindIcon = maint
                      ? (maint === 'started' ? 'text-amber-400' : 'text-emerald-400')
                      : unread ? 'text-dispatch-cyan' : 'text-gray-600';
                    const kindTitle = maint ? 'text-amber-300' : (unread ? 'text-white' : 'text-gray-400');
                    const kindBody = maint ? 'text-amber-200/80' : (unread ? 'text-gray-300' : 'text-gray-600');
                    return (
                      <motion.div
                        layout
                        key={m.id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        onClick={() => markInboxRead(m.id)}
                        className={`relative p-3 rounded-xl border transition-all cursor-pointer ${kindChip}`}
                      >
                        {unread && (
                          <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full animate-pulse ${maint === 'started' ? 'bg-amber-400' : maint === 'restored' ? 'bg-emerald-400' : 'bg-dispatch-cyan'}`} />
                        )}
                        <div className="flex items-start gap-2.5">
                          {maint ? (
                            <Wrench className={`w-4 h-4 mt-0.5 shrink-0 ${kindIcon}`} />
                          ) : (
                            <Mail className={`w-4 h-4 mt-0.5 shrink-0 ${kindIcon}`} />
                          )}
                          <div className="min-w-0 flex-1 pr-4">
                            <p className={`text-xs font-semibold truncate ${kindTitle}`}>
                              {m.title}
                            </p>
                            <p className={`text-[11px] mt-0.5 leading-relaxed ${kindBody}`}>
                              {m.body}
                            </p>
                            <p className="text-[9px] text-gray-600 mt-1">{timeAgo(Date.parse(m.createdAt))}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteInbox(m.id); }}
                            className="shrink-0 p-1 hover:bg-white/10 rounded transition-colors mt-0.5"
                            title="Delete message"
                          >
                            <Trash2 className="w-3 h-3 text-gray-500" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* Active severe weather + disaster / recovery — pinned at the top
                  of Alerts so the emergency never hides below older items. The
                  floating map banner moved into this tab (v0.22.13), and severe
                  weather gets the same live strip next to it (v0.22.16). */}
              <div className="flex flex-col gap-2 mb-1">
                <WeatherStatusStrip />
                <DisasterStatusStrip />
              </div>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const style = STYLE[n.type];
                  const badge = n.service ? SERVICE_BADGE[n.service] : null;
                  const Icon = style.Icon;
                  return (
                    <motion.div
                      layout
                      key={n.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => {
                        markRead(n.id);
                        if (n.action) n.action();
                      }}
                      className={`
                        relative p-3 rounded-xl border transition-all cursor-pointer
                        ${n.read ? 'bg-gray-800/30 border-gray-800/30 opacity-70' : `${style.bg} ${style.border} ${n.dimmed ? 'opacity-60 border-dashed' : ''}`}
                      `}
                    >
                      {!n.read && (
                        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-dispatch-red animate-pulse" />
                      )}
                      <div className="flex items-start gap-2.5">
                        <div className="shrink-0 mt-0.5">
                          {n.icon ? (
                            <span className="text-base">{n.icon}</span>
                          ) : (
                            <Icon className={`w-4 h-4 ${style.iconColor}`} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pr-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-xs font-semibold truncate ${n.read ? 'text-gray-400' : 'text-white'}`}>
                              {n.title}
                            </p>
                            {n.value && (
                              <span className="text-[10px] font-mono font-bold text-amber-400">{n.value}</span>
                            )}
                            {badge && (
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wider ${badge.color}`}>
                                {badge.label}
                              </span>
                            )}
                          </div>
                          {n.message && (
                            <p className={`text-[11px] mt-0.5 line-clamp-2 ${n.read ? 'text-gray-600' : 'text-gray-400'}`}>
                              {n.message}
                            </p>
                          )}
                          <p className="text-[9px] text-gray-600 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                          className="shrink-0 p-1 hover:bg-white/10 rounded transition-colors mt-0.5"
                        >
                          <X className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
