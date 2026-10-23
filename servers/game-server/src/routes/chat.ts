// ============================================
// Dispatch HQ — Chat Routes
// ============================================
// Persisted multiplayer chat history. WebSocket messages are also
// stored via this module so chat survives reloads.

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { chatMessages, players } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const chat = new Hono<{ Variables: AuthVars }>();

chat.get('/', async (c) => {
  const room = (c.req.query('room') || 'global').slice(0, 50);
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 200);
  const rows = await db
    .select({
      id: chatMessages.id,
      senderId: chatMessages.senderId,
      senderName: chatMessages.senderName,
      room: chatMessages.room,
      type: chatMessages.type,
      text: chatMessages.text,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.room, room))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return c.json({ room, messages: rows.reverse() });
});

export interface CreateChatMessageOptions {
  senderId?: string;
  senderName: string;
  room?: string;
  type?: string;
  text: string;
}

export async function storeChatMessage(opts: CreateChatMessageOptions) {
  const [row] = await db.insert(chatMessages).values({
    senderId: opts.senderId ?? null,
    senderName: opts.senderName.slice(0, 100),
    room: (opts.room || 'global').slice(0, 50),
    type: (opts.type || 'user').slice(0, 20),
    text: opts.text,
  }).returning();
  return row;
}

chat.post('/', async (c) => {
  const playerId = c.get('playerId');
  let body: { room?: string; text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const text = body.text?.trim();
  if (!text) return c.json({ error: 'Missing message text' }, 400);
  if (text.length > 1000) return c.json({ error: 'Message too long' }, 400);
  const room = (body.room || 'global').slice(0, 50);

  let senderName = 'Commander';
  const playerRows = await db.select({ username: players.username }).from(players).where(eq(players.id, playerId)).limit(1);
  if (playerRows.length > 0) senderName = playerRows[0].username;

  const row = await storeChatMessage({ senderId: playerId, senderName, room, text, type: 'user' });
  return c.json({ success: true, message: row });
});

export { chat as chatRoutes };
