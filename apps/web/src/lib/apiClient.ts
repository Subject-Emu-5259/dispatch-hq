// ============================================
// Dispatch HQ — REST API Client
// ============================================
// All authentication is handled via HttpOnly cookies set by the server.
// No JWT is stored in browser localStorage. Requests include credentials
// so cookies are automatically sent for same-origin API calls.

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Session-expiry recovery ─────────────────────────────────────────────────
// When a 401 comes back from an auth-guarded call (deploy restarts can leave
// tokens minted by a previous process), the app is told once so it can route
// the player back to the auth screen instead of failing saves/settings
// silently forever. Registered by App via setUnauthorizedHandler.
let onUnauthorized: (() => void) | null = null;
let lastUnauthorizedAt = 0;
const UNAUTHORIZED_NOTIFY_GAP_MS = 30000; // at most once per 30s (autosave retries)

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// Requests that hang (server down, dead network, auth proxy stalling) should
// fail fast instead of leaving callers — like the autosave — stuck forever.
const DEFAULT_TIMEOUT_MS = 12000;

export async function apiFetch<T>(path: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
    if (res.status === 401) {
      const now = Date.now();
      if (onUnauthorized && now - lastUnauthorizedAt > UNAUTHORIZED_NOTIFY_GAP_MS) {
        lastUnauthorizedAt = now;
        onUnauthorized();
      }
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      let message = (error as { error?: string }).error || `HTTP ${res.status}`;
      // 429s carry a Retry-After header — surface it so the user knows the
      // endpoint is deliberately rate-limited, not broken (auth/promo/chat).
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
        if (retryAfter > 0) message = `${message} Try again in ${Math.ceil(retryAfter)}s.`;
      }
      throw new Error(message);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

import type { Player, WeeklySnapshot, PresenceActivity } from '@dispatch-hq/shared';

export interface AuthResponse {
  player: Player;
}

export interface SavePreview {
  level: number;
  credits: number;
  xp: number;
  city: string | null;
  service: string | null;
  missionsCompleted: number;
  gameMinutes: number;
  /** Onboarding tour position: 0..N-1 mid-tour, -1 done/skipped (legacy). */
  onboardingStep?: number;
}

export interface SaveSlot {
  id?: string;
  slot: string;
  label?: string;
  createdAt?: string;
  updatedAt: string;
  /** Headline campaign stats derived server-side from the payload jsonb. */
  preview?: SavePreview;
}

export interface SaveDataResponse {
  slot: string;
  data: unknown;
  updatedAt: string;
}

interface SaveSlotsResponse {
  saves: SaveSlot[];
}

export const api = {
  register: async (username: string, email: string, _password: string): Promise<AuthResponse> => {
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password: _password }),
    });
  },
  login: async (email: string, _password: string): Promise<AuthResponse> => {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: _password }),
    });
  },
  guest: async (): Promise<AuthResponse> => {
    return apiFetch<AuthResponse>('/auth/guest', { method: 'POST' });
  },
  /** Upgrade the current (guest) session into a real account; mergeCampaign
   *  carries the guest's campaign and identity-linked data into the account. */
  upgrade: async (username: string, email: string, _password: string, mergeCampaign: boolean): Promise<AuthResponse & { merged: boolean }> => {
    return apiFetch<AuthResponse & { merged: boolean }>('/auth/upgrade', {
      method: 'POST',
      body: JSON.stringify({ username, email, password: _password, mergeCampaign }),
    });
  },
  logout: async (): Promise<{ success: boolean }> => {
    return apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },
};

// Settings
export interface SettingsResponse<T> {
  settings: T | null;
}

export async function getSettings<T = Record<string, unknown>>(): Promise<SettingsResponse<T>> {
  return apiFetch<SettingsResponse<T>>('/player/settings');
}

export async function updateSettings<T = Record<string, unknown>>(settings: T): Promise<{ success: boolean; settings: T }> {
  return apiFetch<{ success: boolean; settings: T }>('/player/settings', {
    method: 'POST',
    body: JSON.stringify({ settings }),
  });
}

// Saves
export async function getSaveSlots(): Promise<SaveSlot[]> {
  const { saves } = await apiFetch<SaveSlotsResponse>('/player/saves');
  return saves ?? [];
}

export async function loadSave(slotName: string): Promise<SaveDataResponse | null> {
  return apiFetch<SaveDataResponse>(`/player/saves/${encodeURIComponent(slotName)}`).catch((err) => {
    // The server answers 404 with { error: 'Save not found' } — match it
    // specifically (case-insensitive) so a genuinely-missing save resolves to
    // null instead of surfacing as an opaque load failure (which used to make
    // Continue bounce players into a new campaign). Narrow on purpose: other
    // "not found"-ish messages (500s, proxies) must not be silently swallowed.
    const message = String(err?.message ?? '').toLowerCase();
    if (message.includes('save not found') || message.includes('no save')) return null;
    throw err;
  });
}

export async function storeSave(slotName: string, label: string, data: unknown): Promise<void> {
  await apiFetch('/player/saves', {
    method: 'POST',
    body: JSON.stringify({ slot: slotName, label, data }),
  });
}

export async function deleteSave(slotName: string): Promise<void> {
  await apiFetch(`/player/saves/${encodeURIComponent(slotName)}`, { method: 'DELETE' });
}

// Career stats — push cumulative Dispatch Records so the server-side
// leaderboard reflects real play. The weekly snapshot rides along for the
// Friends "who's ahead this week" comparison. Best-effort; failures are silent.
export async function syncCareerStats(stats: {
  missionsCompleted: number;
  missionsFailed: number;
  totalCreditsEarned: number;
  bestResponseTime: number;
  mutualAidAnswered?: number;
}, weekly?: WeeklySnapshot): Promise<boolean> {
  try {
    await apiFetch('/player/stats', {
      method: 'POST',
      body: JSON.stringify({ stats, weekly: weekly ?? null }),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Friends leaderboard ────────────────────────────────────────────────────
// Head-to-head against your social graph: calls run, clearance rate, rank, and
// who's ahead this ISO week.

export interface FriendLeaderboardEntry {
  playerId: string;
  username: string;
  level: number;
  xp: number;
  rank: number;
  callsRun: number;
  cleared: number;
  clearanceRate: number;
  weekly: WeeklySnapshot;
}

export interface FriendLeaderboardResponse {
  weekKey: string;
  me: FriendLeaderboardEntry | null;
  friends: FriendLeaderboardEntry[];
}

export async function fetchFriendLeaderboard(): Promise<FriendLeaderboardResponse> {
  return apiFetch<FriendLeaderboardResponse>('/leaderboard/friends');
}

// ── Seasonal contest leaderboard (v0.21.1) ─────────────────────────────────
// Per-holiday-window clears contest: standings, your rank, and the winner once
// the window closes.

export interface SeasonalContestEntry {
  playerId: string;
  username: string;
  level: number;
  callsCleared: number;
  /** CPU-handled clears — kept as their own stat (v0.22.x). */
  cityClears?: number;
  /** Manual + city (what the contest ranks by). */
  totalClears?: number;
  lastClearedAt: string;
  rank: number;
}

export interface SeasonalContestResponse {
  eventId: string;
  active: boolean;
  ended: boolean;
  winner: { playerId: string; username: string; calls: number } | null;
  entries: SeasonalContestEntry[];
  me: { playerId: string; rank: number | null; callsCleared: number; cityClears?: number; totalClears?: number };
}

export async function fetchSeasonalLeaderboard(eventId: string): Promise<SeasonalContestResponse> {
  return apiFetch<SeasonalContestResponse>(`/seasonal/contest/${encodeURIComponent(eventId)}/leaderboard`);
}

/**
 * Fire-and-forget: record one cleared call toward the active seasonal contest.
 * kind 'city' records a CPU-handled clear into its own column (surfaced as
 * "city clears" on the leaderboard + Admin Console); anything else is a
 * manual player clear.
 */
export async function reportSeasonalClear(eventId: string, kind: 'player' | 'city' = 'player'): Promise<void> {
  try {
    await apiFetch(`/seasonal/contest/${encodeURIComponent(eventId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    });
  } catch {
    // Best-effort — the save system still carries the campaign forward offline.
  }
}

export interface AllianceLeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  tag: string | null;
  level: number;
  xp: number;
  recruiting: boolean;
  memberCount: number;
  memberCap: number;
  leaderName: string;
  weeklyCallsRun: number;
  weeklyCleared: number;
  contributors: Array<{
    playerId: string;
    username: string;
    weeklyCallsRun: number;
    weeklyCleared: number;
    missionsCompleted: number;
  }>;
}

export interface AllianceLeaderboardResponse {
  sort: 'xp' | 'weekly';
  weekKey: string;
  myAllianceId: string | null;
  alliances: AllianceLeaderboardEntry[];
}

export interface AllianceLeaderboardDetail {
  alliance: {
    id: string;
    name: string;
    tag: string | null;
    level: number;
    xp: number;
    memberCount: number;
    leaderName: string;
  };
  weekKey: string;
  members: Array<{
    playerId: string;
    username: string;
    role: string;
    level: number;
    xp: number;
    missionsCompleted: number;
    weeklyCallsRun: number;
    weeklyCleared: number;
  }>;
}

export async function fetchAllianceLeaderboard(sort: 'xp' | 'weekly'): Promise<AllianceLeaderboardResponse> {
  return apiFetch<AllianceLeaderboardResponse>(`/leaderboard/alliances?sort=${sort}`);
}

export async function fetchAllianceLeaderboardDetail(allianceId: string): Promise<AllianceLeaderboardDetail> {
  return apiFetch<AllianceLeaderboardDetail>(`/leaderboard/alliances/${allianceId}`);
}

// Admin dashboard (server-gated by the founder/admin email allow-list).
export interface AdminOverview {
  counts: {
    players: number;
    /** Synthetic guest accounts (guest_xxx@dispatchhq.game). */
    guests?: number;
    activeMissions: number;
    chatMessages: number;
    bugReports: number;
    playersWithStats: number;
  };
  connectedNow: number;
  recentPlayers: Array<{ username: string; level: number; xp: number; lastActive: string; email?: string }>;
  founderEmail?: string;
  /** Signup-gate state rides along so the console renders it without a second fetch. */
  signupGate?: SignupGateState;
  /** Maintenance state rides along the same way. */
  maintenance?: MaintenanceState;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return apiFetch<AdminOverview>('/admin/overview');
}

/** Per-route 429 throttle counters (v0.30.0), in-memory since server start. */
export interface AdminRateLimitRoute {
  route: string;
  allowed: number;
  blocked: number;
  lastBlockedAt: number | null;
}

export interface AdminRateLimitOffender {
  key: string;
  blocked: number;
  lastBlockedAt: number;
}

export interface AdminRateLimit {
  routes: AdminRateLimitRoute[];
  offenders: AdminRateLimitOffender[];
  since: number;
}

export async function fetchAdminRateLimit(): Promise<AdminRateLimit> {
  return apiFetch<AdminRateLimit>('/admin/rate-limit');
}

/** A player connected to the server right now (WS presence snapshot — includes
 * level, city, and live activity so the admin roster matches the players panel). */
export interface AdminOnlinePlayer {
  playerId: string;
  username: string;
  allianceId: string | null;
  level: number;
  city: string | null;
  activity: PresenceActivity;
}

// ── Maintenance mode (v0.23) ───────────────────────────────────────────────
// Founder-controlled pause of the online (multiplayer) layer. While active the
// WebSocket rejects connections and /health reports it, so the client shows a
// Maintenance chip. Offline single-player gameplay is unaffected.

export interface MaintenanceState {
  maintenance: boolean;
  reason: string | null;
  since: string | null;
  /** ISO timestamp of a founder-scheduled window (null when none is armed). */
  scheduledAt: string | null;
}

/** Current maintenance state (founder-gated). */
export async function fetchMaintenanceState(): Promise<MaintenanceState> {
  return apiFetch<MaintenanceState>('/admin/maintenance');
}

/** Toggle maintenance mode — every connected client is told live (founder-gated). */
export async function setMaintenanceState(enabled: boolean, reason?: string): Promise<MaintenanceState> {
  return apiFetch<MaintenanceState>('/admin/maintenance', {
    method: 'POST',
    body: JSON.stringify({ enabled, reason: reason ?? null }),
  });
}

/**
 * Arm or cancel a scheduled maintenance window (founder-gated). `scheduledAt`
 * is an ISO timestamp; pass null to cancel. The server flips maintenance
 * automatically when the time arrives and drops the inbox note then.
 */
export async function scheduleMaintenanceState(scheduledAt: string | null, reason?: string): Promise<MaintenanceState> {
  return apiFetch<MaintenanceState>('/admin/maintenance/schedule', {
    method: 'POST',
    body: JSON.stringify({ scheduledAt, reason: reason ?? null }),
  });
}

// ── New-signup gate (v0.29.x) ──────────────────────────────────────────────
// Founder-controlled switch that stops NEW account creation (register +
// guest upgrade) while leaving login and guest play untouched. Default open.

export interface SignupGateState {
  open: boolean;
  since: string | null;
  /** ISO timestamp at which a closed gate reopens automatically (null = manual). */
  reopensAt: string | null;
}

/** Current signup-gate state (founder-gated). */
export async function fetchSignupGateState(): Promise<SignupGateState> {
  return apiFetch<SignupGateState>('/admin/signup-gate');
}

/**
 * Toggle the signup gate: open:false stops new account creation (founder-gated).
 * While closing, `reopensAt` (ISO) arms an automatic reopen — the 403 the
 * register/upgrade forms get carries it for a live countdown.
 */
export async function setSignupGateState(open: boolean, reopensAt?: string | null): Promise<SignupGateState> {
  return apiFetch<SignupGateState>('/admin/signup-gate', {
    method: 'POST',
    body: JSON.stringify({ open, reopensAt: reopensAt ?? null }),
  });
}

/**
 * PUBLIC signup-gate status for the register form + guest-upgrade card.
 * Not founder-gated (unlike fetchSignupGateState) — returns only { open,
 * reopensAt } so unauthenticated visitors see the pause notice + countdown.
 */
export async function fetchSignupStatus(): Promise<{ open: boolean; reopensAt: string | null }> {
  return apiFetch<{ open: boolean; reopensAt: string | null }>('/auth/signup-status');
}

export async function fetchAdminOnline(): Promise<AdminOnlinePlayer[]> {
  const data = await apiFetch<{ online: AdminOnlinePlayer[] }>('/admin/online');
  return Array.isArray(data?.online) ? data.online : [];
}

export type BugReportStatus = 'new' | 'investigating' | 'fixed';

export interface AdminBugReport {
  id: string;
  category: string;
  description: string;
  status: BugReportStatus;
  assignee: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  username: string;
}

/** Per-status totals for the triage digest. */
export interface BugReportCounts {
  new: number;
  investigating: number;
  fixed: number;
}

export interface AdminBugReportsResponse {
  counts: BugReportCounts;
  newThisWeek: number;
  order: 'oldest' | 'newest';
  filter: 'all' | 'unassigned';
  reports: AdminBugReport[];
}

/**
 * Bug reports for the founder, with digest totals (per-status counts + new
 * this week). `order: 'oldest'` surfaces open reports first (triage order);
 * `filter: 'unassigned'` narrows to reports nobody owns yet.
 */
export async function fetchAdminBugReports(options: { order?: 'oldest' | 'newest'; filter?: 'all' | 'unassigned' } = {}): Promise<AdminBugReportsResponse> {
  const params = new URLSearchParams();
  if (options.order) params.set('order', options.order);
  if (options.filter) params.set('filter', options.filter);
  const qs = params.toString();
  return apiFetch<AdminBugReportsResponse>(`/admin/bug-reports${qs ? `?${qs}` : ''}`);
}

/** Triage a bug report: change its status, assignee, and/or team notes (founder-gated). */
export async function updateAdminBugReport(
  id: string,
  patch: { status?: BugReportStatus; assignee?: string | null; notes?: string | null },
): Promise<void> {
  await apiFetch(`/admin/bug-reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** A report filed by the authenticated player, with live triage status. */
export interface MyBugReport {
  id: string;
  category: string;
  description: string;
  status: BugReportStatus;
  assignee: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The authenticated player's own bug reports (newest first) for "My Reports". */
export async function fetchMyBugReports(): Promise<MyBugReport[]> {
  const data = await apiFetch<{ reports: MyBugReport[] }>('/bug-reports/mine');
  return data.reports ?? [];
}

/** Reports the team is investigating or has fixed — shown to players in-game. */
export interface KnownIssue {
  id: string;
  category: string;
  description: string;
  status: BugReportStatus;
  assignee: string | null;
  createdAt: string;
}

export async function fetchKnownIssues(): Promise<KnownIssue[]> {
  const data = await apiFetch<{ issues: KnownIssue[] }>('/bug-reports/known');
  return data.issues ?? [];
}

export type BroadcastKind = 'psa' | 'notice' | 'message';

export interface AdminBroadcastResult {
  success: boolean;
  kind?: BroadcastKind;
  chatPosted?: boolean;
  sentTo: number;
  deliveredToInbox?: number;
}

export async function adminBroadcast(title: string, message: string, kind: BroadcastKind = 'notice'): Promise<AdminBroadcastResult> {
  return apiFetch<AdminBroadcastResult>('/admin/broadcast', {
    method: 'POST',
    body: JSON.stringify({ title, message, kind }),
  });
}

// ── Promo codes & founder bonuses ────────────────────────────────────────────

export interface PromoRewards {
  xp?: number;
  credits?: number;
  coins?: number;
  level?: number;
}

export interface AdminPromoCode {
  id: string;
  code: string;
  label: string | null;
  rewards: PromoRewards;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

/** Founder: create a promo code with optional custom code + rewards. */
export async function createPromoCode(input: {
  code?: string;
  label?: string;
  rewards: PromoRewards;
  maxUses?: number;
  active?: boolean;
  expiresAt?: string | null;
}): Promise<{ success: boolean; code: string }> {
  return apiFetch('/admin/promos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Founder: list promo codes with usage counts. */
export async function fetchAdminPromoCodes(): Promise<AdminPromoCode[]> {
  const { promos } = await apiFetch<{ promos: AdminPromoCode[] }>('/admin/promos');
  return promos ?? [];
}

/** Founder: toggle active / adjust a promo code. */
export async function updatePromoCode(id: string, patch: { active?: boolean; maxUses?: number; label?: string }): Promise<void> {
  await apiFetch(`/admin/promos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** One entry in the founder's promo redemption audit log. */
export interface AdminRedemption {
  id: string;
  promoId: string;
  code: string;
  label: string | null;
  rewards: PromoRewards;
  username: string;
  redeemedAt: string;
  levelAtRedemption: number;
}

/** Founder: who redeemed each promo code, when, and at what level. */
export async function fetchAdminRedemptions(): Promise<AdminRedemption[]> {
  const { redemptions } = await apiFetch<{ redemptions: AdminRedemption[] }>('/admin/redemptions');
  return redemptions ?? [];
}

/** One entry in the founder's guest-upgrade audit log. */
export interface AdminUpgradeAudit {
  id: string;
  guestId: string;
  guestUsername: string | null;
  accountId: string;
  accountUsername: string | null;
  merged: boolean;
  upgradedAt: string;
}

/** Founder: every guest → account upgrade (merged or fresh), newest first. */
export async function fetchAdminUpgrades(): Promise<AdminUpgradeAudit[]> {
  const { upgrades } = await apiFetch<{ upgrades: AdminUpgradeAudit[] }>('/admin/upgrades');
  return upgrades ?? [];
}

/** Founder: grant a direct bonus (XP/credits/coins/level) by username. */
export interface AdminSeasonalEntry {
  rank: number;
  playerId: string;
  username: string;
  level: number;
  callsCleared: number;
  /** CPU-handled clears — own column (v0.22.x). */
  cityClears?: number;
  lastClearedAt: string;
}

export interface AdminSeasonalContest {
  eventId: string;
  label: string;
  window: { start: { month: number; day: number }; end: { month: number; day: number } };
  active: boolean;
  ended: boolean;
  winner: { playerId: string; username: string; calls: number } | null;
  entries: AdminSeasonalEntry[];
  entryCount: number;
  totalClears: number;
  totalCityClears?: number;
}

// ── Player inbox (v0.22.x) — persistent messages (admin broadcasts + mail) ──
export interface InboxMessage {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface InboxResponse {
  messages: InboxMessage[];
  unreadCount: number;
}

export async function fetchInbox(limit = 100): Promise<InboxResponse> {
  return apiFetch<InboxResponse>(`/inbox?limit=${limit}`);
}

export async function markInboxRead(id: string): Promise<void> {
  await apiFetch(`/inbox/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function markInboxAllRead(): Promise<void> {
  await apiFetch('/inbox/read-all', { method: 'POST' });
}

export async function deleteInboxMessage(id: string): Promise<void> {
  await apiFetch(`/inbox/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Founder: per-window seasonal contest standings + winner status. */
export async function fetchAdminSeasonalContests(): Promise<AdminSeasonalContest[]> {
  const { contests } = await apiFetch<{ contests: AdminSeasonalContest[] }>('/admin/seasonal-contests');
  return contests ?? [];
}

/**
 * Founder: manually award (or override) a contest winner. Without playerId the
 * current top clearer is awarded; with one, that player is set as the winner.
 */
export async function adminAwardSeasonalWinner(
  eventId: string,
  playerId?: string,
): Promise<{ success: boolean; winner: { playerId: string; username: string; calls: number }; badgeAwarded: boolean; alreadyEarned: boolean }> {
  return apiFetch(`/admin/seasonal-contests/${encodeURIComponent(eventId)}/award`, {
    method: 'POST',
    body: JSON.stringify({ playerId: playerId ?? null }),
  });
}

export async function adminGrantBonus(username: string, rewards: PromoRewards): Promise<{
  success: boolean;
  username: string;
  granted: PromoRewards;
  player: { credits: number; coins: number; xp: number; level: number };
}> {
  return apiFetch('/admin/grant', {
    method: 'POST',
    body: JSON.stringify({ username, rewards }),
  });
}

/** Player: redeem a promo code for XP/credits/coins/levels. */
export interface RedeemPromoResult {
  success: boolean;
  code: string;
  label: string | null;
  granted: PromoRewards;
  player: { credits: number; coins: number; xp: number; level: number };
}

export async function redeemPromoCode(code: string): Promise<RedeemPromoResult> {
  return apiFetch('/promo/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ── Shop / monetization (v0.31.0) ────────────────────────────────────────────

export interface ShopCoinPack {
  id: string;
  key: string;
  name: string;
  priceCents: number;
  coinCount: number;
}

export interface ShopTier {
  id: string;
  key: string;
  name: string;
  priceCents: number;
  creditMultiplier: number;
  trainingSpeedMultiplier: number;
  perks: string[];
}

export interface ShopCatalog {
  packs: ShopCoinPack[];
  tier: ShopTier | null;
  me: { coins: number; isPremium: boolean; premiumExpiresAt: string | null };
  provider: 'manual' | 'stripe';
}

// ── Daily login bonus (v0.44.0) ───────────────────────────────────────────

export interface DailyBonusStatus {
  claimed: boolean;
  coinsGranted: number;
  claimDate: string;
}

/** Check whether today's daily bonus is available. */
export async function fetchDailyBonusStatus(): Promise<DailyBonusStatus> {
  return apiFetch<DailyBonusStatus>('/daily-bonus');
}

/** Claim today's daily bonus. Idempotent — returns success even if already claimed. */
export async function claimDailyBonus(): Promise<{ success: boolean; coinsGranted: number; alreadyClaimed: boolean }> {
  return apiFetch('/daily-bonus', { method: 'POST' });
}

export async function fetchShopCatalog(): Promise<ShopCatalog> {
  return apiFetch<ShopCatalog>('/shop/catalog');
}

export async function createShopCheckout(
  kind: 'membership' | 'coin_pack',
  itemId: string,
): Promise<{ orderId: string; url?: string; manual?: boolean; message?: string }> {
  return apiFetch('/shop/checkout', {
    method: 'POST',
    body: JSON.stringify({ kind, itemId }),
  });
}

export async function spendCoins(
  input: { kind: 'buy_credits'; coins: number } | { kind: 'skip_training'; remainingSec: number },
): Promise<{ success: boolean; coins: number; creditsGranted?: number; cost?: number }> {
  return apiFetch('/shop/spend', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── Shop admin (v0.31.x): orders + revenue for the founder console ─────────

export type ShopOrderStatus = 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'failed';

export interface AdminShopOrder {
  id: string;
  playerId: string;
  username: string | null;
  kind: 'membership' | 'coin_pack';
  itemId: string;
  itemName: string | null;
  priceCents: number;
  status: ShopOrderStatus;
  provider: string;
  providerRef: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
}

export interface AdminShopSummary {
  /** Realized revenue (fulfilled + paid), in cents. */
  revenueCents: number;
  /** Expected revenue from still-pending manual orders, in cents. */
  pendingCents: number;
  /** All-time order count (the list is capped at the 100 most recent). */
  totalOrders: number;
  pendingCount: number;
  fulfilledCount: number;
}

/** Founder: recent orders + revenue summary (admin-gated). */
export async function fetchAdminShopOrders(): Promise<{ orders: AdminShopOrder[]; summary: AdminShopSummary }> {
  return apiFetch('/admin/shop/orders');
}

/** Founder: fulfill a manual (or stuck) order by id — idempotent server-side. */
export async function adminFulfillShopOrder(
  orderId: string,
): Promise<{ ok: boolean; status: string; message?: string; coinsGranted?: number }> {
  return apiFetch('/admin/shop/fulfill', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
}

export type CoinTransactionReason = 'purchase' | 'spend' | 'promo' | 'admin' | 'refund';

export interface AdminCoinTransaction {
  id: string;
  playerId: string;
  username: string | null;
  /** Signed coin delta: +N credited, -N debited. */
  delta: number;
  reason: CoinTransactionReason;
  refId: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface AdminCoinSummary {
  totalTransactions: number;
  /** Total coins credited (purchases/promo/admin/refund). */
  credited: number;
  /** Total coins debited (spends), as a positive number. */
  debited: number;
  netDelta: number;
  byReason: Partial<Record<CoinTransactionReason, { count: number; netDelta: number }>>;
}

/** Founder: coin-transaction ledger + summary (admin-gated). */
export async function fetchAdminCoinTransactions(): Promise<{ transactions: AdminCoinTransaction[]; summary: AdminCoinSummary }> {
  return apiFetch('/admin/shop/transactions');
}

// ── Social (friends & profiles) ─────────────────────────────────────────────
// The social graph lives in the player_settings jsonb on the server — no
// schema migration required.

export interface SocialProfile {
  id: string;
  username: string;
  avatarEmoji: string;
  since: string;
  level: number;
  xp: number;
}

export interface SocialState {
  friends: SocialProfile[];
  incoming: SocialProfile[];
  outgoing: string[];
}

export const EMPTY_SOCIAL: SocialState = { friends: [], incoming: [], outgoing: [] };

export async function fetchSocial(): Promise<SocialState> {
  return apiFetch<SocialState>('/social');
}

export async function searchPlayers(q: string): Promise<Array<{ id: string; username: string; level: number; xp: number }>> {
  const { results } = await apiFetch<{ results: Array<{ id: string; username: string; level: number; xp: number }> }>(
    `/social/search?q=${encodeURIComponent(q)}`
  );
  return results ?? [];
}

export async function sendFriendRequest(username: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/social/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function respondFriendRequest(fromId: string, accept: boolean): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/social/respond', {
    method: 'POST',
    body: JSON.stringify({ fromId, accept }),
  });
}

export async function removeFriend(friendId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/social/remove', {
    method: 'POST',
    body: JSON.stringify({ friendId }),
  });
}

// ── Alliances ────────────────────────────────────────────────────────────────

export interface AllianceMemberRow {
  playerId: string;
  role: string;
  joinedAt: string;
  username: string;
  level: number;
  xp: number;
}

export interface AllianceSummary {
  id: string;
  name: string;
  tag: string | null;
  leaderId: string;
  level: number;
  xp: number;
  memberCount: number;
  leaderName: string;
  members: AllianceMemberRow[];
  createdAt: string;
  // Recruitment listing
  description: string;
  minLevel: number;
  recruiting: boolean;
}

export interface AllianceDirectoryEntry {
  id: string;
  name: string;
  tag: string | null;
  level: number;
  xp: number;
  leaderId: string;
  description: string;
  minLevel: number;
  recruiting: boolean;
  memberCount: number;
  memberCap: number;
  openSlots: number;
  requested: boolean;
}

export interface AllianceJoinRequest {
  id: string;
  playerId: string;
  username: string;
  level: number;
  createdAt: string;
}

export async function fetchMyAlliance(): Promise<{ alliance: AllianceSummary | null }> {
  return apiFetch<{ alliance: AllianceSummary | null }>('/alliances');
}

export async function createAlliance(name: string, tag?: string): Promise<{ alliance: AllianceSummary; created: boolean }> {
  return apiFetch<{ alliance: AllianceSummary; created: boolean }>('/alliances', {
    method: 'POST',
    body: JSON.stringify({ name, tag }),
  });
}

export async function joinAlliance(name: string): Promise<{ alliance: AllianceSummary; joined: boolean }> {
  return apiFetch<{ alliance: AllianceSummary; joined: boolean }>('/alliances/join', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function leaveAlliance(): Promise<{ left: boolean }> {
  return apiFetch<{ left: boolean }>('/alliances/leave', { method: 'POST' });
}

export async function fetchAllianceDirectory(): Promise<AllianceDirectoryEntry[]> {
  const { alliances } = await apiFetch<{ alliances: AllianceDirectoryEntry[] }>('/alliances/directory');
  return alliances ?? [];
}

// ── Recruitment board (listing + join requests) ─────────────────────────────

export async function updateAllianceListing(listing: {
  description?: string;
  minLevel?: number;
  recruiting?: boolean;
}): Promise<{ alliance: AllianceSummary }> {
  return apiFetch('/alliances/listing', {
    method: 'PATCH',
    body: JSON.stringify(listing),
  });
}

export async function requestAllianceJoin(allianceId: string): Promise<{ requested: boolean }> {
  return apiFetch('/alliances/request', {
    method: 'POST',
    body: JSON.stringify({ allianceId }),
  });
}

export async function fetchAllianceJoinRequests(): Promise<AllianceJoinRequest[]> {
  const { requests } = await apiFetch<{ requests: AllianceJoinRequest[] }>('/alliances/requests');
  return requests ?? [];
}

export async function approveAllianceJoin(requestId: string): Promise<{ success: boolean; memberCount?: number }> {
  return apiFetch(`/alliances/requests/${requestId}/approve`, { method: 'POST' });
}

export async function rejectAllianceJoin(requestId: string): Promise<{ success: boolean }> {
  return apiFetch(`/alliances/requests/${requestId}/reject`, { method: 'POST' });
}

export async function fetchAllianceChat(): Promise<{
  room: string;
  messages: Array<{
    id: string;
    senderName: string;
    text: string;
    createdAt: string;
    // Persisted read receipts: player ids whose clients confirmed delivery.
    readers?: string[];
  }>;
}> {
  return apiFetch('/alliances/chat');
}

export async function postAllianceChat(text: string): Promise<{ message: any }> {
  return apiFetch('/alliances/chat', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// ── Alliance invites & roles (v0.16.1) ───────────────────────────────────────

export async function getAllianceInvite(): Promise<{ code: string }> {
  return apiFetch<{ code: string }>('/alliances/invite');
}

export async function regenerateAllianceInvite(): Promise<{ code: string }> {
  return apiFetch<{ code: string }>('/alliances/invite/regenerate', { method: 'POST' });
}

export async function joinAllianceByCode(code: string): Promise<{ alliance: AllianceSummary; joined: boolean }> {
  return apiFetch<{ alliance: AllianceSummary; joined: boolean }>('/alliances/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function kickAllianceMember(playerId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/alliances/kick', {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export async function setAllianceMemberRole(playerId: string, role: 'officer' | 'member'): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/alliances/role', {
    method: 'POST',
    body: JSON.stringify({ playerId, role }),
  });
}

export async function transferAllianceLeadership(playerId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/alliances/transfer', {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export interface AllianceXpResponse {
  success: boolean;
  xp: number;
  level: number;
  leveledUp: boolean;
  nextLevel: { level: number; xpThreshold: number } | null;
}

export async function creditAllianceXp(xp: number): Promise<AllianceXpResponse> {
  return apiFetch<AllianceXpResponse>('/alliances/xp', {
    method: 'POST',
    body: JSON.stringify({ xp }),
  });
}

// ── Alliance Treasury (v1.0 co-op endgame) ─────────────────────────────────

export interface TreasuryTransaction {
  id: string;
  playerId: string;
  playerName: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

export interface TreasuryResponse {
  balance: number;
  transactions: TreasuryTransaction[];
}

export interface TreasuryLogResponse {
  transactions: TreasuryTransaction[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchTreasury(): Promise<TreasuryResponse> {
  return apiFetch<TreasuryResponse>('/alliances/treasury');
}

export async function fetchTreasuryLog(page = 1, limit = 20): Promise<TreasuryLogResponse> {
  return apiFetch<TreasuryLogResponse>(`/alliances/treasury/log?page=${page}&limit=${limit}`);
}

export async function depositToTreasury(amount: number): Promise<{ balance: number; deposited: number }> {
  return apiFetch('/alliances/treasury/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function withdrawFromTreasury(amount: number): Promise<{ balance: number; withdrawn: number }> {
  return apiFetch('/alliances/treasury/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

// ── Alliance Credit Gifting (v1.0 co-op endgame Phase 2) ──────────────────

export interface GiftEntry {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  amount: number;
  message: string | null;
  createdAt: string;
}

export async function sendGift(receiverId: string, amount: number, message?: string): Promise<{ success: boolean; sent: number; receiverName: string; senderBalance: number }> {
  return apiFetch('/alliances/gifts/send', {
    method: 'POST',
    body: JSON.stringify({ receiverId, amount, message }),
  });
}

export async function fetchGifts(limit = 20): Promise<{ gifts: GiftEntry[] }> {
  return apiFetch(`/alliances/gifts?limit=${limit}`);
}

export async function fetchGiftCap(): Promise<{ dailyCap: number; used: number; remaining: number }> {
  return apiFetch('/alliances/gifts/cap');
}

// ── Alliance Shared Stations (v1.0 co-op endgame Phase 3) ─────────────────

export interface SharedStationEntry {
  id: string;
  ownerId: string;
  allianceId: string;
  type: string;
  level: number;
  name: string;
  position: { lat: number; lng: number };
  capacity: number;
  unitCount: number;
  coverageRadius: number;
}

export async function fetchSharedStations(): Promise<{ stations: SharedStationEntry[] }> {
  return apiFetch('/alliances/shared-stations');
}

export async function buildSharedStation(args: {
  stationType: string;
  name: string;
  lat: number;
  lng: number;
}): Promise<{ station: SharedStationEntry; treasuryBalance: number; costPaid: number }> {
  return apiFetch('/alliances/shared-stations/build', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function upgradeSharedStation(stationId: string): Promise<{ stationId: string; previousLevel: number; newLevel: number; treasuryBalance: number; costPaid: number }> {
  return apiFetch(`/alliances/shared-stations/${stationId}/upgrade`, {
    method: 'POST',
  });
}

export async function claimSharedStation(stationId: string): Promise<{ stationId: string; claimedBy: string; claimCost: number; playerCredits: number }> {
  return apiFetch(`/alliances/shared-stations/${stationId}/claim`, {
    method: 'POST',
  });
}

// ── Alliance Unit Loans (v0.49.0 — Phase 4 co-op endgame) ─────────────────

export interface AllianceLoanEntry {
  id: string;
  unitType: string;
  unitName: string | null;
  lenderId: string;
  lenderName: string;
  borrowerId: string;
  borrowerName: string;
  durationMinutes: number;
  expiresAt: string;
  isLender: boolean;
  isBorrower: boolean;
}

export async function fetchLoans(): Promise<{ loans: AllianceLoanEntry[] }> {
  return apiFetch('/alliances/loans');
}

export async function createLoan(args: {
  borrowerId: string;
  unitType: string;
  unitName?: string;
  durationMinutes?: number;
}): Promise<{ loan: AllianceLoanEntry }> {
  return apiFetch('/alliances/loans/create', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function returnLoan(loanId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/alliances/loans/${loanId}/return`, { method: 'POST' });
}

export async function recallLoan(loanId: string): Promise<{ success: boolean; status: string }> {
  return apiFetch(`/alliances/loans/${loanId}/recall`, { method: 'POST' });
}

// ── Alliance Activity Feed (Phase 5) ────────────────────────────────────────
export interface ActivityEvent {
  id: string;
  playerId: string | null;
  playerName: string;
  eventType: string;
  summary: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchActivity(limit = 50, offset = 0): Promise<{ events: ActivityEvent[]; total: number }> {
  return apiFetch(`/alliances/activity?limit=${limit}&offset=${offset}`);
}

// ── Opt-in session analytics (v0.24.0) ──────────────────────────────────────
// Counts only, no PII, off by default. The client only posts when the player
// has analyticsEnabled; the server double-checks the same setting.

export interface AnalyticsMissionRecord {
  missionType: string;
  category: string;
  responseTimeSeconds: number;
}

export interface AnalyticsSessionPayload {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  missionsCompleted: number;
  city: string | null;
  service: string | null;
  /** Per-mission sample (type/category/response time), capped client-side. */
  missions?: AnalyticsMissionRecord[];
}

/** Fire-and-forget session flush — analytics never blocks gameplay. */
export async function sendAnalyticsSession(payload: AnalyticsSessionPayload): Promise<void> {
  try {
    await apiFetch('/analytics/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort: a failed analytics write is never surfaced to the player.
  }
}

/** Founder-gated trailing-7-day activity summary (sessions/duration/missions). */
export interface AnalyticsMissionTypeSummary {
  type: string;
  category: string | null;
  count: number;
  avgResponseTimeSeconds: number;
  p50ResponseTimeSeconds: number;
  p90ResponseTimeSeconds: number;
  p99ResponseTimeSeconds: number;
}

export interface AnalyticsSummary {
  windowDays: number;
  sessions: number;
  avgDurationSeconds: number;
  missionsCompleted: number;
  avgResponseTimeSeconds: number;
  missionsByType: AnalyticsMissionTypeSummary[];
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>('/analytics/summary');
}
