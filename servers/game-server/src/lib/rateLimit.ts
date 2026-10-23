// ============================================
// Dispatch HQ — Rate Limiting
// ============================================
// In-memory token-bucket backstop for sensitive public endpoints (auth,
// promo redemption, chat/bug-report posting). This is per-instance, not a
// cluster-wide guarantee — if the game ever runs multiple instances behind a
// load balancer, move the buckets to Redis. For the current single-instance
// deployment it is exactly what is needed to stop login/promo/chat spam.
//
// The bucket keys on the client IP (first X-Forwarded-For hop, which the Zo
// proxy sets; falls back to the raw peer address via the connection header).

import type { Context, Next } from 'hono';

export interface RateLimitOptions {
  windowMs: number; // sliding-ish fixed window length
  max: number;      // max requests per window
  /** Optional bucket key override — e.g. the authenticated player id for
   *  high-frequency write endpoints, so throttling is per-account instead of
   *  per-IP (several players behind one NAT/proxy share an IP). */
  keyFn?: (c: Context) => string;
  /** Optional route label for the stats readout — defaults to the request path. */
  label?: string;
}

interface Bucket {
  tokens: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// ── Observability counters (v0.30.0) ─────────────────────────────────────
// The limiter fires silently by default; these counters make a 429 wave
// visible from the Admin console (GET /api/admin/rate-limit) instead of a
// silent error-rate. In-memory like the buckets — per-instance, reset on
// restart — and pruned by the same sweep.
export interface RouteStat {
  route: string;
  allowed: number;
  blocked: number;
  lastBlockedAt: number | null;
}

export interface OffenderStat {
  key: string;
  blocked: number;
  lastBlockedAt: number;
}

export interface RateLimitStats {
  routes: RouteStat[];
  offenders: OffenderStat[];
  since: number;
}

const routeStats = new Map<string, RouteStat>();
const offenderStats = new Map<string, { blocked: number; lastBlockedAt: number }>();
const STATS_SINCE = Date.now();

function recordAllowed(route: string): void {
  const s = routeStats.get(route) ?? { route, allowed: 0, blocked: 0, lastBlockedAt: null };
  s.allowed += 1;
  routeStats.set(route, s);
}

function recordBlocked(route: string, key: string, now: number): void {
  const s = routeStats.get(route) ?? { route, allowed: 0, blocked: 0, lastBlockedAt: null };
  s.blocked += 1;
  s.lastBlockedAt = now;
  routeStats.set(route, s);
  const o = offenderStats.get(key) ?? { blocked: 0, lastBlockedAt: 0 };
  o.blocked += 1;
  o.lastBlockedAt = now;
  offenderStats.set(key, o);
}

/** Drop offender stats with no block in the retention window (swept + testable). */
export function pruneRateLimitStats(now = Date.now(), retentionMs = SWEEP_INTERVAL_MS): void {
  for (const [key, o] of offenderStats) {
    if (o.lastBlockedAt < now - retentionMs) offenderStats.delete(key);
  }
}

/** Snapshot for GET /api/admin/rate-limit: routes + top offenders. */
export function getRateLimitStats(topOffenders = 20): RateLimitStats {
  const routes = [...routeStats.values()].sort((a, b) => b.blocked - a.blocked);
  const offenders = [...offenderStats.entries()]
    .map(([key, o]) => ({ key, blocked: o.blocked, lastBlockedAt: o.lastBlockedAt }))
    .sort((a, b) => b.blocked - a.blocked || b.lastBlockedAt - a.lastBlockedAt)
    .slice(0, topOffenders);
  return { routes, offenders, since: STATS_SINCE };
}

// Periodic sweep so a long-lived server never accumulates dead buckets.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
if (typeof setInterval === 'function') {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt < now) buckets.delete(key);
    }
    pruneRateLimitStats(now);
  }, SWEEP_INTERVAL_MS);
  // Do not keep the process alive purely for the sweep in tests.
  if (typeof (sweep as any).unref === 'function') (sweep as any).unref();
}

/** Bucket key for authenticated per-account throttling (saves, stats, …). */
export function playerKey(c: Context): string {
  return `player:${c.get('playerId')}`;
}

function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const cf = c.req.header('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}

export function rateLimit({ windowMs, max, keyFn, label }: RateLimitOptions) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const key = keyFn ? keyFn(c) : clientIp(c);
    const route = label ?? c.req.path;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { tokens: max, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.tokens <= 0) {
      recordBlocked(route, key, now);
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return c.json(
        { error: 'Too many requests — please slow down and try again shortly.' },
        429,
        { 'Retry-After': String(retryAfter) },
      );
    }
    bucket.tokens -= 1;
    recordAllowed(route);
    await next();
  };
}
