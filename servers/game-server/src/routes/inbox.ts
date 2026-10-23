// ============================================
// Dispatch HQ — Player Inbox
// ============================================
// Persistent per-player messages (v0.22.x): admin broadcasts and system mail
// land here so offline players still get them. Transient in-session alerts
// (WS notifications) are separate — this table is the durable layer.

import { Hono } from 'hono';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { inboxMessages } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const inbox = new Hono<{ Variables: AuthVars }>();

/** Pure: clamp a list limit to a safe range (default 50, max 200). */
export function parseInboxLimit(raw: string | null | undefined): number {
  return Math.min(Math.max(parseInt(raw ?? '50', 10) || 50, 1), 200);
}

/** Pure: sanitize an inbox title/body for storage (bounded lengths). */
export function sanitizeInboxMessage(rawTitle: unknown, rawBody: unknown): { title: string; body: string } | null {
  const title = String(rawTitle ?? '').trim().slice(0, 120);
  const body = String(rawBody ?? '').trim().slice(0, 2000);
  if (!title || !body) return null;
  return { title, body };
}

/** List the caller's inbox, newest first, with an unread count. */
inbox.get('/', async (c) => {
  const playerId = c.get('playerId');
  const limit = parseInboxLimit(c.req.query('limit'));

  const messages = await db
    .select({
      id: inboxMessages.id,
      title: inboxMessages.title,
      body: inboxMessages.body,
      readAt: inboxMessages.readAt,
      createdAt: inboxMessages.createdAt,
    })
    .from(inboxMessages)
    .where(eq(inboxMessages.recipientId, playerId))
    .orderBy(desc(inboxMessages.createdAt))
    .limit(limit);

  const [unreadRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.recipientId, playerId), isNull(inboxMessages.readAt)));

  return c.json({
    messages: messages.map((m) => ({
      ...m,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    })),
    unreadCount: Number(unreadRow?.n ?? 0),
  });
});

/** Mark one message read (owner-only). */
inbox.post('/:id/read', async (c) => {
  const playerId = c.get('playerId');
  const id = c.req.param('id');
  const owned = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.id, id), eq(inboxMessages.recipientId, playerId)))
    .limit(1);
  if (owned.length === 0) return c.json({ error: 'Message not found' }, 404);
  await db.update(inboxMessages).set({ readAt: new Date() }).where(eq(inboxMessages.id, id));
  return c.json({ success: true });
});

/** Mark every message read (owner-only). */
inbox.post('/read-all', async (c) => {
  const playerId = c.get('playerId');
  const [unreadRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.recipientId, playerId), isNull(inboxMessages.readAt)));
  await db
    .update(inboxMessages)
    .set({ readAt: new Date() })
    .where(and(eq(inboxMessages.recipientId, playerId), isNull(inboxMessages.readAt)));
  return c.json({ success: true, marked: Number(unreadRow?.n ?? 0) });
});

/** Delete a message (owner-only). */
inbox.delete('/:id', async (c) => {
  const playerId = c.get('playerId');
  const id = c.req.param('id');
  const owned = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.id, id), eq(inboxMessages.recipientId, playerId)))
    .limit(1);
  if (owned.length === 0) return c.json({ error: 'Message not found' }, 404);
  await db.delete(inboxMessages).where(eq(inboxMessages.id, id));
  return c.json({ success: true });
});

export { inbox as inboxRoutes };
