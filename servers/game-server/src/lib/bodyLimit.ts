// ============================================
// Dispatch HQ — JSON Body-Size Limiting
// ============================================
// No route bounds its request body today, so `c.req.json()` parses whatever
// the client sends straight into memory — a multi-hundred-MB POST is a
// trivially cheap way to exhaust the instance. Hono's bodyLimit middleware
// reads the Content-Length (or streams the body for chunked requests) and
// 413s BEFORE any handler touches the bytes. A single generous default caps
// every write; the save route gets a larger override because a save carries
// the entire game state (missions, units, stations, career) in one jsonb blob.

import { bodyLimit } from 'hono/body-limit';
import type { MiddlewareHandler } from 'hono';

export const JSON_BODY_LIMIT_DEFAULT = 1 * 1024 * 1024; // 1 MiB — normal writes
export const SAVE_BODY_LIMIT = 10 * 1024 * 1024;        // 10 MiB — full-game-state save

// Most-specific prefix first. Order matters: /api/player/saves must match its
// override before any shorter prefix would.
const PATH_LIMITS: { prefix: string; max: number }[] = [
  { prefix: '/api/player/saves', max: SAVE_BODY_LIMIT },
];

/** Resolve the body-size cap for a request path (pure, unit-tested). */
export function limitForPath(path: string): number {
  for (const entry of PATH_LIMITS) {
    if (path.startsWith(entry.prefix)) return entry.max;
  }
  return JSON_BODY_LIMIT_DEFAULT;
}

/** Path-aware body-size limiter — register once as `app.use('*', jsonBodyLimit)`. */
export const jsonBodyLimit: MiddlewareHandler = (c, next) =>
  bodyLimit({ maxSize: limitForPath(c.req.path) })(c, next);
