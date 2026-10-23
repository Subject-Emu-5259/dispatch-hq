// ============================================
// Dispatch HQ — Opt-in Session Analytics (v0.24.0)
// ============================================
// Privacy-safe: counts only, no PII, off by default. The client only calls
// POST /session when the player has analyticsEnabled, and the server
// double-checks that same setting so a stray or abusive call can't write
// rows. The summary is founder-gated (the same email allow-list as
// /api/admin/*).
//
// A session flush carries the session rollup PLUS a capped array of
// per-mission records (type, category, first-response time), so the client
// still makes one batched call per session — no per-event traffic. The
// rollup's `missionsCompleted` is the authoritative count; the per-mission
// rows are a bounded sample for the type/response-time distribution.

import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { players, playerSettings, sessionStats, missionStats } from '../db/schema';
import { isAdminEmail } from '../config';
import type { AuthVars } from '../auth/middleware';

const analytics = new Hono<{ Variables: AuthVars }>();

/** Clamp an integer field into [min, max], defaulting to `fallback`. */
function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pure: does the stored settings row permit analytics? */
export function settingsAllowAnalytics(settings: unknown): boolean {
  return (settings as Record<string, unknown> | null | undefined)?.analyticsEnabled === true;
}

export interface NormalizedSession {
  city: string | null;
  service: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  missionsCompleted: number;
}

/** Pure: normalize + clamp a session payload (counts only, no PII). */
export function normalizeSessionPayload(body: unknown): NormalizedSession {
  const b = (body ?? {}) as Record<string, unknown>;
  const now = new Date();
  const startedAt = parseDate(b.startedAt) ?? now;
  const endedAt = parseDate(b.endedAt) ?? now;
  const durationSeconds = clampInt(b.durationSeconds, 0, 86400, 0);
  const missionsCompleted = clampInt(b.missionsCompleted, 0, 100000, 0);
  const city = typeof b.city === 'string' && b.city.trim() ? b.city.trim().slice(0, 100) : null;
  const service = typeof b.service === 'string' && b.service.trim() ? b.service.trim().slice(0, 20) : null;
  return { city, service, startedAt, endedAt, durationSeconds, missionsCompleted };
}

export interface NormalizedMission {
  missionType: string | null;
  category: string | null;
  responseTimeSeconds: number;
}

/**
 * Pure: normalize one per-mission record (counts only, no PII). Returns null
 * when there is nothing worth storing (no type AND no category), so the
 * caller can drop empty entries.
 */
export function normalizeMissionPayload(raw: unknown): NormalizedMission | null {
  const b = (raw ?? {}) as Record<string, unknown>;
  const missionType = typeof b.missionType === 'string' && b.missionType.trim()
    ? b.missionType.trim().slice(0, 60)
    : null;
  const category = typeof b.category === 'string' && b.category.trim()
    ? b.category.trim().slice(0, 20)
    : null;
  if (!missionType && !category) return null;
  const responseTimeSeconds = clampInt(b.responseTimeSeconds, 0, 86400, 0);
  return { missionType, category, responseTimeSeconds };
}

/** Pure: ISO start of the trailing window the summary aggregates over. */
export function analyticsWindowStart(now = Date.now(), days = 7): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Cap on per-mission rows accepted from a single session flush. */
const MAX_MISSIONS_PER_SESSION = 500;

/** Record one play session (rollup + per-mission sample). Authed; ignored
 *  unless the player opted in. */
analytics.post('/session', async (c) => {
  const playerId = c.get('playerId');
  const body = await c.req.json().catch(() => null);

  const [settingsRow] = await db
    .select({ settings: playerSettings.settings })
    .from(playerSettings)
    .where(eq(playerSettings.playerId, playerId))
    .limit(1);
  if (!settingsAllowAnalytics(settingsRow?.settings)) {
    return c.json({ success: false, optedOut: true });
  }

  const s = normalizeSessionPayload(body);
  await db.insert(sessionStats).values({
    playerId,
    city: s.city,
    service: s.service,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSeconds: s.durationSeconds,
    missionsCompleted: s.missionsCompleted,
  });

  const rawMissions = (body as Record<string, unknown> | null)?.missions;
  const missions = (Array.isArray(rawMissions) ? rawMissions : [])
    .map(normalizeMissionPayload)
    .filter((m): m is NormalizedMission => m !== null)
    .slice(0, MAX_MISSIONS_PER_SESSION);

  if (missions.length > 0) {
    await db.insert(missionStats).values(
      missions.map((m) => ({
        playerId,
        missionType: m.missionType,
        category: m.category,
        responseTimeSeconds: m.responseTimeSeconds,
      })),
    );
  }

  return c.json({ success: true });
});

/** Founder-gated trailing-7-day activity summary. */
analytics.get('/summary', async (c) => {
  const playerId = c.get('playerId');
  const rows = await db
    .select({ email: players.email })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!isAdminEmail(rows[0]?.email ?? '')) {
    return c.json({ error: 'Forbidden — not an admin account' }, 403);
  }

  const weekAgo = analyticsWindowStart();
  const [agg] = await db
    .select({
      sessions: sql<number>`COUNT(*)::int`,
      missionsCompleted: sql<number>`COALESCE(SUM(${sessionStats.missionsCompleted}), 0)::int`,
      avgDurationSeconds: sql<number>`COALESCE(AVG(${sessionStats.durationSeconds}), 0)::int`,
    })
    .from(sessionStats)
    .where(sql`${sessionStats.startedAt} >= ${weekAgo}`);

  const [overall] = await db
    .select({
      avgResponseTimeSeconds: sql<number>`COALESCE(AVG(${missionStats.responseTimeSeconds}), 0)::int`,
    })
    .from(missionStats)
    .where(sql`${missionStats.createdAt} >= ${weekAgo}`);

  const byType = await db
    .select({
      type: missionStats.missionType,
      category: sql<string | null>`MAX(${missionStats.category})`,
      count: sql<number>`COUNT(*)::int`,
      avgResponseTimeSeconds: sql<number>`COALESCE(AVG(${missionStats.responseTimeSeconds}), 0)::int`,
      // Percentiles via PostgreSQL's ordered-set aggregate — the continuous
      // (interpolated) median/90th/99th of the trailing-7-day response times.
      p50ResponseTimeSeconds: sql<number>`COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${missionStats.responseTimeSeconds}), 0)::int`,
      p90ResponseTimeSeconds: sql<number>`COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY ${missionStats.responseTimeSeconds}), 0)::int`,
      p99ResponseTimeSeconds: sql<number>`COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY ${missionStats.responseTimeSeconds}), 0)::int`,
    })
    .from(missionStats)
    .where(sql`${missionStats.createdAt} >= ${weekAgo} AND ${missionStats.missionType} IS NOT NULL`)
    .groupBy(missionStats.missionType)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(20);

  return c.json({
    windowDays: 7,
    sessions: agg?.sessions ?? 0,
    missionsCompleted: agg?.missionsCompleted ?? 0,
    avgDurationSeconds: agg?.avgDurationSeconds ?? 0,
    avgResponseTimeSeconds: overall?.avgResponseTimeSeconds ?? 0,
    missionsByType: byType.map((r) => ({
      type: r.type ?? 'unknown',
      category: r.category ?? null,
      count: r.count,
      avgResponseTimeSeconds: r.avgResponseTimeSeconds,
      p50ResponseTimeSeconds: r.p50ResponseTimeSeconds,
      p90ResponseTimeSeconds: r.p90ResponseTimeSeconds,
      p99ResponseTimeSeconds: r.p99ResponseTimeSeconds,
    })),
  });
});

export { analytics as analyticsRoutes };
