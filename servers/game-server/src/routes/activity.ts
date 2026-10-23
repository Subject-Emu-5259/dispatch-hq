// ============================================
// Dispatch HQ — Alliance Activity Feed
// ============================================
// Phase 5 of the v1.0 co-op endgame: a unified timeline of alliance resource
// events (treasury, gifts, stations, loans). Every event type inserts a row
// via the helper logAllianceActivity() so the feed component can render a
// single reverse-chronological timeline.

import { Hono } from 'hono';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { allianceActivity, allianceMembers, players } from '../db/schema';
import type { AuthVars } from '../auth/middleware';

const activityRouter = new Hono<{ Variables: AuthVars }>();

// ── Helper: insert an activity event ─────────────────────────────────────────
// Other route files import and call this to log events.
export async function logAllianceActivity(
  allianceId: string,
  playerId: string | null,
  eventType: string,
  summary: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(allianceActivity).values({
      allianceId,
      playerId,
      eventType,
      summary,
      meta: meta ?? null,
    });
  } catch (err) {
    // Non-fatal: activity logging should never block the main action.
    console.error('[activity] Failed to log event:', err);
  }
}

// ── GET /api/alliances/activity — paginated feed ─────────────────────────────
activityRouter.get('/', async (c) => {
  const playerId = c.get('playerId');

  // Check membership
  const membership = await db
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);

  if (membership.length === 0) return c.json({ error: 'Not in an alliance' }, 403);

  const allianceId = membership[0].allianceId;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;

  // Fetch events with player names
  const rows = await db
    .select({
      id: allianceActivity.id,
      playerId: allianceActivity.playerId,
      eventType: allianceActivity.eventType,
      summary: allianceActivity.summary,
      meta: allianceActivity.meta,
      createdAt: allianceActivity.createdAt,
      playerName: players.username,
    })
    .from(allianceActivity)
    .leftJoin(players, eq(allianceActivity.playerId, players.id))
    .where(eq(allianceActivity.allianceId, allianceId))
    .orderBy(desc(allianceActivity.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(allianceActivity)
    .where(eq(allianceActivity.allianceId, allianceId));

  return c.json({
    events: rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: r.playerName ?? 'System',
      eventType: r.eventType,
      summary: r.summary,
      meta: r.meta,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    })),
    total: count,
    limit,
    offset,
  });
});

export { activityRouter };
