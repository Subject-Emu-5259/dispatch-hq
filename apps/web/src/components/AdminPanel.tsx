// ============================================
// Dispatch HQ — Admin Console
// ============================================
// Founder-only console: city-wide totals, citywide broadcasts, bug-report
// triage, direct player bonuses (XP/credits/coins/levels), and a promo code
// manager. Access is enforced server-side (admin email allow-list); this modal
// only renders content when the overview fetch succeeds — everyone else sees
// an access-denied state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, X, Users, Radio, Bug, Wifi, Megaphone, ChevronDown, CheckCircle2,
  UserRound, MessageSquare, Gift, Ticket, Copy, Zap, Coins, TrendingUp, History, Trophy, ShoppingCart,
  RefreshCw, Search, Wrench, Power, CalendarClock, XCircle, Download,
} from 'lucide-react';
import {
  fetchAdminOverview, fetchAdminOnline, fetchAdminBugReports, updateAdminBugReport, adminBroadcast,
  createPromoCode, fetchAdminPromoCodes, fetchAdminRedemptions, updatePromoCode, adminGrantBonus,
  fetchAdminUpgrades, fetchAdminSeasonalContests, adminAwardSeasonalWinner,
  fetchMaintenanceState, setMaintenanceState, scheduleMaintenanceState,
  fetchSignupGateState, setSignupGateState,
  fetchAnalyticsSummary, fetchAdminRateLimit, fetchAdminShopOrders, adminFulfillShopOrder, fetchAdminCoinTransactions,
  type AdminOverview, type AdminOnlinePlayer, type AdminBugReport, type BugReportCounts, type BugReportStatus,
  type AdminRateLimit, type AdminShopOrder, type AdminShopSummary, type ShopOrderStatus,
  type AdminCoinTransaction, type AdminCoinSummary, type CoinTransactionReason,
  type AdminPromoCode, type AdminRedemption, type AdminUpgradeAudit, type PromoRewards,
  type AdminSeasonalContest, type MaintenanceState, type SignupGateState, type AnalyticsSummary,
} from '@/lib/apiClient';
import type { PresenceActivity } from '@dispatch-hq/shared';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type LoadState = 'loading' | 'ok' | 'denied' | 'error';
type AdminTab = 'overview' | 'broadcast' | 'triage' | 'bonus' | 'promos' | 'upgrades' | 'contests' | 'shop';

const STATUS_META: Record<BugReportStatus, { label: string; chip: string }> = {
  new: { label: 'New', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  investigating: { label: 'Investigating', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  fixed: { label: 'Fixed', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

const REPORT_STATUSES: BugReportStatus[] = ['new', 'investigating', 'fixed'];

// Shop order statuses (v0.31.x): pending manual orders are fulfillable from the
// Orders & Revenue tab; paid = Stripe-charged but not yet swept by the webhook.
const ORDER_STATUS_META: Record<ShopOrderStatus, { label: string; chip: string }> = {
  pending: { label: 'Pending', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  paid: { label: 'Paid', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  fulfilled: { label: 'Fulfilled', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  refunded: { label: 'Refunded', chip: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
  failed: { label: 'Failed', chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

function orderStatusChip(status: ShopOrderStatus) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.pending;
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

/** "$12.99"-style dollars from an integer cents value (revenue readout). */
function formatCents(cents: number): string {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

// Coin-transaction reasons (v0.31.x): purchase (pack) / spend (skip + credits)
// today, promo/admin/refund reserved for the grant and refund paths.
const COIN_REASON_META: Record<CoinTransactionReason, { label: string; chip: string }> = {
  purchase: { label: 'Purchase', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  spend: { label: 'Spend', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  promo: { label: 'Promo', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  admin: { label: 'Admin', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  refund: { label: 'Refund', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
};

function coinReasonChip(reason: string) {
  const meta = COIN_REASON_META[reason as CoinTransactionReason]
    ?? { label: reason, chip: 'bg-gray-800 text-gray-400 border-gray-700' };
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

// Same activity labeling as the Commanders Online panel — the admin roster
// shows what each connected player is doing, not just a green dot.
const PRESENCE_META: Record<PresenceActivity, { label: string; icon: string; chip: string }> = {
  in_mission: { label: 'In a mission', icon: '🚨', chip: 'bg-red-500/15 text-red-400 border-red-500/30' },
  patrolling: { label: 'Patrolling', icon: '🚔', chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  idle: { label: 'Idle', icon: '💤', chip: 'bg-gray-700/40 text-gray-400 border-gray-600/40' },
};

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Users className="w-3 h-3" /> },
  { id: 'broadcast', label: 'Broadcast', icon: <Megaphone className="w-3 h-3" /> },
  { id: 'triage', label: 'Bug Triage', icon: <Bug className="w-3 h-3" /> },
  { id: 'bonus', label: 'Bonuses', icon: <Gift className="w-3 h-3" /> },
  { id: 'promos', label: 'Promo Codes', icon: <Ticket className="w-3 h-3" /> },
  { id: 'upgrades', label: 'Upgrade Audit', icon: <History className="w-3 h-3" /> },
  { id: 'contests', label: 'Contests', icon: <Trophy className="w-3 h-3" /> },
  { id: 'shop', label: 'Orders & Revenue', icon: <ShoppingCart className="w-3 h-3" /> },
];

function reportStatusChip(status: BugReportStatus) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

/** "3m ago" / "2h ago" relative time for the throttle offender list. */
function formatAgo(epochMs: number | null): string {
  if (!epochMs) return '—';
  const diff = Math.max(0, Date.now() - epochMs);
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

/** "2m 30s"-style average session length for the analytics row. */
function formatSessionDuration(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** RFC-4180-safe CSV cell. */
function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a downloadable CSV of the trailing-7-day summary + per-type breakdown. */
function buildAnalyticsCsv(a: AnalyticsSummary): string {
  const rows: (string | number)[][] = [
    ['metric', 'value'],
    ['sessions', a.sessions],
    ['avg_duration_seconds', a.avgDurationSeconds],
    ['missions_completed', a.missionsCompleted],
    ['avg_response_seconds', a.avgResponseTimeSeconds],
    [],
    ['mission_type', 'category', 'count', 'avg_response_seconds', 'p50_seconds', 'p90_seconds', 'p99_seconds'],
  ];
  for (const t of a.missionsByType ?? []) {
    rows.push([t.type, t.category ?? '', t.count, t.avgResponseTimeSeconds, t.p50ResponseTimeSeconds, t.p90ResponseTimeSeconds, t.p99ResponseTimeSeconds]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Trigger a client-side CSV download of the analytics summary. */
function downloadAnalyticsCsv(a: AnalyticsSummary): void {
  const blob = new Blob([buildAnalyticsCsv(a)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dispatch-hq-analytics-7d.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  // Opt-in session analytics (v0.24.0): trailing-7-day activity, founder-gated.
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  // 429-throttle observability (v0.30.0): route + offender counters.
  const [rateLimit, setRateLimit] = useState<AdminRateLimit | null>(null);
  // Per-type breakdown: show 6 by default, expand on demand.
  const [showAllTypes, setShowAllTypes] = useState(false);

  // Player list: guests (guest_xxx@dispatchhq.game) are hidden by default so
  // the list shows real accounts only; the toggle reveals them.
  const [showGuests, setShowGuests] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const guestCount = overview?.counts?.guests ?? 0;
  const visiblePlayers = useMemo(() => {
    const list = overview?.recentPlayers ?? [];
    if (showGuests) return list;
    return list.filter((p) => !(p.email ?? '').toLowerCase().startsWith('guest_'));
  }, [overview?.recentPlayers, showGuests]);
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return visiblePlayers;
    return visiblePlayers.filter((p) => (p.username ?? '').toLowerCase().includes(q));
  }, [visiblePlayers, playerSearch]);

  // Online Now: live WS presence, polled while the overview tab is open.
  const [onlineNow, setOnlineNow] = useState<AdminOnlinePlayer[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Maintenance mode (v0.23): pause the online (multiplayer) layer for
  // maintenance / network work. Every connected client is told live.
  const [maintenance, setMaintenanceStateLocal] = useState<MaintenanceState>({ maintenance: false, reason: null, since: null, scheduledAt: null });
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Scheduled maintenance (v0.22.18): arm a window and let the server flip it.
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // New-signup gate: stop NEW account creation (register + guest upgrade)
  // while login/guest play keep working. Default open — off until flipped.
  // Optional auto-reopen: arming a datetime shows players a live countdown.
  const [signupGate, setSignupGateLocal] = useState<SignupGateState>({ open: true, since: null, reopensAt: null });
  const [signupGateReopenAt, setSignupGateReopenAt] = useState('');
  const [signupGateBusy, setSignupGateBusy] = useState(false);
  const [signupGateMsg, setSignupGateMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Jump to the Bonuses tab with a player prefilled (click a roster row).
  const quickGrant = useCallback((username: string) => {
    setBonusUsername(username);
    setTab('bonus');
  }, []);

  // Broadcast
  const [broadcastKind, setBroadcastKind] = useState<'psa' | 'notice' | 'message'>('notice');
  const [title, setTitle] = useState('Citywide Notice');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState<string | null>(null);

  // Bug triage
  const [bugReports, setBugReports] = useState<AdminBugReport[]>([]);
  const [reportCounts, setReportCounts] = useState<BugReportCounts>({ new: 0, investigating: 0, fixed: 0 });
  const [newThisWeek, setNewThisWeek] = useState(0);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportOrder, setReportOrder] = useState<'oldest' | 'newest'>('oldest');
  const [reportFilter, setReportFilter] = useState<'all' | 'unassigned'>('all');
  const [triageBusy, setTriageBusy] = useState<string | null>(null);
  const [triageMsg, setTriageMsg] = useState<string | null>(null);
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const bugReportsRef = useRef<AdminBugReport[]>([]);
  bugReportsRef.current = bugReports;

  // Bonuses
  const [bonusUsername, setBonusUsername] = useState('');
  const [bonusDrafts, setBonusDrafts] = useState<Record<string, string>>({});
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusMsg, setBonusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bonusRewards = useMemoPromoRewards(bonusDrafts);

  // Guest upgrade audit
  const [upgrades, setUpgrades] = useState<AdminUpgradeAudit[]>([]);
  const [upgradesLoading, setUpgradesLoading] = useState(false);

  // Seasonal contests
  const [contests, setContests] = useState<AdminSeasonalContest[]>([]);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [contestSelections, setContestSelections] = useState<Record<string, string>>({});
  const [contestArmed, setContestArmed] = useState<string | null>(null);
  const [contestAwardBusy, setContestAwardBusy] = useState<string | null>(null);
  const [contestMsg, setContestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Shop orders & revenue (v0.31.x): manual fulfillment + a money readout.
  const [orders, setOrders] = useState<AdminShopOrder[]>([]);
  const [shopSummary, setShopSummary] = useState<AdminShopSummary | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [fulfillBusy, setFulfillBusy] = useState<string | null>(null);
  const [shopMsg, setShopMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Coin-transaction ledger (v0.31.x): audit every spend/purchase/grant.
  const [coinTx, setCoinTx] = useState<AdminCoinTransaction[]>([]);
  const [coinSummary, setCoinSummary] = useState<AdminCoinSummary | null>(null);
  const [coinTxLoading, setCoinTxLoading] = useState(false);

  // Promo codes
  const [promos, setPromos] = useState<AdminPromoCode[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [redemptions, setRedemptions] = useState<AdminRedemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoLabel, setNewPromoLabel] = useState('');
  const [newPromoXp, setNewPromoXp] = useState('');
  const [newPromoCredits, setNewPromoCredits] = useState('');
  const [newPromoCoins, setNewPromoCoins] = useState('');
  const [newPromoLevels, setNewPromoLevels] = useState('');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('25');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const triage = useCallback(async (id: string, patch: { status?: BugReportStatus; assignee?: string | null; notes?: string | null }) => {
    if (triageBusy) return;
    setTriageBusy(id);
    setTriageMsg(null);
    try {
      const prev = bugReportsRef.current.find((r) => r.id === id);
      await updateAdminBugReport(id, patch);
      setBugReports((prevList) => {
        if (reportFilter === 'unassigned' && patch.assignee) {
          return prevList.filter((r) => r.id !== id);
        }
        return prevList.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            status: patch.status ?? r.status,
            assignee: patch.assignee !== undefined ? patch.assignee : r.assignee,
            notes: patch.notes !== undefined ? patch.notes : r.notes,
          };
        });
      });
      if (patch.status && prev && prev.status !== patch.status) {
        setReportCounts((c) => ({
          ...c,
          [prev.status]: Math.max(0, (c[prev.status] ?? 0) - 1),
          [patch.status as BugReportStatus]: (c[patch.status as BugReportStatus] ?? 0) + 1,
        }));
      }
      if (patch.notes !== undefined) {
        setNoteDrafts((d) => { const next = { ...d }; delete next[id]; return next; });
      }
      setTriageMsg('Report updated.');
    } catch (err) {
      setTriageMsg(`Update failed: ${(err as Error)?.message ?? 'unknown error'}`);
    } finally {
      setTriageBusy(null);
    }
  }, [triageBusy, reportFilter]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const data = await fetchAdminBugReports({ order: reportOrder, filter: reportFilter });
      setBugReports(Array.isArray(data.reports) ? data.reports : []);
      setReportCounts(data.counts ?? { new: 0, investigating: 0, fixed: 0 });
      setNewThisWeek(Number(data.newThisWeek) || 0);
    } catch {
      setBugReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [reportOrder, reportFilter]);

  const loadPromos = useCallback(async () => {
    setPromoLoading(true);
    try {
      setPromos(await fetchAdminPromoCodes());
    } catch {
      setPromos([]);
    } finally {
      setPromoLoading(false);
    }
  }, []);

  const loadRedemptions = useCallback(async () => {
    setRedemptionsLoading(true);
    try {
      setRedemptions(await fetchAdminRedemptions());
    } catch {
      setRedemptions([]);
    } finally {
      setRedemptionsLoading(false);
    }
  }, []);

  const loadUpgrades = useCallback(async () => {
    setUpgradesLoading(true);
    try {
      setUpgrades(await fetchAdminUpgrades());
    } catch {
      setUpgrades([]);
    } finally {
      setUpgradesLoading(false);
    }
  }, []);

  const loadContests = useCallback(async () => {
    setContestsLoading(true);
    try {
      setContests(await fetchAdminSeasonalContests());
    } catch {
      setContests([]);
    } finally {
      setContestsLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const data = await fetchAdminShopOrders();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setShopSummary(data.summary ?? null);
    } catch {
      setOrders([]);
      setShopSummary(null);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadCoinTransactions = useCallback(async () => {
    setCoinTxLoading(true);
    try {
      const data = await fetchAdminCoinTransactions();
      setCoinTx(Array.isArray(data.transactions) ? data.transactions : []);
      setCoinSummary(data.summary ?? null);
    } catch {
      setCoinTx([]);
      setCoinSummary(null);
    } finally {
      setCoinTxLoading(false);
    }
  }, []);

  const fulfillShopOrder = useCallback(async (orderId: string) => {
    if (fulfillBusy) return;
    setFulfillBusy(orderId);
    setShopMsg(null);
    try {
      const res = await adminFulfillShopOrder(orderId);
      setShopMsg({
        ok: res.ok,
        text: res.ok
          ? `Order fulfilled${res.coinsGranted != null ? ` — ${res.coinsGranted.toLocaleString()} coins granted` : ''}.`
          : (res.message ?? 'Fulfill failed.'),
      });
      await loadOrders();
    } catch (err) {
      setShopMsg({ ok: false, text: (err as Error)?.message ?? 'Fulfill failed.' });
    } finally {
      setFulfillBusy(null);
    }
  }, [fulfillBusy, loadOrders]);

  // Two-step award: first click arms, second click commits (no accidental awards).
  const awardContestWinner = useCallback(async (eventId: string) => {
    if (contestArmed !== eventId) {
      setContestArmed(eventId);
      return;
    }
    setContestArmed(null);
    setContestAwardBusy(eventId);
    setContestMsg(null);
    try {
      const res = await adminAwardSeasonalWinner(eventId, contestSelections[eventId] || undefined);
      setContestMsg({
        ok: true,
        text: `${res.winner.username} (${res.winner.calls} calls) is now the ${contestSelections[eventId] ? 'override ' : ''}winner${res.badgeAwarded ? ' — winner badge awarded' : ' (badge already earned)'}.`,
      });
      void loadContests();
    } catch (err) {
      setContestMsg({ ok: false, text: (err as Error)?.message ?? 'Award failed.' });
    } finally {
      setContestAwardBusy(null);
    }
  }, [contestArmed, contestSelections, loadContests]);

  const refresh = useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await fetchAdminOverview();
      if (!data || typeof data !== 'object' || !data.counts || !Array.isArray(data.recentPlayers)) {
        setLoadState('error');
        return;
      }
      setOverview(data);
      setLoadState('ok');
      setLastRefreshed(new Date());
      // Gate states ride along with the overview (v0.29.x) — no second fetch.
      // Fall back to the standalone endpoints only when the server hasn't
      // shipped the overview fields yet (older deploy).
      if (data.maintenance) {
        setMaintenanceStateLocal(data.maintenance);
      } else {
        try { setMaintenanceStateLocal(await fetchMaintenanceState()); } catch { /* non-fatal */ }
      }
      if (data.signupGate) {
        setSignupGateLocal(data.signupGate);
      } else {
        try { setSignupGateLocal(await fetchSignupGateState()); } catch { /* non-fatal */ }
      }
    } catch (err) {
      setLoadState((err as Error)?.message?.toLowerCase().includes('forbidden') ? 'denied' : 'error');
    }
    // Analytics summary rides along (non-fatal when absent or not opted in).
    try {
      setAnalytics(await fetchAnalyticsSummary());
    } catch {
      setAnalytics(null);
    }
    // Rate-limit readout rides along (non-fatal when the endpoint is absent
    // or the founder isn't authed — the card stays hidden).
    try {
      setRateLimit(await fetchAdminRateLimit());
    } catch {
      setRateLimit(null);
    }
  }, []);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  // Live "Online Now" roster — polls every 15s while the overview tab is open
  // so the console reflects who's connected without a manual refresh.
  useEffect(() => {
    if (!isOpen || tab !== 'overview') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await fetchAdminOnline();
        if (!cancelled) setOnlineNow(list);
      } catch {
        // Keep the last snapshot; a dead poll must not blank the list.
      }
    };
    void tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isOpen, tab]);

  useEffect(() => {
    if (tab === 'triage' && reportsOpen) void loadReports();
  }, [tab, reportsOpen, reportOrder, reportFilter, loadReports]);

  // isOpen in deps so reopening the modal on the promos tab refreshes both
  // the code list and the redemption log (otherwise stale until tab changes).
  useEffect(() => {
    if (tab === 'promos') {
      void loadPromos();
      void loadRedemptions();
    }
  }, [tab, isOpen, loadPromos, loadRedemptions]);

  // Same for the upgrade audit: refresh whenever the tab opens/reopens.
  useEffect(() => {
    if (tab === 'upgrades') void loadUpgrades();
  }, [tab, isOpen, loadUpgrades]);

  // And for the seasonal contests view.
  useEffect(() => {
    if (tab === 'contests') void loadContests();
  }, [tab, isOpen, loadContests]);

  // And the shop orders/revenue + coin ledger views.
  useEffect(() => {
    if (tab === 'shop') {
      void loadOrders();
      void loadCoinTransactions();
    }
  }, [tab, isOpen, loadOrders, loadCoinTransactions]);

  const sendBroadcast = useCallback(async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setSentInfo(null);
    try {
      const res = await adminBroadcast(title.trim() || 'Citywide Notice', message.trim(), broadcastKind);
      const kindLabel = res.kind ? res.kind.toUpperCase() : broadcastKind.toUpperCase();
      const chatNote = res.chatPosted ? ' posted to Public Chat.' : '';
      const inboxNote = (res.deliveredToInbox ?? 0) > 0
        ? ` Stored in ${res.deliveredToInbox} player inbox${res.deliveredToInbox === 1 ? '' : 'es'}.`
        : '';
      setSentInfo(`${kindLabel}${chatNote} Delivered to ${res.sentTo} connected player${res.sentTo === 1 ? '' : 's'}.${inboxNote}`);
      setMessage('');
    } catch (err) {
      setSentInfo(`Broadcast failed: ${(err as Error)?.message ?? 'unknown error'}`);
    } finally {
      setSending(false);
    }
  }, [message, title, sending, broadcastKind]);

  const grantBonus = useCallback(async () => {
    const username = bonusUsername.trim();
    if (!username || bonusBusy) return;
    if (Object.keys(bonusRewards).length === 0) {
      setBonusMsg({ ok: false, text: 'Enter at least one reward amount.' });
      return;
    }
    setBonusBusy(true);
    setBonusMsg(null);
    try {
      const res = await adminGrantBonus(username, bonusRewards);
      setBonusMsg({ ok: true, text: `Granted ${username}: ${summarizeRewards(res.granted)}.` });
      setBonusUsername('');
      setBonusDrafts({});
    } catch (err) {
      setBonusMsg({ ok: false, text: (err as Error)?.message ?? 'Grant failed' });
    } finally {
      setBonusBusy(false);
    }
  }, [bonusUsername, bonusRewards, bonusBusy]);

  const createPromo = useCallback(async () => {
    if (creatingPromo) return;
    const rewards: PromoRewards = {};
    if (newPromoXp) rewards.xp = Math.max(1, parseInt(newPromoXp, 10) || 0);
    if (newPromoCredits) rewards.credits = Math.max(1, parseInt(newPromoCredits, 10) || 0);
    if (newPromoCoins) rewards.coins = Math.max(1, parseInt(newPromoCoins, 10) || 0);
    if (newPromoLevels) rewards.level = Math.max(1, parseInt(newPromoLevels, 10) || 0);
    if (Object.keys(rewards).length === 0) {
      setPromoMsg({ ok: false, text: 'Enter at least one reward.' });
      return;
    }
    setCreatingPromo(true);
    setPromoMsg(null);
    try {
      const res = await createPromoCode({
        code: newPromoCode.trim() || undefined,
        label: newPromoLabel.trim() || undefined,
        rewards,
        maxUses: Math.max(1, parseInt(newPromoMaxUses, 10) || 1),
      });
      setPromoMsg({ ok: true, text: `Code ${res.code} created.` });
      setNewPromoCode(''); setNewPromoLabel(''); setNewPromoXp(''); setNewPromoCredits(''); setNewPromoCoins(''); setNewPromoLevels('');
      await loadPromos();
    } catch (err) {
      setPromoMsg({ ok: false, text: (err as Error)?.message ?? 'Create failed' });
    } finally {
      setCreatingPromo(false);
    }
  }, [creatingPromo, newPromoCode, newPromoLabel, newPromoXp, newPromoCredits, newPromoCoins, newPromoLevels, newPromoMaxUses, loadPromos]);

  const togglePromo = useCallback(async (p: AdminPromoCode) => {
    try {
      await updatePromoCode(p.id, { active: !p.active });
      setPromos((list) => list.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));
    } catch {
      setPromoMsg({ ok: false, text: 'Toggle failed' });
    }
  }, []);

  const toggleMaintenance = useCallback(async () => {
    if (maintenanceBusy) return;
    setMaintenanceBusy(true);
    setMaintenanceMsg(null);
    const turningOn = !maintenance.maintenance;
    try {
      const next = await setMaintenanceState(turningOn, maintenanceReason);
      setMaintenanceStateLocal(next);
      setMaintenanceMsg({
        ok: true,
        text: turningOn
          ? 'Maintenance active — the online (multiplayer) layer is paused. Connected players were notified live.'
          : 'Servers back online — players can reconnect to the multiplayer layer.',
      });
    } catch (err) {
      setMaintenanceMsg({ ok: false, text: (err as Error)?.message ?? 'Toggle failed' });
    } finally {
      setMaintenanceBusy(false);
    }
  }, [maintenance.maintenance, maintenanceReason, maintenanceBusy]);

  const scheduleMaintenance = useCallback(async () => {
    if (scheduleBusy) return;
    if (!scheduleAtLocal) {
      setScheduleMsg({ ok: false, text: 'Pick a start time first.' });
      return;
    }
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      // datetime-local → ISO (the browser's local time, server compares epoch).
      const next = await scheduleMaintenanceState(new Date(scheduleAtLocal).toISOString(), scheduleReason || undefined);
      setMaintenanceStateLocal(next);
      setScheduleMsg({ ok: true, text: `Armed for ${new Date(next.scheduledAt!).toLocaleString()}. The server flips automatically — no 2am toggle needed.` });
      setScheduleAtLocal('');
      setScheduleReason('');
    } catch (err) {
      setScheduleMsg({ ok: false, text: (err as Error)?.message ?? 'Schedule failed' });
    } finally {
      setScheduleBusy(false);
    }
  }, [scheduleBusy, scheduleAtLocal, scheduleReason]);

  const cancelScheduledMaintenance = useCallback(async () => {
    if (scheduleBusy) return;
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      const next = await scheduleMaintenanceState(null);
      setMaintenanceStateLocal(next);
      setScheduleMsg({ ok: true, text: 'Scheduled window cancelled.' });
    } catch (err) {
      setScheduleMsg({ ok: false, text: (err as Error)?.message ?? 'Cancel failed' });
    } finally {
      setScheduleBusy(false);
    }
  }, [scheduleBusy]);

  const toggleSignupGate = useCallback(async () => {
    if (signupGateBusy) return;
    setSignupGateBusy(true);
    setSignupGateMsg(null);
    const closing = signupGate.open; // flip: open → close, closed → open
    try {
      // While closing, arm the optional auto-reopen: datetime-local → ISO.
      // While reopening, always clear any armed time.
      const reopensAt = closing && signupGateReopenAt ? new Date(signupGateReopenAt).toISOString() : null;
      const next = await setSignupGateState(!signupGate.open, reopensAt);
      setSignupGateLocal(next);
      setSignupGateMsg({
        ok: true,
        text: closing
          ? (reopensAt
              ? `Signups paused — auto-reopen armed for ${new Date(reopensAt).toLocaleString()} (players see a live countdown).`
              : 'Signups paused indefinitely — new accounts are rejected (login & guest play keep working).')
          : 'Signups reopened — new players can create accounts again.',
      });
      setSignupGateReopenAt('');
    } catch (err) {
      setSignupGateMsg({ ok: false, text: (err as Error)?.message ?? 'Toggle failed' });
    } finally {
      setSignupGateBusy(false);
    }
  }, [signupGate.open, signupGateBusy, signupGateReopenAt]);

  const copyCode = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1200);
    } catch { /* clipboard unavailable */ }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-700/50 sticky top-0 bg-gray-900/95 backdrop-blur z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-dispatch-red/30 to-red-900/40 border border-dispatch-red/40 flex items-center justify-center shadow-lg shadow-dispatch-red/10">
                  <ShieldCheck className="w-4.5 h-4.5 text-dispatch-red" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                    Admin Console
                    <span className="px-1 py-px rounded bg-dispatch-red/20 border border-dispatch-red/40 text-[8px] font-bold text-dispatch-red uppercase tracking-wider">Founder</span>
                  </h2>
                  <p className="text-[10px] text-gray-500 truncate">City-wide operations · {overview?.founderEmail ?? 'deandrewh26@gmail.com'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="hidden sm:flex items-center gap-1.5 text-[9px] text-gray-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${(overview?.connectedNow ?? 0) > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                  {overview?.connectedNow ?? 0} online
                </span>
                {lastRefreshed && (
                  <span className="hidden md:block text-[9px] text-gray-600">
                    {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={() => void refresh()}
                  disabled={loadState === 'loading'}
                  title="Refresh"
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${loadState === 'loading' ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5">
              {loadState === 'loading' && (
                <p className="text-xs text-gray-400 text-center py-6 animate-pulse">Checking admin access…</p>
              )}

              {loadState === 'denied' && (
                <div className="text-center py-6">
                  <ShieldCheck className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white">Access Denied</p>
                  <p className="text-xs text-gray-500 mt-1">This console is restricted to admin accounts.</p>
                </div>
              )}

              {loadState === 'error' && (
                <div className="text-center py-6">
                  <p className="text-sm font-semibold text-white">Couldn't reach the server</p>
                  <p className="text-xs text-gray-500 mt-1">Try again when you're online.</p>
                  <button onClick={refresh} className="mt-4 px-4 py-1.5 bg-dispatch-red text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors">
                    Retry
                  </button>
                </div>
              )}

              {loadState === 'ok' && overview && (
                <div className="space-y-4">
                  {/* Tab nav */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {TABS.map((t) => {
                      const openCount = reportCounts.new + reportCounts.investigating;
                      const badge = t.id === 'triage' && openCount > 0 ? openCount : null;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTab(t.id)}
                          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all shrink-0 border ${
                            tab === t.id
                              ? 'bg-gradient-to-b from-dispatch-red/25 to-dispatch-red/10 text-dispatch-red border-dispatch-red/40 shadow-inner'
                              : 'bg-gray-800/50 text-gray-400 border-transparent hover:text-white hover:bg-gray-800'
                          }`}
                        >
                          {t.icon}
                          {t.label}
                          {badge != null && (
                            <span className="min-w-[14px] h-[14px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-gray-950 text-[8px] font-bold">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {tab === 'overview' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Tile accent="text-blue-400 bg-blue-500/15 border-blue-500/30" icon={<Users className="w-3.5 h-3.5" />} label="Players" value={overview.counts?.players ?? 0} />
                        <Tile accent="text-emerald-400 bg-emerald-500/15 border-emerald-500/30" icon={<Wifi className="w-3.5 h-3.5" />} label="Connected now" value={overview.connectedNow ?? 0} />
                        <Tile accent="text-amber-400 bg-amber-500/15 border-amber-500/30" icon={<Radio className="w-3.5 h-3.5" />} label="Active missions" value={overview.counts?.activeMissions ?? 0} />
                        <Tile accent="text-rose-400 bg-rose-500/15 border-rose-500/30" icon={<Bug className="w-3.5 h-3.5" />} label="Bug reports" value={overview.counts?.bugReports ?? 0} />
                      </div>

                      {/* Opt-in session analytics (v0.24.0): trailing-7-day activity */}
                      {analytics && (
                        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2">
                            <SectionTitle icon={<TrendingUp className="w-3 h-3 text-violet-400" />} label="Last 7 Days" sub="opt-in session analytics" />
                            <button
                              type="button"
                              onClick={() => downloadAnalyticsCsv(analytics)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border border-gray-600/50 bg-gray-800/60 text-gray-300 hover:text-white hover:border-gray-500 transition-colors shrink-0"
                              title="Download the summary + per-type breakdown as CSV"
                            >
                              <Download className="w-3 h-3" /> CSV
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            <div className="bg-gray-900/50 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Sessions</p>
                              <p className="text-base font-bold text-white tabular-nums">{analytics.sessions.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Avg duration</p>
                              <p className="text-base font-bold text-white tabular-nums">{formatSessionDuration(analytics.avgDurationSeconds)}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Missions cleared</p>
                              <p className="text-base font-bold text-white tabular-nums">{analytics.missionsCompleted.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Avg response</p>
                              <p className="text-base font-bold text-white tabular-nums">{formatSessionDuration(analytics.avgResponseTimeSeconds)}</p>
                            </div>
                          </div>
                          {analytics.missionsByType && analytics.missionsByType.length > 0 ? (
                            <div className="mt-2 space-y-1 border-t border-gray-800/50 pt-2">
                              {(showAllTypes ? analytics.missionsByType : analytics.missionsByType.slice(0, 6)).map((t) => (
                                <div key={t.type} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="text-gray-300 truncate">
                                    {t.type}
                                    {t.category && <span className="text-gray-500"> · {t.category}</span>}
                                  </span>
                                  <span className="text-gray-500 tabular-nums shrink-0 ml-2 whitespace-nowrap">
                                    {t.count} · p50 {formatSessionDuration(t.p50ResponseTimeSeconds)} · p90 {formatSessionDuration(t.p90ResponseTimeSeconds)} · p99 {formatSessionDuration(t.p99ResponseTimeSeconds)}
                                  </span>
                                </div>
                              ))}
                              {analytics.missionsByType.length > 6 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllTypes((v) => !v)}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-violet-300 hover:text-violet-200 transition-colors"
                                >
                                  {showAllTypes ? 'Show fewer' : `Show all ${analytics.missionsByType.length} types`}
                                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllTypes ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-[10px] text-gray-600 border-t border-gray-800/50 pt-2">
                              No mission activity recorded yet — clear a few calls and check back.
                            </p>
                          )}
                        </div>
                      )}

                      {/* 429-throttle observability (v0.30.0): which routes/keys the limiter has been blocking */}
                      {rateLimit && rateLimit.routes.length > 0 && (
                        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2">
                            <SectionTitle icon={<Zap className="w-3 h-3 text-amber-400" />} label="429 Throttles" sub="since server start" />
                            <span className="text-[9px] font-bold text-amber-300 tabular-nums bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                              {rateLimit.routes.reduce((s, r) => s + (r.blocked || 0), 0)} blocked
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {rateLimit.routes.slice(0, 8).map((r) => {
                              const hot = r.blocked > 0 && (r.allowed === 0 || r.blocked / r.allowed > 0.05);
                              return (
                                <div key={r.route} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className={`truncate ${hot ? 'text-amber-300' : 'text-gray-300'}`}>{r.route}</span>
                                  <span className={`tabular-nums shrink-0 whitespace-nowrap ${hot ? 'text-amber-400' : 'text-gray-500'}`}>
                                    {r.allowed} ok · {r.blocked} blocked{hot ? ' ⚠' : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {rateLimit.offenders.length > 0 && (
                            <div className="mt-2 border-t border-gray-800/50 pt-2 space-y-1">
                              {rateLimit.offenders.slice(0, 5).map((o) => (
                                <div key={o.key} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="text-gray-400 truncate font-mono text-[10px]">{o.key}</span>
                                  <span className="text-gray-500 tabular-nums shrink-0 whitespace-nowrap">
                                    {o.blocked}× · {formatAgo(o.lastBlockedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Maintenance mode (v0.23): pause the online layer for maintenance/network work */}
                      <div className={`bg-gray-800/40 border rounded-xl overflow-hidden ${maintenance.maintenance ? 'border-amber-500/40' : 'border-gray-700/40'}`}>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<Wrench className={`w-3 h-3 ${maintenance.maintenance ? 'text-amber-400' : 'text-gray-400'}`} />} label="Maintenance Mode" sub={maintenance.maintenance ? 'online gameplay paused' : 'online gameplay live'} />
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${
                            maintenance.maintenance
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {maintenance.maintenance ? 'Paused' : 'Live'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-[10px] text-gray-500">
                            While active, the WebSocket rejects new connections and every connected player is told live — their online indicator flips to <span className="text-amber-300 font-semibold">Maintenance</span>. Offline single-player gameplay keeps working untouched.
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              value={maintenanceReason}
                              onChange={(e) => setMaintenanceReason(e.target.value)}
                              placeholder={maintenance.maintenance ? 'Reason (shown to players)…' : 'Reason (optional)…'}
                              maxLength={200}
                              className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
                            />
                            <button
                              type="button"
                              onClick={() => void toggleMaintenance()}
                              disabled={maintenanceBusy}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 shrink-0 ${
                                maintenance.maintenance
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                              }`}
                            >
                              <Power className="w-3 h-3" />
                              {maintenanceBusy ? '…' : maintenance.maintenance ? 'Resume service' : 'Enter maintenance'}
                            </button>
                          </div>
                          {maintenance.since && maintenance.maintenance && (
                            <p className="text-[9px] text-amber-400/70">
                              Paused since {new Date(maintenance.since).toLocaleString()}{maintenance.reason ? ` — “${maintenance.reason}”` : ''}
                            </p>
                          )}

                          {/* Scheduled maintenance (v0.22.18): arm a window and let the server flip it. */}
                          {maintenance.scheduledAt ? (
                            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-amber-500/5 border border-amber-500/25">
                              <p className="text-[9px] text-amber-300/90 min-w-0">
                                <CalendarClock className="w-3 h-3 inline mr-1 -mt-0.5 shrink-0" />
                                <span className="font-semibold">Scheduled for {new Date(maintenance.scheduledAt).toLocaleString()}</span>
                                {' '}— the server flips automatically and drops the inbox note.
                              </p>
                              <button
                                type="button"
                                onClick={() => void cancelScheduledMaintenance()}
                                disabled={scheduleBusy}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border border-gray-700 text-gray-400 hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50 shrink-0"
                              >
                                <XCircle className="w-3 h-3" />
                                {scheduleBusy ? '…' : 'Cancel'}
                              </button>
                            </div>
                          ) : (
                            <div className="border-t border-gray-800/60 pt-2 flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="datetime-local"
                                  value={scheduleAtLocal}
                                  onChange={(e) => setScheduleAtLocal(e.target.value)}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60 [color-scheme:dark]"
                                />
                                <input
                                  value={scheduleReason}
                                  onChange={(e) => setScheduleReason(e.target.value)}
                                  placeholder="Reason (optional)…"
                                  maxLength={200}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/60"
                                />
                                <button
                                  type="button"
                                  onClick={() => void scheduleMaintenance()}
                                  disabled={scheduleBusy}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-500/40 text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 transition-colors disabled:opacity-50 shrink-0"
                                >
                                  <CalendarClock className="w-3 h-3" />
                                  {scheduleBusy ? '…' : 'Schedule'}
                                </button>
                              </div>
                              <p className="text-[8px] text-gray-600">
                                Plan a window — the server flips maintenance automatically at the start time and messages every player then. No 2am toggle.
                              </p>
                            </div>
                          )}
                          {scheduleMsg && (
                            <p className={`text-[9px] ${scheduleMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                              {scheduleMsg.text}
                            </p>
                          )}
                          {maintenanceMsg && (
                            <p className={`text-[9px] ${maintenanceMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                              {maintenanceMsg.text}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* New-signup gate: stop NEW account creation while login/guest play keep working */}
                      <div className={`bg-gray-800/40 border rounded-xl overflow-hidden ${!signupGate.open ? 'border-red-500/40' : 'border-gray-700/40'}`}>
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<UserRound className={`w-3 h-3 ${!signupGate.open ? 'text-red-400' : 'text-gray-400'}`} />} label="New Signups" sub={signupGate.open ? 'open — anyone can create an account' : 'paused — no new accounts'} />
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${
                            signupGate.open
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-300 border-red-500/30 animate-pulse'
                          }`}>
                            {signupGate.open ? 'Open' : 'Paused'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-[10px] text-gray-500">
                            While paused, the <span className="text-gray-300 font-semibold">register</span> form and guest→account upgrades are rejected (403). Existing players can still <span className="text-gray-300 font-semibold">log in</span> and guests keep playing — only new account creation stops.
                          </p>
                          <div className="flex items-center gap-2">
                            {signupGate.open && (
                              <input
                                type="datetime-local"
                                value={signupGateReopenAt}
                                onChange={(e) => setSignupGateReopenAt(e.target.value)}
                                title="Optional: auto-reopen at this time (players see a live countdown)"
                                className="flex-1 min-w-0 px-2.5 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-red-500/60 [color-scheme:dark]"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => void toggleSignupGate()}
                              disabled={signupGateBusy}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 shrink-0 ${
                                signupGate.open
                                  ? 'bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25'
                                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                              }`}
                            >
                              <Power className="w-3 h-3" />
                              {signupGateBusy ? '…' : signupGate.open ? 'Pause new signups' : 'Reopen signups'}
                            </button>
                          </div>
                          {signupGate.open && (
                            <p className="text-[8px] text-gray-600">
                              Optional: pick a reopen time when pausing — the gate flips itself open then and players see a live countdown. Leave empty to pause indefinitely.
                            </p>
                          )}
                          {signupGate.since && (
                            <p className="text-[9px] text-gray-600">
                              {signupGate.open ? 'Reopened' : 'Paused'} {new Date(signupGate.since).toLocaleString()}
                              {!signupGate.open && signupGate.reopensAt && (
                                <> · auto-reopens {new Date(signupGate.reopensAt).toLocaleString()}</>
                              )}
                            </p>
                          )}
                          {signupGateMsg && (
                            <p className={`text-[9px] ${signupGateMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                              {signupGateMsg.text}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<Wifi className="w-3 h-3 text-emerald-400" />} label={`Online Now${onlineNow.length > 0 ? ` (${onlineNow.length})` : ''}`} />
                          <span className="flex items-center gap-1.5 text-[9px] text-gray-500">
                            <span className={`w-1.5 h-1.5 rounded-full ${onlineNow.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                            live · 15s
                          </span>
                        </div>
                        <div className="p-2 space-y-1">
                          {onlineNow.length === 0 ? (
                            <p className="text-[10px] text-gray-600 px-1 py-1">No commanders online right now.</p>
                          ) : (
                            onlineNow.map((o) => {
                              const act = PRESENCE_META[o.activity] ?? PRESENCE_META.idle;
                              return (
                                <div key={o.playerId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-950/50 border border-gray-800/50">
                                  <span className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-300 shrink-0">
                                    {avatarInitials(o.username)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[11px] text-gray-200 truncate">{o.username}</span>
                                      {o.allianceId && (
                                        <span className="text-[8px] px-1 py-px rounded bg-violet-500/15 text-violet-300 border border-violet-500/25 uppercase font-bold shrink-0">alliance</span>
                                      )}
                                    </span>
                                    <p className="text-[9px] text-gray-500 truncate">{o.city ?? 'City unset'}</p>
                                  </div>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold shrink-0">
                                    Lv {o.level}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0 whitespace-nowrap ${act.chip}`}>
                                    {act.icon} {act.label}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<Users className="w-3 h-3 text-blue-400" />} label="Recently Active" />
                          {guestCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowGuests((v) => !v)}
                              className="text-[10px] px-2 py-1 rounded-md border border-gray-700/60 bg-gray-800/40 text-gray-400 hover:text-white hover:border-gray-500 transition-colors shrink-0"
                            >
                              {showGuests ? 'Hide guests' : `Show guests (${guestCount} hidden)`}
                            </button>
                          )}
                        </div>
                        <div className="p-2 space-y-1">
                          <div className="relative px-1">
                            <Search className="w-3 h-3 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              value={playerSearch}
                              onChange={(e) => setPlayerSearch(e.target.value)}
                              placeholder="Filter by username…"
                              className="w-full pl-7 pr-2 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60"
                            />
                          </div>
                          {visiblePlayers.length === 0 && (
                            <p className="text-xs text-gray-600 px-1 pt-1">
                              {showGuests ? 'No players yet.' : 'No registered players yet.'}
                            </p>
                          )}
                          {visiblePlayers.length > 0 && filteredPlayers.length === 0 && (
                            <p className="text-[10px] text-gray-600 px-1 pt-1">No players match “{playerSearch}”.</p>
                          )}
                          {filteredPlayers.map((p, i) => {
                            const isGuest = (p.email ?? '').toLowerCase().startsWith('guest_');
                            return (
                              <div key={i} className="group flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-900/40 border border-gray-800/50 rounded-lg hover:border-gray-700 transition-colors">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarColor(p.username ?? '', i)}`}>
                                    {avatarInitials(p.username)}
                                  </span>
                                  <span className="text-xs text-gray-200 truncate">{p.username ?? 'Unknown'}</span>
                                  {isGuest && (
                                    <span className="text-[8px] px-1 py-px rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 uppercase font-bold shrink-0">guest</span>
                                  )}
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-gray-500">Lv {p.level ?? 1} · {(p.xp ?? 0).toLocaleString()} XP</span>
                                  <button
                                    onClick={() => quickGrant(p.username ?? '')}
                                    disabled={!p.username}
                                    title="Grant bonus"
                                    className="p-1 rounded-md bg-gray-800 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-amber-300 hover:bg-gray-700 transition-all disabled:opacity-0"
                                  >
                                    <Gift className="w-3 h-3" />
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === 'broadcast' && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/40">
                        <SectionTitle icon={<Megaphone className="w-3 h-3 text-dispatch-red" />} label="Message All Users" />
                      </div>
                      <div className="p-4">
                      <p className="text-[9px] text-gray-600 mb-2">
                        Pick a kind, then it posts to Public Chat, toasts connected players, and stores a durable copy in every inbox (offline included).
                      </p>
                      <div className="flex gap-1.5 mb-2">
                        {([
                          { id: 'psa' as const, label: 'PSA', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20' },
                          { id: 'notice' as const, label: 'Notice', cls: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20' },
                          { id: 'message' as const, label: 'Message', cls: 'text-blue-400 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20' },
                        ]).map((k) => (
                          <button
                            key={k.id}
                            onClick={() => { setBroadcastKind(k.id); setTitle(k.id === 'psa' ? 'Citywide PSA' : k.id === 'notice' ? 'Citywide Notice' : 'Message from HQ'); }}
                            className={`flex-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${k.cls} ${broadcastKind === k.id ? 'ring-1 ring-white/20' : 'opacity-60'}`}
                          >
                            {k.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Title"
                        className="w-full mb-2 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
                      />
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Message to every connected player…"
                        rows={3}
                        className="w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60 resize-none"
                      />
                      <button
                        onClick={sendBroadcast}
                        disabled={sending || !message.trim()}
                        className="mt-2 w-full px-3 py-2 bg-dispatch-red text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sending ? 'Sending…' : `Send ${broadcastKind === 'psa' ? 'PSA' : broadcastKind === 'notice' ? 'Notice' : 'Message'}`}
                      </button>
                      {sentInfo && <p className="mt-2 text-[10px] text-gray-400">{sentInfo}</p>}
                      </div>
                    </div>
                  )}

                  {tab === 'triage' && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                      <button
                        onClick={() => setReportsOpen(!reportsOpen)}
                        className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500"
                      >
                        <span className="flex items-center gap-1.5">
                          <Bug className="w-3 h-3" /> Weekly Triage Digest
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${reportsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {reportsOpen && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border bg-blue-500/15 text-blue-300 border-blue-500/30">New {reportCounts.new}</span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border bg-amber-500/15 text-amber-300 border-amber-500/30">Investigating {reportCounts.investigating}</span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Fixed {reportCounts.fixed}</span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border bg-gray-800 text-gray-400 border-gray-700">+{newThisWeek} this week</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <select
                              value={reportOrder}
                              onChange={(e) => setReportOrder(e.target.value as 'oldest' | 'newest')}
                              className="px-1.5 py-1 rounded bg-gray-900 border border-gray-700 text-[9px] text-gray-200 focus:outline-none focus:border-dispatch-red/50"
                            >
                              <option value="oldest">Oldest open first</option>
                              <option value="newest">Newest first</option>
                            </select>
                            <button
                              onClick={() => setReportFilter(reportFilter === 'unassigned' ? 'all' : 'unassigned')}
                              className={`px-2 py-1 rounded text-[9px] font-medium border transition-colors ${
                                reportFilter === 'unassigned'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200'
                              }`}
                            >
                              Unassigned only
                            </button>
                          </div>

                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {reportsLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading reports…</p>}
                          {!reportsLoading && bugReports.length === 0 && (
                            <p className="text-[10px] text-gray-600">No bug reports yet.</p>
                          )}
                          {!reportsLoading && bugReports.map((r) => (
                            <div key={r.id} className="bg-gray-950/60 border border-gray-700/40 rounded-lg p-2.5 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-white uppercase">{r.category}</span>
                                  {reportStatusChip(r.status ?? 'new')}
                                </span>
                                <span className="text-[9px] text-gray-500 shrink-0">
                                  {r.username} · {new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-300 whitespace-pre-wrap break-words">{r.description}</p>

                              {r.notes ? (
                                <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/25">
                                  <MessageSquare className="w-3 h-3 text-blue-300 mt-0.5 shrink-0" />
                                  <p className="text-[9px] text-blue-200 whitespace-pre-wrap break-words">{r.notes}</p>
                                </div>
                              ) : (
                                <p className="text-[8px] text-gray-600">No team note yet — write one so the player sees an update.</p>
                              )}

                              <div className="flex items-center gap-1.5">
                                <select
                                  value={r.status ?? 'new'}
                                  onChange={(e) => triage(r.id, { status: e.target.value as BugReportStatus })}
                                  disabled={triageBusy === r.id}
                                  className="px-1.5 py-1 rounded bg-gray-900 border border-gray-700 text-[9px] text-gray-200 focus:outline-none focus:border-dispatch-red/50"
                                >
                                  {REPORT_STATUSES.map((s) => (
                                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <UserRound className="w-3 h-3 text-gray-500 shrink-0" />
                                  <input
                                    value={assigneeDrafts[r.id] ?? r.assignee ?? ''}
                                    onChange={(e) => setAssigneeDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                                    placeholder="Assignee"
                                    className="w-full px-1.5 py-1 rounded bg-gray-900 border border-gray-700 text-[9px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-dispatch-red/50"
                                  />
                                </div>
                                <button
                                  onClick={() => triage(r.id, { assignee: (assigneeDrafts[r.id] ?? r.assignee ?? '').trim() || null })}
                                  disabled={triageBusy === r.id}
                                  className="px-2 py-1 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 disabled:opacity-40 shrink-0"
                                >
                                  {triageBusy === r.id ? '…' : 'Set'}
                                </button>
                                {r.status !== 'fixed' && (
                                  <button
                                    onClick={() => triage(r.id, { status: 'fixed' })}
                                    disabled={triageBusy === r.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold hover:bg-emerald-500/20 disabled:opacity-40 shrink-0"
                                  >
                                    <CheckCircle2 className="w-3 h-3" /> Resolve
                                  </button>
                                )}
                              </div>

                              <div className="flex items-end gap-1.5">
                                <textarea
                                  value={noteDrafts[r.id] ?? r.notes ?? ''}
                                  onChange={(e) => setNoteDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                                  placeholder="Team note — shown to the player on My Reports"
                                  rows={2}
                                  className="flex-1 px-1.5 py-1 rounded bg-gray-900 border border-gray-700 text-[9px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-dispatch-red/50 resize-none"
                                />
                                <button
                                  onClick={() => triage(r.id, { notes: (noteDrafts[r.id] ?? r.notes ?? '').trim() || null })}
                                  disabled={triageBusy === r.id}
                                  className="px-2 py-1 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 disabled:opacity-40 shrink-0"
                                >
                                  {triageBusy === r.id ? '…' : 'Note'}
                                </button>
                              </div>
                            </div>
                          ))}
                          {triageMsg && <p className="text-[10px] text-gray-400 pt-1">{triageMsg}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === 'bonus' && (
                    <div className="space-y-4">
                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
                          <Gift className="w-3 h-3" /> Grant a Bonus
                        </p>
                        <p className="text-[9px] text-gray-600 mb-3">Reward a player directly by username — for events, restitution, or community prizes.</p>
                        <input
                          value={bonusUsername}
                          onChange={(e) => setBonusUsername(e.target.value)}
                          placeholder="Player username"
                          className="w-full mb-2 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
                        />
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          <RewardInput icon={<Zap className="w-3 h-3 text-amber-400" />} placeholder="XP" value={bonusDrafts.xp ?? ''} onChange={(v) => setBonusDrafts((d) => ({ ...d, xp: v }))} />
                          <RewardInput icon={<Coins className="w-3 h-3 text-amber-400" />} placeholder="Credits" value={bonusDrafts.credits ?? ''} onChange={(v) => setBonusDrafts((d) => ({ ...d, credits: v }))} />
                          <RewardInput icon={<TrendingUp className="w-3 h-3 text-cyan-400" />} placeholder="Coins" value={bonusDrafts.coins ?? ''} onChange={(v) => setBonusDrafts((d) => ({ ...d, coins: v }))} />
                          <RewardInput icon={<ShieldCheck className="w-3 h-3 text-green-400" />} placeholder="Levels" value={bonusDrafts.level ?? ''} onChange={(v) => setBonusDrafts((d) => ({ ...d, level: v }))} />
                        </div>
                        <button
                          onClick={grantBonus}
                          disabled={bonusBusy || !bonusUsername.trim()}
                          className="w-full px-3 py-2 bg-dispatch-red text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {bonusBusy ? 'Granting…' : 'Grant Bonus'}
                        </button>
                        {bonusMsg && <p className={`mt-2 text-[10px] ${bonusMsg.ok ? 'text-green-400' : 'text-dispatch-red'}`}>{bonusMsg.text}</p>}
                      </div>
                    </div>
                  )}

                  {tab === 'promos' && (
                    <div className="space-y-4">
                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
                          <Ticket className="w-3 h-3" /> Create Promo Code
                        </p>
                        <p className="text-[9px] text-gray-600 mb-3">Players redeem these in the profile panel. Leave the code blank to auto-generate.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                          <input
                            value={newPromoCode}
                            onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                            placeholder="Code (auto-generate if blank)"
                            maxLength={40}
                            className="px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
                          />
                          <input
                            value={newPromoLabel}
                            onChange={(e) => setNewPromoLabel(e.target.value)}
                            placeholder="Label (e.g. Community Day 2026)"
                            maxLength={100}
                            className="px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <RewardInput icon={<Zap className="w-3 h-3 text-amber-400" />} placeholder="XP" value={newPromoXp} onChange={setNewPromoXp} />
                          <RewardInput icon={<Coins className="w-3 h-3 text-amber-400" />} placeholder="Credits" value={newPromoCredits} onChange={setNewPromoCredits} />
                          <RewardInput icon={<TrendingUp className="w-3 h-3 text-cyan-400" />} placeholder="Coins" value={newPromoCoins} onChange={setNewPromoCoins} />
                          <RewardInput icon={<ShieldCheck className="w-3 h-3 text-green-400" />} placeholder="Levels" value={newPromoLevels} onChange={setNewPromoLevels} />
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <label className="text-[9px] text-gray-500 shrink-0">Max uses</label>
                          <input
                            type="number"
                            value={newPromoMaxUses}
                            onChange={(e) => setNewPromoMaxUses(e.target.value)}
                            min={1}
                            className="w-20 px-2 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-dispatch-red/60"
                          />
                          <div className="flex-1" />
                        </div>
                        <button
                          onClick={createPromo}
                          disabled={creatingPromo}
                          className="w-full px-3 py-2 bg-dispatch-red text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingPromo ? 'Creating…' : 'Create Code'}
                        </button>
                        {promoMsg && <p className={`mt-2 text-[10px] ${promoMsg.ok ? 'text-green-400' : 'text-dispatch-red'}`}>{promoMsg.text}</p>}
                      </div>

                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Active Codes ({promos.length})</p>
                        {promoLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading…</p>}
                        {!promoLoading && promos.length === 0 && (
                          <p className="text-[10px] text-gray-600">No promo codes yet.</p>
                        )}
                        <div className="space-y-2">
                          {!promoLoading && promos.map((p) => (
                            <div key={p.id} className={`bg-gray-950/60 border rounded-lg p-2.5 ${p.active ? 'border-gray-700/40' : 'border-gray-800/60 opacity-60'}`}>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  onClick={() => copyCode(p.code)}
                                  className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-white hover:text-dispatch-red transition-colors"
                                  title="Copy code"
                                >
                                  {copiedCode === p.code ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-500" />}
                                  {p.code}
                                </button>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${p.active ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                                    {p.active ? 'Active' : 'Off'}
                                  </span>
                                  <span className="text-[9px] text-gray-500">{p.usedCount}/{p.maxUses} used</span>
                                  <button
                                    onClick={() => togglePromo(p)}
                                    className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors"
                                  >
                                    {p.active ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              </div>
                              <p className="text-[9px] text-gray-500 mt-1">
                                {p.label ? `${p.label} · ` : ''}{summarizeRewards(p.rewards)} {p.expiresAt ? `· expires ${new Date(p.expiresAt).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                            <History className="w-3 h-3" /> Redemption Log ({redemptions.length})
                          </p>
                          <button
                            onClick={() => void loadRedemptions()}
                            disabled={redemptionsLoading}
                            className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                          >
                            {redemptionsLoading ? 'Loading…' : 'Refresh'}
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-600 mb-2">Who redeemed each code, when, and at what level (most recent 200).</p>
                        {redemptionsLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading…</p>}
                        {!redemptionsLoading && redemptions.length === 0 && (
                          <p className="text-[10px] text-gray-600">No redemptions yet.</p>
                        )}
                        {!redemptionsLoading && redemptions.length > 0 && (
                          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                            {redemptions.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-2 bg-gray-950/60 border border-gray-700/40 rounded-lg px-2.5 py-1.5"
                                title={`${r.label ? `${r.label} · ` : ''}${r.code} grants ${summarizeRewards(r.rewards)}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[10px] font-mono font-bold text-white truncate">{r.code}</span>
                                  <span className="text-[10px] text-gray-300 truncate">{r.username}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                    title="Level at redemption time (legacy redemptions before this log existed read Lv 1)"
                                  >
                                    Lv {r.levelAtRedemption}
                                  </span>
                                  <span className="text-[9px] text-gray-500">{new Date(r.redeemedAt).toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {tab === 'upgrades' && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                          <History className="w-3 h-3" /> Guest Upgrade Audit ({upgrades.length})
                        </p>
                        <button
                          onClick={() => void loadUpgrades()}
                          disabled={upgradesLoading}
                          className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                          {upgradesLoading ? 'Loading…' : 'Refresh'}
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-600 mb-2">
                        Every guest→account upgrade — whether the campaign was merged or the account started fresh — so an accidental merge is traceable (most recent 100).
                      </p>
                      {upgradesLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading…</p>}
                      {!upgradesLoading && upgrades.length === 0 && (
                        <p className="text-[10px] text-gray-600">No upgrades yet.</p>
                      )}
                      {!upgradesLoading && upgrades.length > 0 && (
                        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                          {upgrades.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between gap-2 bg-gray-950/60 border border-gray-700/40 rounded-lg px-2.5 py-1.5"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] text-gray-300 truncate">
                                  {u.guestUsername ?? 'guest (zeroed)'} <span className="text-gray-600">→</span>{' '}
                                  <span className="text-white font-semibold">{u.accountUsername ?? 'unknown'}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                                    u.merged
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : 'bg-gray-800 text-gray-400 border-gray-700'
                                  }`}
                                >
                                  {u.merged ? 'Merged' : 'Fresh start'}
                                </span>
                                <span className="text-[9px] text-gray-500">{new Date(u.upgradedAt).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {tab === 'shop' && (
                    <div className="space-y-4">
                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<ShoppingCart className="w-3 h-3 text-emerald-400" />} label="Orders & Revenue" sub={`${shopSummary?.totalOrders ?? 0} all-time`} />
                          <button
                            onClick={() => void loadOrders()}
                            disabled={ordersLoading}
                            className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                          >
                            {ordersLoading ? 'Loading…' : 'Refresh'}
                          </button>
                        </div>
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-emerald-400/80">Revenue</p>
                              <p className="text-base font-bold text-emerald-300 tabular-nums">{formatCents(shopSummary?.revenueCents ?? 0)}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-amber-400/80">Pending</p>
                              <p className="text-base font-bold text-amber-300 tabular-nums">{formatCents(shopSummary?.pendingCents ?? 0)}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-blue-400/80">Orders</p>
                              <p className="text-base font-bold text-white tabular-nums">{(shopSummary?.totalOrders ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Fulfilled</p>
                              <p className="text-base font-bold text-white tabular-nums">{(shopSummary?.fulfilledCount ?? 0).toLocaleString()}</p>
                            </div>
                          </div>

                          {shopMsg && (
                            <p className={`text-[9px] font-medium ${shopMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                              {shopMsg.text}
                            </p>
                          )}

                          {ordersLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading orders…</p>}
                          {!ordersLoading && orders.length === 0 && (
                            <p className="text-[10px] text-gray-600">No orders yet — the first checkout lands here.</p>
                          )}
                          {!ordersLoading && orders.length > 0 && (
                            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                              {orders.map((o) => (
                                <div key={o.id} className="bg-gray-950/60 border border-gray-700/40 rounded-lg px-2.5 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[11px] text-gray-200 truncate">{o.username ?? 'unknown'}</span>
                                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border shrink-0 ${o.kind === 'membership' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'}`}>
                                        {o.kind === 'membership' ? 'Membership' : 'Coins'}
                                      </span>
                                      {orderStatusChip(o.status)}
                                    </span>
                                    <span className="text-[11px] font-bold text-emerald-300 tabular-nums shrink-0">{formatCents(o.priceCents)}</span>
                                  </div>
                                  <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <span className="text-[9px] text-gray-500 truncate">
                                      {o.itemName ?? 'item'} · {new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      {o.provider === 'manual' && <span className="text-gray-600"> · manual</span>}
                                    </span>
                                    {(o.status === 'pending' || o.status === 'paid') && (
                                      <button
                                        onClick={() => void fulfillShopOrder(o.id)}
                                        disabled={fulfillBusy === o.id}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold hover:bg-emerald-500/20 disabled:opacity-50 shrink-0"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        {fulfillBusy === o.id ? '…' : 'Fulfill'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700/40">
                          <SectionTitle icon={<Coins className="w-3 h-3 text-amber-400" />} label="Coin Ledger" sub={`${coinSummary?.totalTransactions ?? 0} all-time`} />
                          <button
                            onClick={() => void loadCoinTransactions()}
                            disabled={coinTxLoading}
                            className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                          >
                            {coinTxLoading ? 'Loading…' : 'Refresh'}
                          </button>
                        </div>
                        <div className="p-3 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-emerald-400/80">Credited</p>
                              <p className="text-base font-bold text-emerald-300 tabular-nums">+{(coinSummary?.credited ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-red-400/80">Debited</p>
                              <p className="text-base font-bold text-red-300 tabular-nums">-{(coinSummary?.debited ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-blue-400/80">Moves</p>
                              <p className="text-base font-bold text-white tabular-nums">{(coinSummary?.totalTransactions ?? 0).toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-950/60 rounded-lg px-2.5 py-2">
                              <p className="text-[9px] uppercase tracking-wider text-gray-500">Net</p>
                              <p className={`text-base font-bold tabular-nums ${(coinSummary?.netDelta ?? 0) >= 0 ? 'text-white' : 'text-red-300'}`}>
                                {((coinSummary?.netDelta ?? 0) >= 0 ? '+' : '-') + Math.abs(coinSummary?.netDelta ?? 0).toLocaleString()}
                              </p>
                            </div>
                          </div>

                          {coinTxLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading coin ledger…</p>}
                          {!coinTxLoading && coinTx.length === 0 && (
                            <p className="text-[10px] text-gray-600">No coin transactions yet — the first spend or pack purchase lands here.</p>
                          )}
                          {!coinTxLoading && coinTx.length > 0 && (
                            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                              {coinTx.map((t) => {
                                const pos = t.delta >= 0;
                                return (
                                  <div key={t.id} className="bg-gray-950/60 border border-gray-700/40 rounded-lg px-2.5 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[11px] text-gray-200 truncate">{t.username ?? 'unknown'}</span>
                                        {coinReasonChip(t.reason)}
                                      </span>
                                      <span className={`text-[11px] font-bold tabular-nums shrink-0 ${pos ? 'text-emerald-300' : 'text-red-300'}`}>
                                        {pos ? '+' : '-'}{Math.abs(t.delta).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="mt-1 text-[9px] text-gray-500 truncate">
                                      balance {(t.balanceAfter ?? 0).toLocaleString()} · {new Date(t.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      {t.refId && <span className="text-gray-600"> · ref {t.refId.slice(0, 8)}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === 'contests' && (
                    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                          <Trophy className="w-3 h-3" /> Seasonal Contests ({contests.length})
                        </p>
                        <button
                          onClick={() => void loadContests()}
                          disabled={contestsLoading}
                          className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[9px] font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                          {contestsLoading ? 'Loading…' : 'Refresh'}
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-600 mb-2">
                        Live standings per holiday window. Award or override the winner for edge cases — the winner badge (+1,000 XP) goes out instantly.
                      </p>
                      {contestMsg && (
                        <p className={`text-[9px] mb-2 font-medium ${contestMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                          {contestMsg.text}
                        </p>
                      )}
                      {contestsLoading && <p className="text-[10px] text-gray-500 animate-pulse">Loading…</p>}
                      {!contestsLoading && contests.length === 0 && (
                        <p className="text-[10px] text-gray-600">No seasonal contests found.</p>
                      )}
                      {!contestsLoading && contests.length > 0 && (
                        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                          {contests.map((c) => (
                            <div key={c.eventId} className="bg-gray-950/60 border border-gray-700/40 rounded-lg p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-white">
                                  {c.label} {c.active ? '🎆' : c.ended ? '🏁' : '🔒'}
                                </p>
                                <span
                                  className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                                    c.active
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : c.ended
                                        ? 'bg-gray-800 text-gray-400 border-gray-700'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {c.active ? 'Live' : c.ended ? 'Ended' : 'Upcoming'}
                                </span>
                              </div>
                              <p className="text-[9px] text-gray-500 mt-0.5">
                                {seasonalWindowLabel(c)} · {c.entryCount} entrant{c.entryCount === 1 ? '' : 's'} · {c.totalClears} call{c.totalClears === 1 ? '' : 's'} cleared
                                {(c.totalCityClears ?? 0) > 0 && (
                                  <span className="text-sky-400/80"> · {c.totalCityClears} by city</span>
                                )}
                              </p>

                              {c.winner ? (
                                <div className="mt-1.5 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 text-[9px] text-emerald-300">
                                  <span>🏆</span>
                                  <span className="font-semibold">{c.winner.username}</span>
                                  <span className="text-emerald-400/70">· {c.winner.calls} calls</span>
                                </div>
                              ) : (
                                c.ended && (
                                  <p className="mt-1.5 text-[9px] text-gray-600">No winner yet — no entries for this window.</p>
                                )
                              )}

                              {c.entries.length > 0 && (
                                <div className="mt-2 space-y-0.5">
                                  {c.entries.map((e) => (
                                    <div
                                      key={e.playerId}
                                      className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 bg-gray-900/50"
                                    >
                                      <span className="text-[9px] text-gray-300 flex items-center gap-1.5 min-w-0">
                                        <span className="w-4 text-center shrink-0">
                                          {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : <span className="text-gray-600">{e.rank}</span>}
                                        </span>
                                        <span className="truncate">{e.username}</span>
                                        <span className="text-gray-600 shrink-0">Lv {e.level}</span>
                                      </span>
                                      <span className="text-[9px] text-white font-semibold shrink-0">
                                        {e.callsCleared} calls
                                        {(e.cityClears ?? 0) > 0 && (
                                          <span className="text-sky-400/90 font-normal"> · {e.cityClears} city</span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="mt-2 flex items-center gap-2">
                                <select
                                  value={contestSelections[c.eventId] ?? ''}
                                  onChange={(e) =>
                                    setContestSelections((prev) => ({ ...prev, [c.eventId]: e.target.value }))
                                  }
                                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-[9px] text-gray-300 focus:outline-none focus:border-dispatch-red/60"
                                >
                                  <option value="">Top clearer (auto)</option>
                                  {c.entries.map((e) => (
                                    <option key={e.playerId} value={e.playerId}>
                                      {e.username} — {e.callsCleared + (e.cityClears ?? 0)} clears
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => void awardContestWinner(c.eventId)}
                                  disabled={contestAwardBusy === c.eventId}
                                  className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors disabled:opacity-50 ${
                                    contestArmed === c.eventId
                                      ? 'bg-red-600 text-white hover:bg-red-500'
                                      : 'bg-dispatch-red text-white hover:bg-dispatch-red/80'
                                  }`}
                                >
                                  {contestAwardBusy === c.eventId
                                    ? 'Awarding…'
                                    : contestArmed === c.eventId
                                      ? 'Confirm award?'
                                      : c.winner
                                        ? 'Override winner'
                                        : 'Award winner'}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** "Jul 1 – Jul 6" style label for a contest window (mirrors lib/seasonal.ts). */
function seasonalWindowLabel(c: AdminSeasonalContest): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const s = c.window.start;
  const e = c.window.end;
  if (s.month === e.month && s.day === e.day) return `${MONTHS[s.month - 1]} ${s.day}`;
  if (s.month === e.month) return `${MONTHS[s.month - 1]} ${s.day} – ${e.day}`;
  return `${MONTHS[s.month - 1]} ${s.day} – ${MONTHS[e.month - 1]} ${e.day}`;
}

function summarizeRewards(r: PromoRewards): string {
  const parts: string[] = [];
  if (r.credits) parts.push(`${r.credits.toLocaleString()} credits`);
  if (r.xp) parts.push(`${r.xp.toLocaleString()} XP`);
  if (r.coins) parts.push(`${r.coins} coins`);
  if (r.level) parts.push(`${r.level} level${r.level > 1 ? 's' : ''}`);
  return parts.join(' + ') || 'no rewards';
}

/** Parse raw string drafts into a PromoRewards payload (zeros/non-numbers dropped). */
function useMemoPromoRewards(drafts: Record<string, string>): PromoRewards {
  const out: PromoRewards = {};
  for (const key of ['xp', 'credits', 'coins', 'level'] as const) {
    const n = parseInt(drafts[key] ?? '', 10);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

function RewardInput({ icon, placeholder, value, onChange }: {
  icon: React.ReactNode; placeholder: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2">{icon}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-2 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-dispatch-red/60"
      />
    </div>
  );
}

function Tile({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: number; accent?: string;
}) {
  return (
    <div className="group bg-gray-800/40 border border-gray-700/40 rounded-xl p-3 hover:border-gray-600/60 hover:bg-gray-800/60 transition-colors">
      <div className={`flex items-center justify-between mb-1.5 ${accent ? '' : 'text-gray-400'}`}>
        {accent ? (
          <span className={`flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider ${accent.split(' ')[0]}`}>
            {icon}
            {label}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wider">
            {icon}
            {label}
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-white tabular-nums">{Number(value ?? 0).toLocaleString()}</p>
    </div>
  );
}

/** Consistent card-section header: tinted icon chip + uppercase label. */
function SectionTitle({ icon, label, sub }: { icon: React.ReactNode; label: string; sub?: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="w-5 h-5 rounded-md bg-gray-900/70 border border-gray-700/60 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</span>
      {sub && <span className="text-[9px] text-gray-600 shrink-0">{sub}</span>}
    </span>
  );
}

function avatarInitials(name: string | null | undefined): string {
  const clean = (name ?? '?').trim();
  if (!clean) return '?';
  return clean.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string, index: number): string {
  const palettes = [
    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'bg-violet-500/15 text-violet-300 border-violet-500/30',
    'bg-rose-500/15 text-rose-300 border-rose-500/30',
    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[(hash + index) % palettes.length];
}
