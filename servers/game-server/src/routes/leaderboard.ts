// ============================================
// Dispatch HQ — Leaderboard Routes
// ============================================
// Persistent global rankings built from player stats, plus the Friends tab:
// a head-to-head against your social graph — calls run, clearance rate, and
// who's ahead this ISO week (weekly snapshots live in player_settings jsonb).

import { Hono } from 'hono';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, playerStats, playerSettings, alliances, allianceMembers } from '../db/schema';
import type { AuthVars } from '../auth/middleware';
import { readSocial } from './social';
import { emptyWeekly, isoWeekKey, allianceLevelFor, lifetimeXpFor, type WeeklySnapshot } from '@dispatch-hq/shared';

/** Weekly snapshot from player_settings jsonb — only the current ISO week counts. */
async function loadWeeklySnapshots(playerIds: string[]): Promise<Map<string, WeeklySnapshot>> {
  const map = new Map<string, WeeklySnapshot>();
  if (playerIds.length === 0) return map;
  const settingsRows = await db
    .select({ playerId: playerSettings.playerId, settings: playerSettings.settings })
    .from(playerSettings)
    .where(inArray(playerSettings.playerId, playerIds));
  for (const r of settingsRows) {
    const weekly = (r.settings as Record<string, unknown> | null | undefined)?.weekly as WeeklySnapshot | undefined;
    if (weekly && typeof weekly === 'object') map.set(r.playerId, weekly);
  }
  return map;
}

const leaderboard = new Hono<{ Variables: AuthVars }>();

leaderboard.get('/', async (c) => {
  const sort = (c.req.query('sort') || 'xp') as 'xp' | 'credits' | 'missions' | 'mutual_aid';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);

  // The 'xp' board ranks by (level, xp) — level-first — which is exactly
  // lifetime-XP order (see lifetimeXpFor). players.xp alone is a remainder
  // into the current level since v0.19 and would make the ranking meaningless.
  // LEAST(level, 20) clamps legacy pre-curve rows (e.g. level 82) to the cap so
  // the SQL order agrees with the clamped lifetimeXpFor display value.
  const orderBy =
    sort === 'credits' ? [desc(players.credits)]
    : sort === 'missions' ? [desc(playerStats.missionsCompleted)]
    : sort === 'mutual_aid' ? [desc(playerStats.mutualAidAnswered)]
    : [desc(sql`LEAST(${players.level}, ${20})`), desc(players.xp)];

  const rows = await db
    .select({
      playerId: players.id,
      username: players.username,
      level: players.level,
      xp: players.xp,
      credits: players.credits,
      missionsCompleted: playerStats.missionsCompleted,
      mutualAidAnswered: playerStats.mutualAidAnswered,
    })
    .from(players)
    .leftJoin(playerStats, eq(players.id, playerStats.playerId))
    .orderBy(...orderBy)
    .limit(limit);

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    ...r,
    lifetimeXp: lifetimeXpFor(r.level, r.xp),
  }));

  return c.json({ sort, entries });
});

leaderboard.get('/friends', async (c) => {
  const myId = c.get('playerId');
  const social = await readSocial(myId);
  const friendIds = social.friends.map((f) => f.id);
  const ids = [myId, ...friendIds];

  const rows = await db
    .select({
      id: players.id,
      username: players.username,
      level: players.level,
      xp: players.xp,
      missionsCompleted: playerStats.missionsCompleted,
      totalMissionsFailed: playerStats.totalMissionsFailed,
    })
    .from(players)
    .leftJoin(playerStats, eq(players.id, playerStats.playerId))
    .where(inArray(players.id, ids));

  // Weekly snapshots from player_settings jsonb (may be empty for new players).
  const weeklyByPlayer = await loadWeeklySnapshots(ids);
  const thisWeek = isoWeekKey();

  // Global rank per player — level-first (lifetime XP) order, not the raw
  // remainder. Ties share the earlier position order.
  const xpRank = await db
    .select({ id: players.id, level: players.level, xp: players.xp })
    .from(players)
    .orderBy(desc(players.level), desc(players.xp));
  const rankOf = new Map<string, number>();
  xpRank.forEach((r, i) => { if (!rankOf.has(r.id)) rankOf.set(r.id, i + 1); });

  const entry = (row: { id: string; username: string; level: number; xp: number; missionsCompleted: number | null; totalMissionsFailed: number | null }) => {
    const callsRun = (row.missionsCompleted ?? 0) + (row.totalMissionsFailed ?? 0);
    const cleared = row.missionsCompleted ?? 0;
    const clearanceRate = callsRun > 0 ? Math.round((cleared / callsRun) * 100) : 0;
    const stored = weeklyByPlayer.get(row.id);
    const weekly = stored && stored.weekKey === thisWeek ? stored : emptyWeekly();
    return {
      playerId: row.id,
      username: row.username,
      level: row.level,
      xp: row.xp,
      rank: rankOf.get(row.id) ?? 0,
      callsRun,
      cleared,
      clearanceRate,
      weekly: {
        weekKey: weekly.weekKey,
        callsRun: weekly.callsRun ?? 0,
        cleared: weekly.cleared ?? 0,
        creditsEarned: weekly.creditsEarned ?? 0,
        xpEarned: weekly.xpEarned ?? 0,
      },
    };
  };

  const me = rows.find((r) => r.id === myId) ?? null;
  const friends = rows
    .filter((r) => r.id !== myId)
    .map(entry)
    // Who's ahead this week: most weekly clears first, then level-first (lifetime XP) as the tiebreak.
    .sort((a, b) => b.weekly.cleared - a.weekly.cleared || b.level - a.level || b.xp - a.xp);

  return c.json({ weekKey: thisWeek, me: me ? entry(me) : null, friends });
});

// Alliance leaderboard — rank guilds by shared XP or weekly cleared calls.
// Each row carries a top-3 contributor preview; the detail endpoint below
// returns the full per-member contribution breakdown.
leaderboard.get('/alliances', async (c) => {
  const sort = (c.req.query('sort') || 'xp') as 'xp' | 'weekly';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const thisWeek = isoWeekKey();

  const [myMembership] = await db
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, c.get('playerId')))
    .limit(1);
  const myAllianceId = myMembership?.allianceId ?? null;

  const rows = await db
    .select({
      id: alliances.id,
      name: alliances.name,
      tag: alliances.tag,
      level: alliances.level,
      xp: alliances.xp,
      recruiting: alliances.recruiting,
      leaderId: alliances.leaderId,
      memberCount: sql<number>`count(${allianceMembers.playerId})::int`,
    })
    .from(alliances)
    .leftJoin(allianceMembers, eq(allianceMembers.allianceId, alliances.id))
    .groupBy(alliances.id)
    .limit(limit);

  const allianceIds = rows.map((r) => r.id);
  const memberRows = allianceIds.length > 0
    ? await db
        .select({
          allianceId: allianceMembers.allianceId,
          playerId: players.id,
          username: players.username,
          level: players.level,
          xp: players.xp,
          missionsCompleted: playerStats.missionsCompleted,
        })
        .from(allianceMembers)
        .innerJoin(players, eq(players.id, allianceMembers.playerId))
        .leftJoin(playerStats, eq(players.id, playerStats.playerId))
        .where(inArray(allianceMembers.allianceId, allianceIds))
    : [];
  const weeklyByPlayer = await loadWeeklySnapshots([...new Set(memberRows.map((m) => m.playerId))]);
  const week = (pid: string) => {
    const stored = weeklyByPlayer.get(pid);
    return stored && stored.weekKey === thisWeek ? stored : emptyWeekly();
  };

  const leaderIds = [...new Set(rows.map((r) => r.leaderId))];
  const leaderNames = new Map<string, string>();
  if (leaderIds.length > 0) {
    const leaders = await db
      .select({ id: players.id, username: players.username })
      .from(players)
      .where(inArray(players.id, leaderIds));
    for (const l of leaders) leaderNames.set(l.id, l.username);
  }

  const entries = rows.map((r) => {
    const members = memberRows.filter((m) => m.allianceId === r.id);
    const contributors = members
      .map((m) => ({
        playerId: m.playerId,
        username: m.username,
        weeklyCallsRun: week(m.playerId).callsRun ?? 0,
        weeklyCleared: week(m.playerId).cleared ?? 0,
        missionsCompleted: m.missionsCompleted ?? 0,
      }))
      .sort((a, b) => b.weeklyCleared - a.weeklyCleared || b.missionsCompleted - a.missionsCompleted)
      .slice(0, 3);
    return {
      id: r.id,
      name: r.name,
      tag: r.tag,
      level: r.level,
      xp: r.xp,
      recruiting: r.recruiting,
      memberCount: r.memberCount,
      memberCap: allianceLevelFor(r.xp ?? 0).memberCap,
      leaderName: leaderNames.get(r.leaderId) ?? 'Unknown',
      weeklyCallsRun: members.reduce((sum, m) => sum + (week(m.playerId).callsRun ?? 0), 0),
      weeklyCleared: members.reduce((sum, m) => sum + (week(m.playerId).cleared ?? 0), 0),
      contributors,
    };
  });

  entries.sort(
    sort === 'weekly'
      ? (a, b) => b.weeklyCleared - a.weeklyCleared || b.xp - a.xp
      : (a, b) => b.xp - a.xp,
  );

  return c.json({
    sort,
    weekKey: thisWeek,
    myAllianceId,
    alliances: entries.map((e, i) => ({ rank: i + 1, ...e })),
  });
});

// Per-alliance member contribution breakdown (drill-in from the board).
leaderboard.get('/alliances/:id', async (c) => {
  const id = c.req.param('id');
  const [a] = await db.select().from(alliances).where(eq(alliances.id, id)).limit(1);
  if (!a) return c.json({ error: 'Alliance not found' }, 404);

  const thisWeek = isoWeekKey();
  const members = await db
    .select({
      playerId: players.id,
      username: players.username,
      role: allianceMembers.role,
      level: players.level,
      xp: players.xp,
      missionsCompleted: playerStats.missionsCompleted,
    })
    .from(allianceMembers)
    .innerJoin(players, eq(players.id, allianceMembers.playerId))
    .leftJoin(playerStats, eq(players.id, playerStats.playerId))
    .where(eq(allianceMembers.allianceId, id));
  const weeklyByPlayer = await loadWeeklySnapshots(members.map((m) => m.playerId));
  const week = (pid: string) => {
    const stored = weeklyByPlayer.get(pid);
    return stored && stored.weekKey === thisWeek ? stored : emptyWeekly();
  };
  const [leader] = await db
    .select({ username: players.username })
    .from(players)
    .where(eq(players.id, a.leaderId))
    .limit(1);

  return c.json({
    alliance: {
      id: a.id,
      name: a.name,
      tag: a.tag,
      level: a.level,
      xp: a.xp,
      memberCount: members.length,
      leaderName: leader?.username ?? 'Unknown',
    },
    weekKey: thisWeek,
    members: members
      .map((m) => ({
        ...m,
        lifetimeXp: lifetimeXpFor(m.level, m.xp),
        weeklyCallsRun: week(m.playerId).callsRun ?? 0,
        weeklyCleared: week(m.playerId).cleared ?? 0,
      }))
      .sort((x, y) => y.weeklyCleared - x.weeklyCleared || y.level - x.level || y.xp - x.xp),
  });
});

leaderboard.get('/player/:id', async (c) => {
  const id = c.req.param('id');
  const me = await db.select({ id: players.id, username: players.username, level: players.level, xp: players.xp, credits: players.credits })
    .from(players).where(eq(players.id, id)).limit(1);
  if (me.length === 0) return c.json({ error: 'Player not found' }, 404);
  // Level-first rank: strictly ahead means a higher level, or the same level
  // with more XP into it (lifetime-XP equivalent — see lifetimeXp).
  const rankRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(players)
    .where(sql`(${players.level} > ${me[0].level}) OR (${players.level} = ${me[0].level} AND ${players.xp} > ${me[0].xp})`);
  const rank = (rankRes[0]?.count ?? 0) + 1;
  return c.json({ rank, player: { ...me[0], lifetimeXp: lifetimeXpFor(me[0].level, me[0].xp) } });
});

export { leaderboard as leaderboardRoutes };
