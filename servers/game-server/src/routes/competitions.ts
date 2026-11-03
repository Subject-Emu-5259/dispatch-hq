// ===========================================
// Dispatch HQ — Alliance Competitions (Batch 3c)
// ===========================================
// Weekly alliance events ranked ONLY on server-verified events:
// seasonal contest entries (the seasonal /complete route validates the
// window server-side and persists the row). The route feeds DB rows into
// rankAlliancesByClears — it never reads client-reported alliance XP
// (POST /alliances/xp is 410) or client-reported player stats, so neither
// can move this board, no matter how hard it is spammed.
//
// Shipped: most clears (weekly). QUEUED: fastest average response — no
// server-verified response-time stream exists (stats are client-reported
// per P1-M5); the endpoint reports it as unavailable with the exact
// blocker instead of ranking a forgeable number. Blocker: server mission
// ledger.

import { Hono } from 'hono';
import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { seasonalContestEntries, allianceMembers } from '../db/schema';
import { weekKeyFor, weekStartFor, rankAlliancesByClears } from '../lib/competitions';
import type { AuthVars } from '../auth/middleware';

const competitionsRouter = new Hono<{ Variables: AuthVars }>();

// ── GET /api/alliances/competitions/current — this week's most-clears board ──
competitionsRouter.get('/current', async (c) => {
  const playerId = c.get('playerId');
  const now = new Date();
  const weekKey = weekKeyFor(now);
  const weekStart = weekStartFor(now);

  // Server-verified rows only: entries whose last clear landed this week,
  // joined to current alliance membership. A player who left an alliance
  // stops counting for it; a client number appears nowhere in this query.
  const rows = await db
    .select({
      allianceId: allianceMembers.allianceId,
      playerId: seasonalContestEntries.playerId,
      callsCleared: seasonalContestEntries.callsCleared,
      cityClears: seasonalContestEntries.cityClears,
    })
    .from(seasonalContestEntries)
    .innerJoin(allianceMembers, eq(allianceMembers.playerId, seasonalContestEntries.playerId))
    .where(and(
      gte(seasonalContestEntries.lastClearedAt, weekStart),
      sql`${seasonalContestEntries.callsCleared} + ${seasonalContestEntries.cityClears} > 0`,
    ));

  const rankings = rankAlliancesByClears(rows);
  const myAlliance = await db
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  const mine = myAlliance.length > 0
    ? (rankings.find((r) => r.allianceId === myAlliance[0].allianceId) ?? null)
    : null;

  return c.json({
    weekKey,
    weekStart: weekStart.toISOString(),
    event: 'most_clears',
    source: 'server-verified seasonal contest entries only',
    rankings,
    mine,
    // Honest gap, stated in the payload: fastest-response is NOT ranked.
    fastestAverageResponse: {
      available: false,
      reason: 'No server-verified response-time stream exists yet (player stats are client-reported). Blocked on a server mission ledger.',
    },
  });
});

export { competitionsRouter };
