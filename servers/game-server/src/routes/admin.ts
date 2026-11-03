// ============================================
// Dispatch HQ — Admin Routes
// ============================================
// Lightweight admin dashboard: overview stats (players, missions, chat,
// bug reports) and a server-wide broadcast pushed to every connected
// player via the WebSocket connection manager.
//
// Access is gated by email against config.adminEmails (ADMIN_EMAILS env),
// so no schema change is needed — the gate is enforced server-side.

import { Hono } from 'hono';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { players, missions, chatMessages, bugReports, playerStats, promoCodes, promoRedemptions, guestUpgradeAudit, seasonalContests, seasonalContestEntries, inboxMessages } from '../db/schema';
import { config, isAdminEmail } from '../config';
import { connectionManager } from '../websocket/connectionManager';
import { getMaintenanceState, setMaintenance, scheduleMaintenance, maintenanceInboxNote } from '../lib/maintenance';
import { getSignupGateState, setSignupGate } from '../lib/signupGate';
import { getRateLimitStats } from '../lib/rateLimit';
import { recordGrant } from '../lib/grants';
import type { AuthVars } from '../auth/middleware';
import type { ServerMessage } from '@dispatch-hq/shared';
import { SEASONAL_WINDOWS, SEASONAL_WINDOW_LABELS, windowActive, windowEnded, getContestWinner, resolveWinner } from './seasonal';
import { awardAchievementByKey } from './achievements';
import { storeChatMessage } from './chat';
import { shopAdminRoutes } from './shop';

/** Broadcast kinds: how the message is styled in Public Chat + inbox. */
export type BroadcastKind = 'psa' | 'notice' | 'message';

const BROADCAST_KINDS: BroadcastKind[] = ['psa', 'notice', 'message'];

export const BROADCAST_KIND_LABELS: Record<BroadcastKind, string> = {
  psa: 'PSA',
  notice: 'Notice',
  message: 'Message',
};

/** Clamp a raw broadcast kind to the known set (defaults to 'notice'). */
export function parseBroadcastKind(raw: unknown): BroadcastKind {
  return typeof raw === 'string' && (BROADCAST_KINDS as string[]).includes(raw)
    ? (raw as BroadcastKind)
    : 'notice';
}

export interface PromoRewards {
  xp?: number;
  credits?: number;
  coins?: number;
  level?: number;
}

/** Clamp + normalize a promo-rewards payload to safe integer values. */
export function parseRewards(raw: unknown): PromoRewards | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: PromoRewards = {};
  const set = (key: keyof PromoRewards, value: unknown) => {
    const n = Math.floor(Number(value));
    if (Number.isFinite(n) && n > 0) out[key] = n;
  };
  if (r.xp !== undefined) set('xp', r.xp);
  if (r.credits !== undefined) set('credits', r.credits);
  if (r.coins !== undefined) set('coins', r.coins);
  if (r.level !== undefined) set('level', r.level);
  if (Object.keys(out).length === 0) return null;
  return out;
}

/**
 * Apply rewards to a player row in-place style helper.
 *
 * NOTE: this intentionally mirrors deltas raw — the game is client-authoritative
 * and the client normalizes XP into levels through the shared advanceLevel curve
 * (v0.19). The client's next save writes back the corrected level/remainder, so
 * the server must NOT level up here or the live-sync delta would double-apply.
 */
export function applyRewards(player: { credits: number; coins: number; xp: number; level: number }, rewards: PromoRewards): PromoRewards {
  const granted: PromoRewards = {};
  if (rewards.credits) { player.credits += rewards.credits; granted.credits = rewards.credits; }
  if (rewards.coins) { player.coins += rewards.coins; granted.coins = rewards.coins; }
  if (rewards.xp) { player.xp += rewards.xp; granted.xp = rewards.xp; }
  if (rewards.level) { player.level += rewards.level; granted.level = rewards.level; }
  return granted;
}

export const REPORT_STATUSES = ['new', 'investigating', 'fixed'] as const;

const admin = new Hono<{ Variables: AuthVars }>();

/** Middleware: only players whose email is in the admin allow-list pass. */
admin.use('*', async (c, next) => {
  const playerId = c.get('playerId');
  const rows = await db
    .select({ email: players.email })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  const email = rows[0]?.email ?? '';
  if (!isAdminEmail(email)) {
    return c.json({ error: 'Forbidden — not an admin account' }, 403);
  }
  await next();
});

export interface BugReportDigestQuery {
  /** 'oldest' sorts open reports first by age (triage order); 'newest' is latest first. */
  order: 'oldest' | 'newest';
  /** 'unassigned' narrows to reports with no assignee yet. */
  filter: 'all' | 'unassigned';
  limit: number;
}

export function parseDigestQuery(orderRaw: string | null | undefined, filterRaw: string | null | undefined, limitRaw: string | null | undefined): BugReportDigestQuery {
  return {
    order: orderRaw === 'oldest' ? 'oldest' : 'newest',
    filter: filterRaw === 'unassigned' ? 'unassigned' : 'all',
    limit: Math.min(Math.max(parseInt(limitRaw ?? '30', 10) || 30, 1), 200),
  };
}

/**
 * Bug-report triage digest: per-status counts, this week's new reports, and a
 * report list the founder can sort (oldest open first) and filter (unassigned).
 */
admin.get('/bug-reports', async (c) => {
  const q = parseDigestQuery(c.req.query('order'), c.req.query('filter'), c.req.query('limit'));

  // Per-status counts (all reports, regardless of the list filter).
  const countRows = await db
    .select({ status: bugReports.status, n: sql<number>`COUNT(*)` })
    .from(bugReports)
    .groupBy(bugReports.status);
  const counts = { new: 0, investigating: 0, fixed: 0 };
  for (const row of countRows) {
    const key = row.status as keyof typeof counts;
    if (key in counts) counts[key] = Number(row.n ?? 0);
  }

  // New reports filed in the last 7 days (the "weekly" digest window).
  // Pass an ISO string — raw sql template params are NOT type-transformed by
  // drizzle, so a JS Date would reach the postgres driver unencoded and crash.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [weekRow] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(bugReports)
    .where(sql`${bugReports.createdAt} >= ${weekAgo}`);

  const base = db
    .select({
      id: bugReports.id,
      category: bugReports.category,
      description: bugReports.description,
      status: bugReports.status,
      assignee: bugReports.assignee,
      notes: bugReports.notes,
      createdAt: bugReports.createdAt,
      updatedAt: bugReports.updatedAt,
      username: players.username,
    })
    .from(bugReports)
    .leftJoin(players, eq(players.id, bugReports.playerId));

  const filtered = q.filter === 'unassigned'
    ? base.where(isNull(bugReports.assignee))
    : base;

  const rows = await filtered
    .orderBy(
      ...(q.order === 'oldest'
        // Open reports (new/investigating) surface first, oldest to newest.
        ? [sql`CASE WHEN ${bugReports.status} = 'fixed' THEN 1 ELSE 0 END`, asc(bugReports.createdAt)]
        : [desc(bugReports.createdAt)]),
    )
    .limit(q.limit);

  return c.json({
    counts,
    newThisWeek: Number(weekRow?.n ?? 0),
    order: q.order,
    filter: q.filter,
    reports: rows.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      status: r.status ?? 'new',
      assignee: r.assignee ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      username: r.username ?? 'unknown',
    })),
  });
});

/** Triage a bug report: change status, assignee, and/or team notes (founder only). */
admin.patch('/bug-reports/:id', async (c) => {
  const id = c.req.param('id');
  let body: { status?: string; assignee?: string | null; notes?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const status = body.status ?? undefined;
  if (status !== undefined && !REPORT_STATUSES.includes(status as (typeof REPORT_STATUSES)[number])) {
    return c.json({ error: 'Invalid status (new | investigating | fixed)' }, 400);
  }

  const existing = await db
    .select({ id: bugReports.id })
    .from(bugReports)
    .where(eq(bugReports.id, id))
    .limit(1);
  if (existing.length === 0) return c.json({ error: 'Report not found' }, 404);

  const assignee =
    body.assignee === undefined
      ? undefined
      : String(body.assignee ?? '').trim().slice(0, 100) || null;
  const notes =
    body.notes === undefined
      ? undefined
      : String(body.notes ?? '').trim().slice(0, 1000) || null;

  await db.update(bugReports)
    .set({
      ...(status !== undefined ? { status: status as (typeof REPORT_STATUSES)[number] } : {}),
      ...(assignee !== undefined ? { assignee } : {}),
      ...(notes !== undefined ? { notes } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bugReports.id, id));

  return c.json({ success: true });
});

/**
 * Guest-upgrade audit log: every guest → account upgrade, whether the
 * campaign was merged or the account started fresh. Immutable trace of who
 * became whom and when, so an accidental merge is visible and recoverable.
 */
admin.get('/upgrades', async (c) => {
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1), 500);
  const guest = alias(players, 'upgrade_guest');
  const account = alias(players, 'upgrade_account');
  const rows = await db
    .select({
      id: guestUpgradeAudit.id,
      guestId: guestUpgradeAudit.guestId,
      guestUsername: guest.username,
      accountId: guestUpgradeAudit.accountId,
      accountUsername: account.username,
      merged: guestUpgradeAudit.merged,
      upgradedAt: guestUpgradeAudit.upgradedAt,
    })
    .from(guestUpgradeAudit)
    .leftJoin(guest, eq(guest.id, guestUpgradeAudit.guestId))
    .leftJoin(account, eq(account.id, guestUpgradeAudit.accountId))
    .orderBy(desc(guestUpgradeAudit.upgradedAt))
    .limit(limit);

  return c.json({ upgrades: rows });
});

/** Overview: totals + recent activity for the dashboard. */
admin.get('/overview', async (c) => {
  const [playerCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(players);
  const [missionCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(missions)
    .where(eq(missions.status, 'active'));
  const [chatCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(chatMessages);
  const [bugCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(bugReports);
  const [statsCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(playerStats);
  const [guestCount] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(players)
    // Match isGuestEmail exactly (guest_ prefix) — escape the underscore so
    // it's a literal, not a LIKE single-char wildcard.
    .where(sql`${players.email} LIKE 'guest\_%@dispatchhq.game'`);

  const recentPlayers = await db
    .select({ username: players.username, level: players.level, xp: players.xp, lastActive: players.lastActive, email: players.email })
    .from(players)
    .orderBy(desc(players.lastActive))
    .limit(10);

  return c.json({
    counts: {
      players: Number(playerCount?.n ?? 0),
      guests: Number(guestCount?.n ?? 0),
      activeMissions: Number(missionCount?.n ?? 0),
      chatMessages: Number(chatCount?.n ?? 0),
      bugReports: Number(bugCount?.n ?? 0),
      playersWithStats: Number(statsCount?.n ?? 0),
    },
    connectedNow: connectionManager.getConnectedCount(),
    recentPlayers,
    founderEmail: config.founderEmail,
    // Gate states ride along so the console renders them without a second
    // fetch per card — same for maintenance below.
    signupGate: getSignupGateState(),
    maintenance: getMaintenanceState(),
  });
});

/**
 * Message every user (v0.22.x → v0.23 revamp): one composer, three kinds.
 *
 * Every broadcast:
 *  1. Posts a styled message into Public Chat (room 'global') so online
 *     players see it live in the chat stream, not just a toast.
 *  2. Pushes a live notification toast to connected players (warning for
 *     PSAs, info otherwise).
 *  3. Writes a durable inbox row for EVERY player (offline included).
 */
admin.post('/broadcast', async (c) => {
  const body = await c.req.json().catch(() => null);
  const kind = parseBroadcastKind(body?.kind);
  const title = String(body?.title ?? BROADCAST_KIND_LABELS[kind]).slice(0, 100);
  const message = String(body?.message ?? '').slice(0, 500);
  if (!message.trim()) {
    return c.json({ error: 'message is required' }, 400);
  }

  // 1) Public Chat: persisted system-style message every online player sees.
  const chatRecord = await storeChatMessage({
    senderId: undefined,
    senderName: 'Dispatch HQ',
    room: 'global',
    type: kind, // psa / notice / message — styled distinctly in the client
    text: message.trim(),
  });
  connectionManager.broadcast({
    type: 'chat',
    id: chatRecord?.id ?? crypto.randomUUID(),
    sender: 'Dispatch HQ',
    text: message.trim(),
    room: 'global',
    kind,
    timestamp: new Date(chatRecord?.createdAt ?? Date.now()).toISOString(),
  } satisfies ServerMessage);

  // 2) Live toast to connected players (PSAs read as warnings).
  connectionManager.broadcast({
    type: 'notification',
    notification: {
      id: crypto.randomUUID(),
      type: kind === 'psa' ? 'warning' : 'info',
      title: kind === 'psa' ? `🚨 PSA — ${title}` : kind === 'notice' ? `📢 ${title}` : `✉️ ${title}`,
      message,
      timestamp: new Date().toISOString(),
    },
  });

  // 3) Durable inbox delivery: one row per player (the roster is small — a
  // couple of hundred accounts at most — so per-recipient rows are cheap).
  const allPlayers = await db.select({ id: players.id }).from(players);
  if (allPlayers.length > 0) {
    await db
      .insert(inboxMessages)
      .values(allPlayers.map((p) => ({
        recipientId: p.id,
        title: `${BROADCAST_KIND_LABELS[kind]}: ${title}`,
        body: message.trim(),
      })));
  }

  return c.json({
    success: true,
    kind,
    chatPosted: true,
    sentTo: connectionManager.getConnectedCount(),
    deliveredToInbox: allPlayers.length,
  });
});

/**
 * Live roster: who is connected right now (from the WS connection manager).
 * Presence is per-instance for connections, but with Redis pub/sub enabled
 * every instance runs the same broadcast fan-out, so this is the authoritative
 * connected set for the console's "Online Now" view.
 */
admin.get('/online', async (c) => {
  return c.json({ online: connectionManager.getPresence() });
});

/**
 * Current maintenance state: whether the online (multiplayer) layer is paused.
 * Founder-only read — the same flag drives /health and the WS reject gate, so
 * this is the source of truth for the Admin Console toggle.
 */
admin.get('/maintenance', (c) => {
  return c.json(getMaintenanceState());
});

/**
 * Rate-limit observability (v0.30.0): per-route allowed/blocked counters and
 * the top offending keys (IP or player id) since the last server start. Makes
 * a 429 wave visible without touching server logs. In-memory, per-instance —
 * the same caveat as the limiter itself.
 */
admin.get('/rate-limit', (c) => {
  return c.json(getRateLimitStats());
});

/**
 * Toggle maintenance mode (founder-only). While enabled, the WebSocket
 * rejects new connections and every connected client is told immediately so
 * their online indicator flips to Maintenance. Offline single-player gameplay
 * is unaffected — only the server-connected (multiplayer) layer is paused.
 */
admin.post('/maintenance', async (c) => {
  const body = await c.req.json().catch(() => null);
  const enabled = body?.enabled === true;
  const reason = typeof body?.reason === 'string' ? body.reason : null;
  const wasEnabled = getMaintenanceState().maintenance;
  await setMaintenance(enabled, reason);

  // Durable inbox note for EVERY player (offline included) so the maintenance
  // window is seen at next login — not just by whoever was connected at the
  // moment of the flip (v0.22.17). Only fires on an actual state change.
  let inboxNotified = 0;
  if (wasEnabled !== enabled) {
    const note = maintenanceInboxNote(enabled, reason);
    const allPlayers = await db.select({ id: players.id }).from(players);
    if (allPlayers.length > 0) {
      await db
        .insert(inboxMessages)
        .values(allPlayers.map((p) => ({ recipientId: p.id, title: note.title, body: note.body })));
      inboxNotified = allPlayers.length;
    }
  }

  return c.json({ success: true, ...getMaintenanceState(), inboxNotified });
});

/**
 * Arm or cancel a scheduled maintenance window (founder-only). `scheduledAt`
 * is an ISO timestamp (null cancels). The server flips maintenance
 * automatically when the time arrives and drops the durable inbox note then,
 * so planned windows don't need a 2am toggle. The schedule syncs across
 * instances via the Redis broadcast channel.
 */
admin.post('/maintenance/schedule', async (c) => {
  const body = await c.req.json().catch(() => null);
  const scheduledAt = typeof body?.scheduledAt === 'string' ? body.scheduledAt : null;
  const reason = typeof body?.reason === 'string' ? body.reason : null;
  try {
    const next = await scheduleMaintenance(scheduledAt, reason);
    return c.json({ success: true, ...next });
  } catch {
    return c.json({ success: false, error: 'Invalid scheduled time' }, 400);
  }
});

/**
 * Current signup-gate state: whether new account creation is open or paused.
 * Founder-only read — the flag gates /api/auth/register + /upgrade server-side.
 */
admin.get('/signup-gate', (c) => {
  return c.json(getSignupGateState());
});

/**
 * Toggle the new-signup gate (founder-only). `open: false` stops NEW account
 * creation (register + guest upgrade) with a 403; login and guest play keep
 * working, so existing players and casual guests are never locked out.
 * Default is open — the gate only closes when the founder flips it.
 */
admin.post('/signup-gate', async (c) => {
  const body = await c.req.json().catch(() => null);
  const open = body?.open !== false; // default: open (only an explicit false closes)
  // Optional auto-reopen: while closing, arm an ISO timestamp at which the
  // gate flips itself back open (clients show a live countdown from the 403's
  // reopensAt). Pass null/omit to close indefinitely.
  const reopensAt = typeof body?.reopensAt === 'string' ? body.reopensAt : null;
  const next = setSignupGate(open, reopensAt);
  return c.json({ success: true, ...next });
});

/** Look up a player by username (case-insensitive) for bonus grants. */
async function findPlayerByUsername(username: string) {
  const rows = await db
    .select()
    .from(players)
    .where(sql`LOWER(${players.username}) = ${username.trim().toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Grant a direct bonus (XP/credits/coins/level) to a player's account by
 * username. Founder-only; used for rewards, restitution, and community events.
 */
admin.post('/grant', async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = String(body?.username ?? '').trim();
  if (!username) return c.json({ error: 'username is required' }, 400);

  const rewards = parseRewards(body?.rewards ?? null);
  if (!rewards) {
    return c.json({ error: 'At least one reward (xp, credits, coins, level) is required' }, 400);
  }

  const player = await findPlayerByUsername(username);
  if (!player) return c.json({ error: 'Player not found' }, 404);

  const target = { credits: player.credits ?? 0, coins: player.coins ?? 0, xp: Number(player.xp) || 0, level: player.level ?? 1 };
  const granted = applyRewards(target, rewards);
  // Batch 1 (P1-M2 + P1-M3): relative increments (never an absolute write from
  // a stale read) + a grant-ledger row in the same transaction, so the client
  // delivers this grant exactly once even when the saved campaign total
  // already exceeds the DB row.
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update(players)
      .set({
        credits: sql`${players.credits} + ${granted.credits ?? 0}`,
        coins: sql`${players.coins} + ${granted.coins ?? 0}`,
        xp: sql`${players.xp} + ${granted.xp ?? 0}`,
        level: sql`${players.level} + ${granted.level ?? 0}`,
        lastActive: new Date(),
      })
      .where(eq(players.id, player.id))
      .returning({ credits: players.credits, coins: players.coins, xp: players.xp, level: players.level });
    if (rows.length === 0) return null;
    await recordGrant(tx as never, player.id, 'admin', randomUUID(), {
      credits: granted.credits ?? 0,
      coins: granted.coins ?? 0,
      xp: granted.xp ?? 0,
      level: granted.level ?? 0,
    });
    return rows[0];
  });
  if (!updated) return c.json({ error: 'Player not found' }, 404);

  return c.json({
    success: true,
    username: player.username,
    granted,
    player: {
      credits: updated.credits,
      coins: updated.coins,
      xp: Number(updated.xp) || 0,
      level: updated.level,
    },
  });
});

/** Create a promo code (founder-only). */
admin.post('/promos', async (c) => {
  const body = await c.req.json().catch(() => null);
  const adminId = c.get('playerId');

  const rewards = parseRewards(body?.rewards ?? null);
  if (!rewards) {
    return c.json({ error: 'At least one reward (xp, credits, coins, level) is required' }, 400);
  }

  const rawCode = String(body?.code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const code = rawCode || randomCode();
  if (code.length < 4 || code.length > 40) return c.json({ error: 'Code must be 4–40 characters' }, 400);
  if (!/^[A-Z0-9-]+$/.test(code)) return c.json({ error: 'Code may only contain letters, numbers, and dashes' }, 400);

  const existing = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  if (existing.length > 0) return c.json({ error: 'Code already exists' }, 409);

  const maxUses = Math.max(1, Math.min(100000, Math.floor(Number(body?.maxUses) || 1)));
  const expiresAt = body?.expiresAt ? new Date(String(body.expiresAt)) : null;

  await db.insert(promoCodes).values({
    code,
    label: String(body?.label ?? '').trim().slice(0, 100) || null,
    rewards,
    maxUses,
    active: body?.active !== false,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    createdBy: adminId,
  });

  return c.json({ success: true, code });
});

/** List promo codes with redemption counts (founder-only). */
admin.get('/promos', async (c) => {
  const rows = await db
    .select({
      id: promoCodes.id,
      code: promoCodes.code,
      label: promoCodes.label,
      rewards: promoCodes.rewards,
      maxUses: promoCodes.maxUses,
      usedCount: promoCodes.usedCount,
      active: promoCodes.active,
      expiresAt: promoCodes.expiresAt,
      createdAt: promoCodes.createdAt,
    })
    .from(promoCodes)
    .orderBy(desc(promoCodes.createdAt))
    .limit(200);

  return c.json({ promos: rows });
});

/** Redemption log: who redeemed each code, when, and at what level. */
admin.get('/redemptions', async (c) => {
  const rows = await db
    .select({
      id: promoRedemptions.id,
      promoId: promoRedemptions.promoId,
      code: promoCodes.code,
      label: promoCodes.label,
      rewards: promoCodes.rewards,
      username: players.username,
      redeemedAt: promoRedemptions.redeemedAt,
      levelAtRedemption: promoRedemptions.levelAtRedemption,
    })
    .from(promoRedemptions)
    .innerJoin(promoCodes, eq(promoRedemptions.promoId, promoCodes.id))
    .innerJoin(players, eq(promoRedemptions.playerId, players.id))
    .orderBy(desc(promoRedemptions.redeemedAt))
    .limit(200);

  return c.json({ redemptions: rows });
});

/** Update a promo code: toggle active, adjust maxUses/label/rewards. */
admin.patch('/promos/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  const existing = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.id, id)).limit(1);
  if (existing.length === 0) return c.json({ error: 'Promo code not found' }, 404);

  const updates: Record<string, unknown> = {};
  if (body?.active !== undefined) updates.active = body.active === true;
  if (body?.maxUses !== undefined) updates.maxUses = Math.max(1, Math.min(100000, Math.floor(Number(body.maxUses) || 1)));
  if (body?.label !== undefined) updates.label = String(body.label).trim().slice(0, 100) || null;
  if (body?.rewards !== undefined) {
    const rewards = parseRewards(body.rewards);
    if (!rewards) return c.json({ error: 'Invalid rewards payload' }, 400);
    updates.rewards = rewards;
  }

  await db.update(promoCodes).set(updates).where(eq(promoCodes.id, id));
  return c.json({ success: true });
});

/** Seasonal contest admin view: per-window standings, totals, and the winner. */
admin.get('/seasonal-contests', async (c) => {
  const contests = [];
  for (const w of SEASONAL_WINDOWS) {
    const winner = windowEnded(w) ? await getContestWinner(w.id) : null;

    const entries = await db
      .select({
        playerId: seasonalContestEntries.playerId,
        callsCleared: seasonalContestEntries.callsCleared,
        cityClears: seasonalContestEntries.cityClears,
        lastClearedAt: seasonalContestEntries.lastClearedAt,
        username: players.username,
        level: players.level,
      })
      .from(seasonalContestEntries)
      .leftJoin(players, eq(seasonalContestEntries.playerId, players.id))
      .where(eq(seasonalContestEntries.eventId, w.id))
      .orderBy(
        desc(sql`${seasonalContestEntries.callsCleared} + ${seasonalContestEntries.cityClears}`),
        desc(seasonalContestEntries.lastClearedAt),
      )
      .limit(10);

    const [totals] = await db
      .select({
        entryCount: sql<number>`count(*)::int`,
        totalClears: sql<number>`coalesce(sum(${seasonalContestEntries.callsCleared} + ${seasonalContestEntries.cityClears}), 0)::int`,
        totalCityClears: sql<number>`coalesce(sum(${seasonalContestEntries.cityClears}), 0)::int`,
      })
      .from(seasonalContestEntries)
      .where(eq(seasonalContestEntries.eventId, w.id));

    contests.push({
      eventId: w.id,
      label: SEASONAL_WINDOW_LABELS[w.id] ?? w.id,
      window: w,
      active: windowActive(w),
      ended: windowEnded(w),
      winner,
      entries: entries.map((e, i) => ({ ...e, rank: i + 1 })),
      entryCount: totals?.entryCount ?? 0,
      totalClears: totals?.totalClears ?? 0,
      totalCityClears: totals?.totalCityClears ?? 0,
    });
  }
  return c.json({ contests });
});

/**
 * Manual winner-award override. With no playerId, awards the current top
 * clearer (manual trigger of the lazy auto-resolution). With a playerId,
 * overrides — used for edge cases (ties, wrong auto-winner, pre-close awards).
 * The seasonal_contests row is upserted (the lock) and the winner badge is
 * awarded idempotently via awardAchievementByKey.
 */
admin.post('/seasonal-contests/:eventId/award', async (c) => {
  const eventId = c.req.param('eventId');
  const w = SEASONAL_WINDOWS.find((x) => x.id === eventId);
  if (!w) return c.json({ error: 'Unknown seasonal event' }, 404);

  const body = await c.req.json().catch(() => null);
  const overrideId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';

  let targetId = overrideId;
  if (!targetId) {
    const top = await db
      .select({ playerId: seasonalContestEntries.playerId })
      .from(seasonalContestEntries)
      .where(eq(seasonalContestEntries.eventId, eventId))
      .orderBy(desc(seasonalContestEntries.callsCleared), desc(seasonalContestEntries.lastClearedAt))
      .limit(1);
    targetId = top[0]?.playerId;
    if (!targetId) return c.json({ error: 'No entries for this event yet' }, 400);
  } else {
    const entry = await db
      .select({ callsCleared: seasonalContestEntries.callsCleared })
      .from(seasonalContestEntries)
      .where(and(eq(seasonalContestEntries.eventId, eventId), eq(seasonalContestEntries.playerId, targetId)))
      .limit(1);
    if (entry.length === 0 || entry[0].callsCleared <= 0) {
      return c.json({ error: 'Player has no cleared calls for this event' }, 400);
    }
  }

  await db
    .insert(seasonalContests)
    .values({ eventId, winnerId: targetId, awardedAt: new Date() })
    .onConflictDoUpdate({
      target: seasonalContests.eventId,
      set: { winnerId: targetId, awardedAt: new Date(), updatedAt: new Date() },
    });

  const awarded = await awardAchievementByKey(targetId, `seasonal_winner_${eventId}`);
  const nameRow = await db.select({ username: players.username }).from(players).where(eq(players.id, targetId)).limit(1);
  const callsRow = await db
    .select({ callsCleared: seasonalContestEntries.callsCleared })
    .from(seasonalContestEntries)
    .where(and(eq(seasonalContestEntries.eventId, eventId), eq(seasonalContestEntries.playerId, targetId)))
    .limit(1);

  return c.json({
    success: true,
    winner: {
      playerId: targetId,
      username: nameRow[0]?.username ?? 'Commander',
      calls: callsRow[0]?.callsCleared ?? 0,
    },
    badgeAwarded: awarded.success,
    alreadyEarned: awarded.alreadyEarned === true,
  });
});

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `DHQ-${seg()}-${seg()}`;
}

// Shop order management (v0.31.0) — inherits the admin email gate above.
admin.route('/shop', shopAdminRoutes);

export { admin as adminRoutes };
