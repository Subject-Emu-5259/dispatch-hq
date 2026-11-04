// ============================================
// DEPRECATED entrypoint (Batch 3e, 2026-11-03) — DO NOT USE FOR PRODUCTION.
// Production serves dist/serve-combined.js (see Dockerfile CMD), which
// mounts the full route set (alliances, treasury, gifts, shared stations,
// loans, activity, seasonal, daily-bonus, promo, admin-maintenance).
// This file (pnpm start / dist/index.js) serves a FEATURE-STRIPPED server
// that disagrees with production and must never be mistaken for it.
// It is kept (not deleted) only because `pnpm start` in
// servers/game-server/package.json still points at it; removing it is a
// one-line follow-up once that script is repointed. If you start this
// file, the console warning below tells you so on every boot.
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { playerRoutes } from './routes/player';
import { settingsRoutes } from './routes/settings';
import { saveRoutes } from './routes/saves';
import { inboxRoutes } from './routes/inbox';
import { chatRoutes } from './routes/chat';
import { leaderboardRoutes } from './routes/leaderboard';
import { socialRoutes } from './routes/social';
import { achievementsRoutes } from './routes/achievements';
import { bugReportRoutes } from './routes/bugReports';
import { analyticsRoutes } from './routes/analytics';
import { shopRoutes, shopWebhookHandler } from './routes/shop';
import { seedDatabase } from './db/seed';
import { authMiddleware, type AuthVars } from './auth/middleware';
import { isAdminPlayer } from './lib/requireAdmin';
import { createWsServer } from './websocket/wsServer';
import { startGuestPruneJob } from './jobs/pruneGuests';
import { startPremiumExpiryJob } from './jobs/premiumExpiry';
import { initPubSub } from './lib/pubsub';
import { handleClusterMessage } from './websocket/connectionManager';
import { applyMaintenanceClusterMessage, getMaintenanceState } from './lib/maintenance';
import { getSignupGateState } from './lib/signupGate';
import { tileHandler, routingHandler, geocodeHandler } from './routes/mapData';
import { jsonBodyLimit } from './lib/bodyLimit';
import { rateLimit, playerKey } from './lib/rateLimit';

const app = new Hono<{ Variables: AuthVars }>();

app.use('*', logger());
app.use('*', cors({
  origin: (origin) => (origin && config.cors.origins.includes(origin) ? origin : ''),
  credentials: true,
}));
// Bound every request body before any handler parses it (v0.27.0).
app.use('*', jsonBodyLimit);

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    game: 'Dispatch HQ',
    version: '0.54.0',
    maintenance: getMaintenanceState(),
    signupGate: getSignupGateState(),
    timestamp: new Date().toISOString(),
  });
});

// On-origin map data (v0.23.2): tiles + OSRM routes served from the game's own
// origin with a disk cache, so the map has zero third-party dependencies.
app.get('/tiles/*', tileHandler);
app.get('/routing/*', routingHandler);
app.get('/geocode/*', geocodeHandler);

app.route('/api/auth', authRoutes);

app.use('/api/player/*', authMiddleware);
app.use('/api/inbox/*', authMiddleware);
app.use('/api/chat/*', authMiddleware);
app.use('/api/social/*', authMiddleware);
app.use('/api/leaderboard/*', authMiddleware);
app.use('/api/achievements/*', authMiddleware);
app.use('/api/bug-reports/*', authMiddleware);
app.use('/api/analytics/*', authMiddleware);
app.use('/api/shop/*', authMiddleware);
// Shop webhook is PUBLIC (Stripe calls it, signed, no auth cookie).
app.post('/api/shop/webhook', shopWebhookHandler);

// Per-player write throttling (v0.27.0) — dev-entrypoint parity with
// serve-combined.ts (no alliance routes in this entrypoint).
app.post('/api/player/stats', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/analytics/session', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/player/settings', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/request', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/respond', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/remove', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/inbox/read-all', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/inbox/:id/read', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.delete('/api/inbox/:id', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/shop/checkout', rateLimit({ windowMs: 60_000, max: 20, keyFn: playerKey }));
app.post('/api/shop/spend', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));

app.route('/api/player', playerRoutes);
app.route('/api/player/settings', settingsRoutes);
app.route('/api/player/saves', saveRoutes);
app.route('/api/inbox', inboxRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/social', socialRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/achievements', achievementsRoutes);
app.route('/api/bug-reports', bugReportRoutes);
app.route('/api/analytics', analyticsRoutes);
app.route('/api/shop', shopRoutes);

// Seeding is NOT run at container start (Dockerfile CMD only runs
// migrations, then serve-combined.js) — the deploy flow seeds manually via
// this route after a deploy, so the route stays but is now admin-gated:
// authenticated + founder/ADMIN_EMAILS only. Unauthenticated callers get
// 401 from authMiddleware; authenticated non-admins get 403 here.
app.post('/api/seed', authMiddleware, async (c) => {
  if (!(await isAdminPlayer(c.get('playerId')))) {
    return c.json({ error: 'Forbidden — not an admin account' }, 403);
  }
  try {
    await seedDatabase();
    return c.json({ success: true, message: 'Database seeded successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: 'Seed failed', message }, 500);
  }
});

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  // DrizzleQueryError wraps the real Postgres error in `cause` and its own
  // message is just "Failed query: <sql>\nparams: <params>". Surface the cause
  // so a broken-table/column error is diagnosable from the client response
  // instead of hiding the actual reason behind a generic 500.
  const cause = err instanceof Error && (err as { cause?: unknown }).cause instanceof Error
    ? (err as { cause?: Error }).cause?.message
    : undefined;
  if (message.includes('ECONNREFUSED') || message.includes('connect')) {
    return c.json({ error: 'Database connection failed. Is PostgreSQL running?' }, 503);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', message, ...(cause ? { cause } : {}) }, 500);
});

app.get('/api/me', authMiddleware, (c) => {
  const playerId = c.get('playerId');
  return c.json({ playerId, authenticated: true });
});

app.get('/api/game-state', authMiddleware, (c) => {
  const playerId = c.get('playerId');
  return c.json({ playerId, timestamp: new Date().toISOString(), note: 'Full game state is client-authoritative; use WebSocket sync for live state.' });
});

const wsServer = createWsServer(app);
initPubSub((channel, raw) => {
  handleClusterMessage(channel, raw);
  applyMaintenanceClusterMessage(raw);
});

// Background maintenance: prune stale guest accounts (30 days + no saves) once
// a day (dev parity with serve-combined.ts).
startGuestPruneJob({
  enabled: config.pruneGuests.enabled,
  intervalMs: config.pruneGuests.intervalHours * 60 * 60 * 1000,
  maxAgeMs: config.pruneGuests.maxAgeDays * 24 * 60 * 60 * 1000,
});

// Reconcile is_premium against premium_expires_at daily (v0.32.0) so a lapsed
// Commander membership stops showing premium everywhere.
startPremiumExpiryJob();

console.warn('[DEPRECATED] servers/game-server/src/index.ts is a feature-stripped dev entrypoint — production serves dist/serve-combined.js (see Dockerfile CMD).');
console.log(`Dispatch HQ Server starting on ${config.host}:${config.port}`);
const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
}, (info) => {
  console.log(`Dispatch HQ Server running at http://${info.address}:${info.port}`);
  console.log(`   Health:  http://localhost:${info.port}/health`);
  console.log(`   API:     http://localhost:${info.port}/api/`);
  console.log(`   WS:      ws://localhost:${info.port}/ws`);
});
wsServer.injectWebSocket(server);
