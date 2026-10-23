// ============================================
// Dispatch HQ — Alliance Routes
// ============================================
// Multiplayer guilds: create/join/leave, member list, alliance chat, and
// alliance XP. Persisted via Drizzle; the WebSocket presence layer reads
// membership through the same queries so allied units render on the map.

import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { alliances, allianceMembers, allianceJoinRequests, chatMessages, chatMessageReceipts, players } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import type { ServerMessage } from '@dispatch-hq/shared';
import { allianceLevelFor, nextAllianceLevel } from '@dispatch-hq/shared';
import { canAccessAlliances, ALLIANCE_MIN_LEVEL } from '../config';
import { connectionManager } from '../websocket/connectionManager';

const alliancesRouter = new Hono<{ Variables: AuthVars }>();

/** Short, shareable, collision-checked-on-insert invite code (A-Z0-9, no confusables). */
export function generateInviteCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Pure validation for a recruitment-board join request. Returns an error
 * message, or null when the request is valid. Kept pure so the route
 * middleware and unit tests exercise exactly the same logic.
 */
export function validateJoinRequest(opts: {
  playerLevel: number;
  minLevel: number;
  recruiting: boolean;
  memberCount: number;
  memberCap: number;
  alreadyMember: boolean;
}): string | null {
  if (opts.alreadyMember) return 'You are already in this alliance';
  if (!opts.recruiting) return 'This alliance is not currently recruiting';
  if (opts.playerLevel < opts.minLevel) return `This alliance requires Level ${opts.minLevel}`;
  if (opts.memberCount >= opts.memberCap) return 'This alliance is full right now';
  return null;
}

/**
 * Pure permission check for alliance member management.
 * leader: may kick/promote/demote anyone except themselves.
 * officer: may kick members only (no role changes).
 * member: no management rights.
 */
export function canManageMember(actorRole: string, targetRole: string, targetIsSelf: boolean): {
  canKick: boolean;
  canSetRole: boolean;
} {
  if (targetIsSelf) return { canKick: false, canSetRole: false };
  if (actorRole === 'leader') return { canKick: true, canSetRole: true };
  if (actorRole === 'officer') return { canKick: targetRole === 'member', canSetRole: false };
  return { canKick: false, canSetRole: false };
}

export async function getMyAlliance(playerId: string): Promise<{ alliance: any; memberRole: string } | null> {
  const membership = await db
    .select({
      allianceId: allianceMembers.allianceId,
      role: allianceMembers.role,
    })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  if (membership.length === 0) return null;

  const alliance = await db
    .select()
    .from(alliances)
    .where(eq(alliances.id, membership[0].allianceId))
    .limit(1);
  if (alliance.length === 0) return null;

  return { alliance: alliance[0], memberRole: membership[0].role };
}

async function allianceSummary(allianceId: string) {
  const [a] = await db.select().from(alliances).where(eq(alliances.id, allianceId)).limit(1);
  if (!a) return null;
  const members = await db
    .select({
      playerId: allianceMembers.playerId,
      role: allianceMembers.role,
      joinedAt: allianceMembers.joinedAt,
      username: players.username,
      level: players.level,
      xp: players.xp,
    })
    .from(allianceMembers)
    .innerJoin(players, eq(players.id, allianceMembers.playerId))
    .where(eq(allianceMembers.allianceId, allianceId));
  const leader = await db
    .select({ username: players.username })
    .from(players)
    .where(eq(players.id, a.leaderId))
    .limit(1);
  return {
    ...a,
    memberCount: members.length,
    leaderName: leader[0]?.username ?? 'Unknown',
    members,
  };
}

// Alliances are locked until Level ALLIANCE_MIN_LEVEL (founder exempt).
async function assertAllianceAccess(c: any): Promise<boolean> {
  const playerId = c.get('playerId');
  const [p] = await db
    .select({ email: players.email, level: players.level })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!p) return false;
  if (canAccessAlliances(p.email, p.level)) return true;
  return false;
}

// Create an alliance (creator becomes leader). One alliance per player.
alliancesRouter.post('/', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim().slice(0, 60);
  const tag = String(body.tag ?? '').trim().slice(0, 8).toUpperCase();
  if (!name) return c.json({ error: 'Alliance name is required' }, 400);

  const unlocked = await assertAllianceAccess(c);
  if (!unlocked) {
    return c.json({
      error: `Alliances unlock at Level ${ALLIANCE_MIN_LEVEL} — keep responding to calls to rank up.`,
    }, 403);
  }

  const existing = await getMyAlliance(playerId);
  if (existing) return c.json({ error: 'You are already in an alliance' }, 409);

  // Collision-safe invite code (unique index on alliances.invite_code):
  // a short retry loop re-rolls instead of mutating the code length.
  let inviteCode = generateInviteCode();
  for (let attempt = 0; attempt < 3; attempt++) {
    const [collision] = await db
      .select({ id: alliances.id })
      .from(alliances)
      .where(eq(alliances.inviteCode, inviteCode))
      .limit(1)
      .catch(() => []);
    if (!collision) break;
    inviteCode = generateInviteCode();
  }

  const [row] = await db.insert(alliances).values({
    name,
    tag: tag || null,
    leaderId: playerId,
    inviteCode,
  }).returning();
  await db.insert(allianceMembers).values({
    allianceId: row.id,
    playerId,
    role: 'leader',
  });
  // Keep the live WS session in sync so presence + alliance chat fan-out
  // know about the new membership immediately (no reconnect needed).
  connectionManager.setAlliance(playerId, row.id);

  return c.json({ alliance: await allianceSummary(row.id), created: true }, 201);
});

// List my alliance (with members).
alliancesRouter.get('/', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ alliance: null });
  return c.json({ alliance: await allianceSummary(mine.alliance.id) });
});

// Join an alliance by invite code OR name (must exist, cannot already belong).
alliancesRouter.post('/join', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => ({}));
  const code = String(body.code ?? '').trim().toUpperCase().slice(0, 12);
  const name = String(body.name ?? '').trim().slice(0, 60);
  if (!code && !name) return c.json({ error: 'Enter an invite code or alliance name' }, 400);

  const unlocked = await assertAllianceAccess(c);
  if (!unlocked) {
    return c.json({
      error: `Alliances unlock at Level ${ALLIANCE_MIN_LEVEL} — keep responding to calls to rank up.`,
    }, 403);
  }

  const existing = await getMyAlliance(playerId);
  if (existing) return c.json({ error: 'You are already in an alliance' }, 409);

  let target;
  if (code) {
    // Invite codes are exact (case-insensitive input normalized to upper).
    [target] = await db.select().from(alliances).where(eq(alliances.inviteCode, code)).limit(1);
  } else {
    // Case-insensitive name match so "fire dept" finds "Fire Dept".
    [target] = await db
      .select()
      .from(alliances)
      .where(sql`lower(${alliances.name}) = lower(${name})`)
      .limit(1);
  }
  if (!target) return c.json({ error: code ? 'Invalid invite code' : 'Alliance not found' }, 404);

  // Member cap (level-based perk): reject join when the roster is full.
  const [{ count }] = await db
    .select({ count: sql<number>`count(${allianceMembers.playerId})::int` })
    .from(allianceMembers)
    .where(eq(allianceMembers.allianceId, target.id));
  const cap = allianceLevelFor(target.xp ?? 0).memberCap;
  if (count >= cap) {
    return c.json({ error: `Alliance is full (${count}/${cap} members) — ask the leader to level it up` }, 409);
  }

  const [inserted] = await db.insert(allianceMembers).values({
    allianceId: target.id,
    playerId,
    role: 'member',
  }).onConflictDoNothing().returning();
  if (!inserted) return c.json({ error: 'You are already in an alliance' }, 409);
  // Keep the live WS session in sync (see the create route above).
  connectionManager.setAlliance(playerId, target.id);

  return c.json({ alliance: await allianceSummary(target.id), joined: true });
});

// Credit shared alliance XP (client-authoritative game state reports mission
// completions). Rate-safe: a per-request cap + a per-player cooldown prevent
// flooding; the server recomputes level from the shared ladder and reports
// level-ups.
const MAX_XP_PER_REQUEST = 500;
const XP_COOLDOWN_MS = 1500;
const lastXpCredit = new Map<string, number>();
alliancesRouter.post('/xp', async (c) => {
  const playerId = c.get('playerId');
  const now = Date.now();
  const last = lastXpCredit.get(playerId);
  if (last !== undefined && now - last < XP_COOLDOWN_MS) {
    return c.json({ error: 'Too many credits — slow down' }, 429);
  }
  lastXpCredit.set(playerId, now);
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const amount = Math.min(Number(body.xp) || 0, MAX_XP_PER_REQUEST);
  if (amount <= 0) return c.json({ error: 'xp must be a positive number' }, 400);

  const before = mine.alliance.level;
  const newXp = (mine.alliance.xp ?? 0) + Math.round(amount);
  const levelInfo = allianceLevelFor(newXp);
  await db.update(alliances).set({ xp: newXp, level: levelInfo.level }).where(eq(alliances.id, mine.alliance.id));

  const leveledUp = levelInfo.level > before;
  return c.json({
    success: true,
    xp: newXp,
    level: levelInfo.level,
    leveledUp,
    nextLevel: nextAllianceLevel(newXp),
  });
});

// View my alliance's shareable invite code.
alliancesRouter.get('/invite', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  return c.json({ code: mine.alliance.inviteCode });
});

// Regenerate the invite code (leader only — invalidates the old one).
alliancesRouter.post('/invite/regenerate', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can rotate the invite code' }, 403);
  const code = generateInviteCode();
  await db.update(alliances).set({ inviteCode: code }).where(eq(alliances.id, mine.alliance.id));
  return c.json({ code });
});

// Kick a member (leader can kick anyone; officer can kick members).
alliancesRouter.post('/kick', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const targetId = String(body.playerId ?? '');
  if (!targetId) return c.json({ error: 'playerId is required' }, 400);

  const [target] = await db
    .select({ playerId: allianceMembers.playerId, role: allianceMembers.role })
    .from(allianceMembers)
    .where(and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)))
    .limit(1);
  if (!target) return c.json({ error: 'Member not found' }, 404);

  const perms = canManageMember(mine.memberRole, target.role, targetId === playerId);
  if (!perms.canKick) return c.json({ error: 'You do not have permission to kick that member' }, 403);

  await db.delete(allianceMembers).where(
    and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)),
  );
  // Kicked players stop receiving that alliance's live chat immediately.
  connectionManager.setAlliance(targetId, null);
  return c.json({ success: true });
});

// Promote/demote a member (leader only).
alliancesRouter.post('/role', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can change roles' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetId = String(body.playerId ?? '');
  const role = String(body.role ?? '');
  if (!targetId || !['officer', 'member'].includes(role)) {
    return c.json({ error: 'role must be officer or member' }, 400);
  }
  if (targetId === playerId) return c.json({ error: 'You cannot change your own role' }, 400);

  const [target] = await db
    .select({ playerId: allianceMembers.playerId, role: allianceMembers.role })
    .from(allianceMembers)
    .where(and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)))
    .limit(1);
  if (!target) return c.json({ error: 'Member not found' }, 404);

  await db.update(allianceMembers).set({ role }).where(
    and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)),
  );
  return c.json({ success: true });
});

// Transfer leadership to another member (leader only). The new leader keeps
// their officer/member role as a marker; the old leader becomes an officer.
alliancesRouter.post('/transfer', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can transfer leadership' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetId = String(body.playerId ?? '');
  if (!targetId) return c.json({ error: 'playerId is required' }, 400);
  if (targetId === playerId) return c.json({ error: 'You already lead this alliance' }, 400);

  const [target] = await db
    .select({ playerId: allianceMembers.playerId })
    .from(allianceMembers)
    .where(and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)))
    .limit(1);
  if (!target) return c.json({ error: 'Member not found' }, 404);

  await db.update(alliances).set({ leaderId: targetId }).where(eq(alliances.id, mine.alliance.id));
  await db.update(allianceMembers).set({ role: 'leader' }).where(
    and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, targetId)),
  );
  await db.update(allianceMembers).set({ role: 'officer' }).where(
    and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, playerId)),
  );
  return c.json({ success: true });
});

// Leave my current alliance.
alliancesRouter.post('/leave', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);

  const isLeader = mine.memberRole === 'leader';
  await db.delete(allianceMembers).where(
    and(
      eq(allianceMembers.allianceId, mine.alliance.id),
      eq(allianceMembers.playerId, playerId),
    ),
  );
  connectionManager.setAlliance(playerId, null);

  if (isLeader) {
    // Promote the oldest remaining member, else dissolve.
    const [next] = await db
      .select({ playerId: allianceMembers.playerId })
      .from(allianceMembers)
      .where(eq(allianceMembers.allianceId, mine.alliance.id))
      .orderBy(allianceMembers.joinedAt)
      .limit(1);
    if (next) {
      await db.update(alliances).set({ leaderId: next.playerId }).where(eq(alliances.id, mine.alliance.id));
      await db.update(allianceMembers)
        .set({ role: 'leader' })
        .where(and(eq(allianceMembers.allianceId, mine.alliance.id), eq(allianceMembers.playerId, next.playerId)));
    } else {
      await db.delete(alliances).where(eq(alliances.id, mine.alliance.id));
      // No members left — dissolve. Drop the dead alliance id from every
      // connected player's session meta so nobody keeps receiving chat for it.
      connectionManager.clearAlliance(mine.alliance.id);
    }
  }

  return c.json({ left: true });
});

// Alliance chat — reuse the chat_messages table with room = `alliance:<id>`.
alliancesRouter.get('/chat', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const room = `alliance:${mine.alliance.id}`;
  const rows = await db
    .select({
      id: chatMessages.id,
      senderId: chatMessages.senderId,
      senderName: chatMessages.senderName,
      type: chatMessages.type,
      text: chatMessages.text,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.room, room))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Attach persisted read receipts so ✓✓ survives reloads and REST-fallback
  // messages reconcile: readers[] is the list of member ids who acked each
  // message. The sender's own id is never present (acks are never self-sent).
  const receiptsByMessage = new Map<string, string[]>();
  const messageIds = rows.map((r) => r.id);
  if (messageIds.length > 0) {
    const receiptRows = await db
      .select({
        messageId: chatMessageReceipts.messageId,
        readerId: chatMessageReceipts.readerId,
      })
      .from(chatMessageReceipts)
      .where(inArray(chatMessageReceipts.messageId, messageIds));
    for (const r of receiptRows) {
      const list = receiptsByMessage.get(r.messageId) ?? [];
      list.push(r.readerId);
      receiptsByMessage.set(r.messageId, list);
    }
  }

  const messages = rows.reverse().map((r) => ({
    ...r,
    readers: receiptsByMessage.get(r.id) ?? [],
  }));
  return c.json({ room, messages });
});

alliancesRouter.post('/chat', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text ?? '').trim().slice(0, 500);
  if (!text) return c.json({ error: 'Message is required' }, 400);

  const [username] = await db
    .select({ username: players.username })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const [row] = await db.insert(chatMessages).values({
    senderId: playerId,
    senderName: username?.username ?? 'Commander',
    room: `alliance:${mine.alliance.id}`,
    type: 'user',
    text,
  }).returning();

  return c.json({ message: row }, 201);
});

// Recruitment listing (leader only): description, min-level requirement, and
// whether the alliance is open to join requests.
alliancesRouter.patch('/listing', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can manage the listing' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 500);
  if (body.minLevel !== undefined) {
    patch.minLevel = Math.min(50, Math.max(1, Math.round(Number(body.minLevel) || 1)));
  }
  if (typeof body.recruiting === 'boolean') patch.recruiting = body.recruiting;
  if (Object.keys(patch).length === 0) return c.json({ error: 'Nothing to update' }, 400);

  await db.update(alliances).set(patch).where(eq(alliances.id, mine.alliance.id));
  return c.json({ alliance: await allianceSummary(mine.alliance.id) });
});

// Request to join a recruiting alliance — the leader approves or declines.
alliancesRouter.post('/request', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => ({}));
  const allianceId = String(body.allianceId ?? '');
  if (!allianceId) return c.json({ error: 'allianceId is required' }, 400);

  const unlocked = await assertAllianceAccess(c);
  if (!unlocked) {
    return c.json({
      error: `Alliances unlock at Level ${ALLIANCE_MIN_LEVEL} — keep responding to calls to rank up.`,
    }, 403);
  }

  const [target] = await db.select().from(alliances).where(eq(alliances.id, allianceId)).limit(1);
  if (!target) return c.json({ error: 'Alliance not found' }, 404);

  // One alliance per player — an existing membership anywhere blocks requests.
  const existing = await getMyAlliance(playerId);
  if (existing) return c.json({ error: 'You are already in an alliance' }, 409);

  const [player] = await db
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  const [{ count }] = await db
    .select({ count: sql<number>`count(${allianceMembers.playerId})::int` })
    .from(allianceMembers)
    .where(eq(allianceMembers.allianceId, allianceId));

  const problem = validateJoinRequest({
    playerLevel: player?.level ?? 1,
    minLevel: target.minLevel ?? 1,
    recruiting: target.recruiting ?? false,
    memberCount: count,
    memberCap: allianceLevelFor(target.xp ?? 0).memberCap,
    alreadyMember: false,
  });
  if (problem) return c.json({ error: problem }, 409);

  // The partial unique index (allianceId, playerId) WHERE status = 'pending'
  // makes this race-free: a concurrent duplicate insert is a clean 409.
  const [inserted] = await db.insert(allianceJoinRequests).values({
    allianceId,
    playerId,
    status: 'pending',
  }).onConflictDoNothing().returning();
  if (!inserted) return c.json({ error: 'You already have a pending request for this alliance' }, 409);

  return c.json({ requested: true });
});

// Pending join requests for my alliance (leader/officer can view).
alliancesRouter.get('/requests', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole === 'member') return c.json({ requests: [] });

  const rows = await db
    .select({
      id: allianceJoinRequests.id,
      playerId: allianceJoinRequests.playerId,
      username: players.username,
      level: players.level,
      createdAt: allianceJoinRequests.createdAt,
    })
    .from(allianceJoinRequests)
    .innerJoin(players, eq(players.id, allianceJoinRequests.playerId))
    .where(and(eq(allianceJoinRequests.allianceId, mine.alliance.id), eq(allianceJoinRequests.status, 'pending')))
    .orderBy(allianceJoinRequests.createdAt);
  return c.json({ requests: rows });
});

// Approve a join request (leader only). Roster + cap are re-checked at
// approval time; the requester is notified live if they're connected.
alliancesRouter.post('/requests/:id/approve', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can approve requests' }, 403);

  const requestId = c.req.param('id');
  const [req] = await db
    .select()
    .from(allianceJoinRequests)
    .where(and(
      eq(allianceJoinRequests.id, requestId),
      eq(allianceJoinRequests.allianceId, mine.alliance.id),
      eq(allianceJoinRequests.status, 'pending'),
    ))
    .limit(1);
  if (!req) return c.json({ error: 'Request not found' }, 404);

  // The requester may have joined another alliance (or this one via a code)
  // while the request sat pending — never let anyone hold two memberships.
  const theirs = await getMyAlliance(req.playerId);
  if (theirs) {
    await db.update(allianceJoinRequests)
      .set({ status: 'rejected', resolvedAt: new Date() })
      .where(eq(allianceJoinRequests.id, requestId));
    return c.json({ error: 'That player already belongs to an alliance' }, 409);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(${allianceMembers.playerId})::int` })
    .from(allianceMembers)
    .where(eq(allianceMembers.allianceId, mine.alliance.id));
  const cap = allianceLevelFor(mine.alliance.xp ?? 0).memberCap;
  if (count >= cap) {
    await db.update(allianceJoinRequests)
      .set({ status: 'rejected', resolvedAt: new Date() })
      .where(eq(allianceJoinRequests.id, requestId));
    return c.json({ error: 'Alliance is full — request auto-declined' }, 409);
  }

  const [inserted] = await db.insert(allianceMembers).values({
    allianceId: mine.alliance.id,
    playerId: req.playerId,
    role: 'member',
  }).onConflictDoNothing().returning();
  if (!inserted) {
    await db.update(allianceJoinRequests)
      .set({ status: 'rejected', resolvedAt: new Date() })
      .where(eq(allianceJoinRequests.id, requestId));
    return c.json({ error: 'That player already belongs to an alliance' }, 409);
  }

  await db.update(allianceJoinRequests)
    .set({ status: 'approved', resolvedAt: new Date() })
    .where(eq(allianceJoinRequests.id, requestId));
  connectionManager.setAlliance(req.playerId, mine.alliance.id);
  connectionManager.sendTo(req.playerId, {
    type: 'notification',
    notification: {
      id: crypto.randomUUID(),
      type: 'success',
      title: 'Alliance invitation accepted',
      message: `You've been accepted into ${mine.alliance.name}!`,
      timestamp: new Date().toISOString(),
    },
  } satisfies ServerMessage);
  return c.json({ success: true, memberCount: count + 1 });
});

// Decline a join request (leader only).
alliancesRouter.post('/requests/:id/reject', async (c) => {
  const playerId = c.get('playerId');
  const mine = await getMyAlliance(playerId);
  if (!mine) return c.json({ error: 'You are not in an alliance' }, 404);
  if (mine.memberRole !== 'leader') return c.json({ error: 'Only the leader can decline requests' }, 403);

  const requestId = c.req.param('id');
  const [req] = await db
    .select({ id: allianceJoinRequests.id, playerId: allianceJoinRequests.playerId })
    .from(allianceJoinRequests)
    .where(and(
      eq(allianceJoinRequests.id, requestId),
      eq(allianceJoinRequests.allianceId, mine.alliance.id),
      eq(allianceJoinRequests.status, 'pending'),
    ))
    .limit(1);
  if (!req) return c.json({ error: 'Request not found' }, 404);

  await db.update(allianceJoinRequests)
    .set({ status: 'rejected', resolvedAt: new Date() })
    .where(eq(allianceJoinRequests.id, requestId));
  // Parity with approve: the requester finds out live instead of waiting for
  // the next directory poll.
  connectionManager.sendTo(req.playerId, {
    type: 'notification',
    notification: {
      id: crypto.randomUUID(),
      type: 'info',
      title: 'Alliance request declined',
      message: `Your request to join ${mine.alliance.name} was declined.`,
      timestamp: new Date().toISOString(),
    },
  } satisfies ServerMessage);
  return c.json({ success: true });
});

// Recruitment board — every alliance with its listing fields, live open
// slots, and whether the caller already has a pending request.
alliancesRouter.get('/directory', async (c) => {
  const playerId = c.get('playerId');
  const myPending = await db
    .select({ allianceId: allianceJoinRequests.allianceId })
    .from(allianceJoinRequests)
    .where(and(eq(allianceJoinRequests.playerId, playerId), eq(allianceJoinRequests.status, 'pending')));
  const pendingSet = new Set(myPending.map((r) => r.allianceId));

  const rows = await db
    .select({
      id: alliances.id,
      name: alliances.name,
      tag: alliances.tag,
      level: alliances.level,
      xp: alliances.xp,
      leaderId: alliances.leaderId,
      description: alliances.description,
      minLevel: alliances.minLevel,
      recruiting: alliances.recruiting,
      memberCount: sql<number>`count(${allianceMembers.playerId})::int`,
    })
    .from(alliances)
    .leftJoin(allianceMembers, eq(allianceMembers.allianceId, alliances.id))
    .groupBy(alliances.id)
    .orderBy(sql`${alliances.recruiting} desc, count(${allianceMembers.playerId})::int desc`)
    .limit(50);

  return c.json({
    alliances: rows.map((r) => {
      const cap = allianceLevelFor(r.xp ?? 0).memberCap;
      return {
        ...r,
        memberCap: cap,
        openSlots: Math.max(0, cap - r.memberCount),
        requested: pendingSet.has(r.id),
      };
    }),
  });
});

export { alliancesRouter };

