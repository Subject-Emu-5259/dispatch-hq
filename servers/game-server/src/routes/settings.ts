// ============================================
// Dispatch HQ — Player Settings Routes
// ============================================

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { playerSettings } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const settings = new Hono<{ Variables: AuthVars }>();

settings.get('/', async (c) => {
  const playerId = c.get('playerId');
  const rows = await db.select().from(playerSettings).where(eq(playerSettings.playerId, playerId)).limit(1);
  if (rows.length === 0) return c.json({ settings: null });
  return c.json({ settings: rows[0].settings });
});

settings.post('/', async (c) => {
  const playerId = c.get('playerId');
  let body: { settings?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.settings || typeof body.settings !== 'object') {
    return c.json({ error: 'Missing settings object' }, 400);
  }
  const now = new Date();
  await db.insert(playerSettings)
    .values({ playerId, settings: body.settings, updatedAt: now })
    .onConflictDoUpdate({
      target: playerSettings.playerId,
      set: {
        settings: body.settings,
        updatedAt: now,
      },
    });
  return c.json({ success: true, settings: body.settings });
});

export { settings as settingsRoutes };
