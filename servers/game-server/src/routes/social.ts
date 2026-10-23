// ============================================
// Dispatch HQ — Social Routes
// ============================================
// Friends & profiles. The social graph (friends, incoming/outgoing requests)
// lives in the player_settings jsonb blob under the `social` key — no schema
// migration needed, and it survives on the same row as the player's other
// preferences.

import { Hono } from 'hono';
import { eq, sql, ilike } from 'drizzle-orm';
import { db } from '../db';
import { players, playerSettings } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const social = new Hono<{ Variables: AuthVars }>();

export interface SocialFriend {
  id: string;
  username: string;
  avatarEmoji: string;
  since: string;
}

interface SocialBlob {
  friends: SocialFriend[];
  incoming: SocialFriend[];
  outgoing: string[]; // usernames we've sent requests to
}

const EMPTY_SOCIAL: SocialBlob = { friends: [], incoming: [], outgoing: [] };

export async function readSocial(playerId: string): Promise<SocialBlob> {
  const rows = await db
    .select({ settings: playerSettings.settings })
    .from(playerSettings)
    .where(eq(playerSettings.playerId, playerId))
    .limit(1);
  const settings = rows[0]?.settings as Record<string, unknown> | null | undefined;
  const blob = settings?.social as SocialBlob | undefined;
  return { ...EMPTY_SOCIAL, ...(blob ?? {}) };
}

async function writeSocial(playerId: string, blob: SocialBlob): Promise<void> {
  const rows = await db
    .select({ settings: playerSettings.settings })
    .from(playerSettings)
    .where(eq(playerSettings.playerId, playerId))
    .limit(1);
  const current = rows[0]?.settings as Record<string, unknown> | null | undefined;
  const next = { ...(current ?? {}), social: blob };
  await db.insert(playerSettings)
    .values({ playerId, settings: next })
    .onConflictDoUpdate({
      target: playerSettings.playerId,
      set: { settings: next, updatedAt: new Date() },
    });
}

/** Attach live level/xp from the players table for profile cards. */
async function enrich(friends: SocialFriend[]): Promise<(SocialFriend & { level: number; xp: number })[]> {
  if (friends.length === 0) return [];
  const rows = await db
    .select({ id: players.id, level: players.level, xp: players.xp })
    .from(players)
    .where(sql`${players.id} = ANY(${friends.map((f) => f.id)})`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return friends.map((f) => ({
    ...f,
    level: byId.get(f.id)?.level ?? 1,
    xp: byId.get(f.id)?.xp ?? 0,
  }));
}

// My friends + requests (enriched with live level/xp).
social.get('/', async (c) => {
  const playerId = c.get('playerId');
  const blob = await readSocial(playerId);
  return c.json({
    friends: await enrich(blob.friends),
    incoming: await enrich(blob.incoming),
    outgoing: blob.outgoing,
  });
});

// Search players by username (excludes me).
social.get('/search', async (c) => {
  const playerId = c.get('playerId');
  const q = (c.req.query('q') || '').trim().slice(0, 30);
  if (q.length < 2) return c.json({ results: [] });
  const rows = await db
    .select({ id: players.id, username: players.username, level: players.level, xp: players.xp })
    .from(players)
    .where(ilike(players.username, `%${q}%`))
    .limit(8);
  return c.json({ results: rows.filter((r) => r.id !== playerId) });
});

// Send a friend request by username.
social.post('/request', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const username = String(body?.username ?? '').trim().slice(0, 30);
  if (!username) return c.json({ error: 'username required' }, 400);

  const [me] = await db.select({ id: players.id, username: players.username, email: players.email }).from(players).where(eq(players.id, playerId)).limit(1);
  const [target] = await db.select({ id: players.id, username: players.username }).from(players).where(sql`lower(${players.username}) = lower(${username})`).limit(1);
  if (!target) return c.json({ error: 'Player not found' }, 404);
  if (target.id === playerId) return c.json({ error: "You can't friend yourself" }, 400);

  const mine = await readSocial(playerId);
  if (mine.friends.some((f) => f.id === target.id)) return c.json({ error: 'Already friends' }, 400);
  if (mine.outgoing.includes(target.username)) return c.json({ error: 'Request already sent' }, 400);

  mine.outgoing = Array.from(new Set([...mine.outgoing, target.username]));
  await writeSocial(playerId, mine);

  const theirs = await readSocial(target.id);
  if (!theirs.incoming.some((f) => f.id === playerId)) {
    theirs.incoming = [...theirs.incoming, { id: playerId, username: me.username, avatarEmoji: '', since: new Date().toISOString() }];
    await writeSocial(target.id, theirs);
  }

  return c.json({ success: true });
});

// Accept or decline an incoming request.
social.post('/respond', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const fromId = String(body?.fromId ?? '');
  const accept = Boolean(body?.accept);
  if (!fromId) return c.json({ error: 'fromId required' }, 400);

  const [me] = await db.select({ id: players.id, username: players.username }).from(players).where(eq(players.id, playerId)).limit(1);

  const mine = await readSocial(playerId);
  const request = mine.incoming.find((f) => f.id === fromId);
  if (!request) return c.json({ error: 'No such request' }, 404);
  mine.incoming = mine.incoming.filter((f) => f.id !== fromId);

  const [requester] = await db.select({ id: players.id, username: players.username }).from(players).where(eq(players.id, fromId)).limit(1);
  if (requester) {
    const theirs = await readSocial(fromId);
    // The requester's outgoing list stores the TARGET username (mine), so
    // removing it clears their pending-request entry on accept or decline.
    theirs.outgoing = theirs.outgoing.filter((u) => u !== me?.username);
    if (accept) {
      if (!mine.friends.some((f) => f.id === fromId)) {
        mine.friends = [...mine.friends, { ...request, since: new Date().toISOString() }];
      }
      if (!theirs.friends.some((f) => f.id === playerId)) {
        theirs.friends = [...theirs.friends, { id: playerId, username: me?.username ?? '', avatarEmoji: '', since: new Date().toISOString() }];
      }
    }
    await writeSocial(fromId, theirs);
  }

  await writeSocial(playerId, mine);
  return c.json({ success: true, accepted: accept });
});

// Remove a friend (either side).
social.post('/remove', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);
  const friendId = String(body?.friendId ?? '');
  if (!friendId) return c.json({ error: 'friendId required' }, 400);

  const mine = await readSocial(playerId);
  const friend = mine.friends.find((f) => f.id === friendId);
  mine.friends = mine.friends.filter((f) => f.id !== friendId);
  await writeSocial(playerId, mine);

  if (friend) {
    const theirs = await readSocial(friendId);
    theirs.friends = theirs.friends.filter((f) => f.id !== playerId);
    await writeSocial(friendId, theirs);
  }

  return c.json({ success: true });
});

export { social as socialRoutes };
