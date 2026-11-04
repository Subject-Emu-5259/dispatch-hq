import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { authRoutes, sanitizePlayer } from './routes/auth';
import { playerRoutes } from './routes/player';
import { settingsRoutes } from './routes/settings';
import { saveRoutes } from './routes/saves';
import { inboxRoutes } from './routes/inbox';
import { chatRoutes } from './routes/chat';
import { leaderboardRoutes } from './routes/leaderboard';
import { socialRoutes } from './routes/social';
import { achievementsRoutes } from './routes/achievements';
import { bugReportRoutes } from './routes/bugReports';
import { alliancesRouter as allianceRoutes } from './routes/alliances';
import { treasuryRouter } from './routes/treasury';
import { giftsRouter } from './routes/gifts';
import { sharedStationsRouter } from './routes/sharedStations';
import { competitionsRouter } from './routes/competitions';
import { loansRouter, expireOverdueLoans } from './routes/loans';
import { activityRouter } from './routes/activity';
import { adminRoutes } from './routes/admin';
import { promoRoutes } from './routes/promos';
import { dailyBonusRoutes } from './routes/dailyBonus';
import { seasonalRoutes } from './routes/seasonal';
import { analyticsRoutes } from './routes/analytics';
import { shopRoutes, shopWebhookHandler } from './routes/shop';
import { seedDatabase } from './db/seed';
import { db } from './db';
import { players, playerSettings, inboxMessages } from './db/schema';
import { eq } from 'drizzle-orm';
import { authMiddleware, type AuthVars } from './auth/middleware';
import { isAdminPlayer } from './lib/requireAdmin';
import { createWsServer } from './websocket/wsServer';
import { tileHandler, routingHandler, geocodeHandler } from './routes/mapData';
import { buildStaticResponse } from './lib/httpRange';
import { handleClusterMessage } from './websocket/connectionManager';
import { initPubSub } from './lib/pubsub';
import {
  applyMaintenanceClusterMessage,
  checkScheduledMaintenance,
  getMaintenanceState,
  maintenanceInboxNote,
} from './lib/maintenance';
import { getSignupGateState } from './lib/signupGate';
import { startGuestPruneJob } from './jobs/pruneGuests';
import { startPremiumExpiryJob } from './jobs/premiumExpiry';
import { isoWeekKey, type WeeklySnapshot } from '@dispatch-hq/shared';
import { config } from './config';
import { rateLimit, playerKey } from './lib/rateLimit';
import { jsonBodyLimit } from './lib/bodyLimit';
import { resolveStaticFile } from './lib/staticFiles';

const app = new Hono<{ Variables: AuthVars }>();

const FRONTEND_DIR = join(__dirname, '../../../apps/web/dist');

function serveStatic(c: any) {
  // Pure resolution (v0.28.0): traversal + directory + existence rules live
  // in lib/staticFiles.ts and are unit-tested — the root "directory EISDIR"
  // 500 (v0.27.0) and the font/icon MIME fallback (v0.26.1) both shipped
  // once and now have regression coverage.
  const resolved = resolveStaticFile(FRONTEND_DIR, c.req.path);
  if (!resolved) return null;

  const cacheControl = extname(resolved.filePath) === '.html'
    ? 'no-cache'
    : 'public, max-age=300, must-revalidate';

  // HTTP Range support (v0.23.7): buildStaticResponse answers `Range: bytes=…`
  // with 206 Partial Content so Safari's <video> element can stream the
  // home-page trailer. The parsing rules live in lib/httpRange.ts (unit-tested).
  return buildStaticResponse({
    content: readFileSync(resolved.filePath),
    contentType: resolved.contentType,
    cacheControl,
    rangeHeader: c.req.header('range'),
  });
}

app.use('*', logger());
// CORS allowlist (v0.18.0 hardening): credentialed cross-origin calls are only
// honored from the public URL and the dev server. A disallowed origin gets an
// empty Access-Control-Allow-Origin, so the browser refuses to read the
// response. Same-origin requests are unaffected.
app.use('*', cors({
  origin: (origin) => (origin && config.cors.origins.includes(origin) ? origin : ''),
  credentials: true,
}));
// Bound every request body before any handler parses it (v0.27.0): the save
// route gets a larger override, everything else a generous 1 MiB default.
app.use('*', jsonBodyLimit);

app.get('/assets/*', (c) => serveStatic(c) || c.notFound());
app.get('/favicon.ico', (c) => serveStatic(c) || c.notFound());
app.get('/favicon.png', (c) => serveStatic(c) || c.notFound());
app.get('/apple-touch-icon.png', (c) => serveStatic(c) || c.notFound());
app.get('/logo.png', (c) => serveStatic(c) || c.notFound());
app.get('/logo-512.png', (c) => serveStatic(c) || c.notFound());
app.get('/manifest.json', (c) => serveStatic(c) || c.notFound());
app.get('/robots.txt', (c) => serveStatic(c) || c.notFound());
app.get('/service-worker.js', (c) => serveStatic(c) || c.notFound());
app.get('/offline.html', (c) => serveStatic(c) || c.notFound());
app.get('/trailer.mp4', (c) => serveStatic(c) || c.notFound());
app.get('/trailer-poster.jpg', (c) => serveStatic(c) || c.notFound());

// On-origin map data (v0.23.2): tiles + OSRM routes served from the game's own
// origin with a disk cache, so the map has zero third-party dependencies.
// MUST stay before the SPA catch-all below.
// Batch 1 (P0-3): these used to sit before the auth blanket with NO limits —
// an unauthenticated open proxy burning OSM/OSRM/Nominatim quota. They are now
// authenticated (the game client is always authed by the time it shows a map:
// menu → city-select → playing, and same-origin tile/img + fetch requests
// carry the auth cookie) AND per-IP rate-limited in their own bucket scope
// (see rateLimit `scope` — a map burst must not eat the auth buckets).
// Limits sit far above a real map session: a full map view loads dozens of
// tiles, a handful of routes, and a few city searches per minute.
app.use('/tiles/*', authMiddleware);
app.use('/routing/*', authMiddleware);
app.use('/geocode/*', authMiddleware);
app.get('/tiles/*', rateLimit({ windowMs: 60_000, max: 300, scope: 'proxy-tiles' }), tileHandler);
app.get('/routing/*', rateLimit({ windowMs: 60_000, max: 120, scope: 'proxy-routing' }), routingHandler);
app.get('/geocode/*', rateLimit({ windowMs: 60_000, max: 60, scope: 'proxy-geocode' }), geocodeHandler);

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    game: 'Dispatch HQ',
    version: '0.53.0',
    maintenance: getMaintenanceState(),
    signupGate: getSignupGateState(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/admin/*', authMiddleware);
// The upgrade endpoint needs the caller's identity (their guest session) —
// the rest of /api/auth is public (register/login/guest/logout).
app.use('/api/auth/upgrade', authMiddleware);

// ── Per-IP rate limiting (v0.18.0 hardening) — registered BEFORE the routes ──
app.post('/api/auth/register', rateLimit({ windowMs: 60_000, max: 10 }));
app.post('/api/auth/login', rateLimit({ windowMs: 60_000, max: 10 }));
// Guest mints a fresh account per request with no email/password gate, so it
// is the most spam-friendly public endpoint — same bucket as register/login.
app.post('/api/auth/guest', rateLimit({ windowMs: 60_000, max: 10 }));
app.post('/api/promo/redeem', rateLimit({ windowMs: 60_000, max: 10 }));
// Shop webhook is PUBLIC (Stripe calls it, signed, no auth cookie) — mounted
// BEFORE the /api/shop/* auth blanket below.
app.post('/api/shop/webhook', shopWebhookHandler);
app.post('/api/bug-reports', rateLimit({ windowMs: 60_000, max: 20 }));
app.post('/api/chat', rateLimit({ windowMs: 60_000, max: 30 }));

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);

app.use('/api/player/*', authMiddleware);
app.use('/api/chat/*', authMiddleware);
app.use('/api/leaderboard/*', authMiddleware);
app.use('/api/social/*', authMiddleware);
app.use('/api/achievements/*', authMiddleware);
app.use('/api/seasonal/*', authMiddleware);
app.use('/api/bug-reports/*', authMiddleware);
app.use('/api/alliances/*', authMiddleware);
app.use('/api/promo/*', authMiddleware);
app.use('/api/inbox/*', authMiddleware);
app.use('/api/analytics/*', authMiddleware);
app.use('/api/shop/*', authMiddleware);

// ── Per-player write throttling (v0.27.0) — every remaining authenticated DB
// write gets a per-account bucket (keyFn → player id) so a buggy or scripted
// account 429s on its own row instead of hammering shared tables. Limits are
// tuned per-route by real cadence and sit far above normal play.
app.post('/api/player/stats', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/analytics/session', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/player/settings', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/request', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/respond', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/social/remove', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/inbox/read-all', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/inbox/:id/read', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.delete('/api/inbox/:id', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/alliances/chat', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/alliances/xp', rateLimit({ windowMs: 60_000, max: 60, keyFn: playerKey }));
app.post('/api/shop/checkout', rateLimit({ windowMs: 60_000, max: 20, keyFn: playerKey }));
app.post('/api/shop/spend', rateLimit({ windowMs: 60_000, max: 30, keyFn: playerKey }));
app.post('/api/daily-bonus', rateLimit({ windowMs: 60_000, max: 5, keyFn: playerKey }));
app.post('/api/alliances/treasury/deposit', rateLimit({ windowMs: 60_000, max: 10, keyFn: playerKey }));
app.post('/api/alliances/treasury/withdraw', rateLimit({ windowMs: 60_000, max: 10, keyFn: playerKey }));
app.post('/api/alliances/gifts/send', rateLimit({ windowMs: 60_000, max: 5, keyFn: playerKey }));
app.post('/api/alliances/shared-stations/build', rateLimit({ windowMs: 60_000, max: 2, keyFn: playerKey }));
app.post('/api/alliances/shared-stations/:id/upgrade', rateLimit({ windowMs: 60_000, max: 5, keyFn: playerKey }));
app.post('/api/alliances/shared-stations/:id/claim', rateLimit({ windowMs: 60_000, max: 2, keyFn: playerKey }));
app.post('/api/alliances/shared-stations/leases', rateLimit({ windowMs: 60_000, max: 5, keyFn: playerKey }));
app.post('/api/alliances/shared-stations/leases/:id/end', rateLimit({ windowMs: 60_000, max: 5, keyFn: playerKey }));

app.route('/api/player/settings', settingsRoutes);
app.route('/api/player/saves', saveRoutes);
app.route('/api/player', playerRoutes);


app.route('/api/chat', chatRoutes);
app.route('/api/social', socialRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/achievements', achievementsRoutes);
app.route('/api/bug-reports', bugReportRoutes);
app.route('/api/alliances', allianceRoutes);
app.route('/api/alliances/treasury', treasuryRouter);
app.route('/api/alliances/gifts', giftsRouter);
app.route('/api/alliances/shared-stations', sharedStationsRouter);
app.route('/api/alliances/loans', loansRouter);
app.route('/api/alliances/activity', activityRouter);
app.route('/api/alliances/competitions', competitionsRouter);
app.route('/api/promo', promoRoutes);
app.route('/api/daily-bonus', dailyBonusRoutes);
app.route('/api/seasonal', seasonalRoutes);
app.route('/api/inbox', inboxRoutes);
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

app.get('/api/me', authMiddleware, async (c) => {
  const playerId = c.get('playerId');
  // Return the full player (including email) so the client can restore the
  // authenticated identity — and founder badge — after a page reload.
  const rows = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: 'Player not found' }, 404);
  // Current-week snapshot for the Friends leaderboard (player_settings jsonb).
  // The client's live-sync poll reconciles it, so multi-device play and any
  // back-office adjustments reflect without waiting for a page reload.
  let weekly: WeeklySnapshot | null = null;
  try {
    const [settingsRow] = await db
      .select({ settings: playerSettings.settings })
      .from(playerSettings)
      .where(eq(playerSettings.playerId, playerId))
      .limit(1);
    const stored = (settingsRow?.settings as Record<string, unknown> | null | undefined)?.weekly as WeeklySnapshot | undefined;
    if (stored && stored.weekKey === isoWeekKey()) weekly = stored;
  } catch {
    // Settings read is best-effort — /me still succeeds without it.
  }
  return c.json({
    playerId,
    authenticated: true,
    player: sanitizePlayer(row),
    weekly,
  });
});

app.get('/api/game-state', authMiddleware, (c) => {
  const playerId = c.get('playerId');
  return c.json({ playerId, timestamp: new Date().toISOString(), note: 'Full game state is client-authoritative; use WebSocket sync for live state.' });
});

// The /ws upgrade handler MUST be registered BEFORE the SPA catch-all below:
// Hono matches routes in registration order, so a `*` catch-all registered
// first swallows the upgrade request and the WebSocket never opens — the
// online layer then sits on "Reconnecting to the dispatch server…" forever
// (v0.22.18 outage fix).
const wsServer = createWsServer(app);

// Generic static-file fallback (v0.26.1): serve any real file Vite copied
// into dist/ — the self-hosted fonts and the PWA install icon — with its
// correct MIME type. /fonts/* and /icon-192.png had no explicit route, so
// they fell through to the SPA catch-all and were served as index.html
// (text/html): the browser rejected the font CSS, and the service worker's
// precache stored that HTML under the font URLs (cache.addAll only checks
// for a 2xx), so offline reloads lost the fonts and the app icon. Falls
// through to the SPA catch-all only when no file exists on disk.
app.get('*', async (c, next) => {
  const res = serveStatic(c);
  if (res) return res;
  await next();
});

app.get('*', (c) => {
  const indexPath = join(FRONTEND_DIR, 'index.html');
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath);
    return new Response(content, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }
  return c.text('Frontend not built. Run: cd apps/web && npx vite build', 500);
});

// Cluster fan-out: unit positions, alliance chat, presence, and the
// maintenance flag travel over Redis when available (in-memory single-instance
// otherwise). The maintenance handler runs alongside the connection manager so
// every instance flips its flag from a founder toggle on any instance.
initPubSub((channel, raw) => {
  handleClusterMessage(channel, raw);
  applyMaintenanceClusterMessage(raw);
});

// Background maintenance: prune stale guest accounts (30 days + no saves) once
// a day. Unref'd timers — never keeps the process alive on its own.
startGuestPruneJob({
  enabled: config.pruneGuests.enabled,
  intervalMs: config.pruneGuests.intervalHours * 60 * 60 * 1000,
  maxAgeMs: config.pruneGuests.maxAgeDays * 24 * 60 * 60 * 1000,
});

// Reconcile is_premium against premium_expires_at daily (v0.32.0) so a lapsed
// Commander membership stops showing premium everywhere.
startPremiumExpiryJob();

// Scheduled maintenance (v0.22.18): when the founder arms a window, flip
// maintenance automatically the moment it arrives and drop the durable inbox
// note then — no 2am toggle. Checks every 15s and once at boot (a window that
// came due while the server was down fires on restart). The inbox insert
// mirrors the manual toggle path so offline players see the window at login.
async function maintenanceSchedulerTick(): Promise<void> {
  try {
    const flipped = await checkScheduledMaintenance();
    if (!flipped) return;
    const note = maintenanceInboxNote(true, getMaintenanceState().reason);
    const allPlayers = await db.select({ id: players.id }).from(players);
    if (allPlayers.length > 0) {
      await db
        .insert(inboxMessages)
        .values(allPlayers.map((p) => ({ recipientId: p.id, title: note.title, body: note.body })));
    }
    console.log(`[maintenance] Scheduled window started — ${allPlayers.length} player(s) notified via inbox`);
  } catch {
    // Non-fatal: the flip already happened; only the inbox fan-out failed.
  }
}
const maintenanceSchedulerInterval = setInterval(() => void maintenanceSchedulerTick(), 15_000);
maintenanceSchedulerInterval.unref?.();
void maintenanceSchedulerTick();

// Alliance loan expiry: mark overdue loans as expired every 5 minutes.
// The DB handles idempotency (only 'active' loans with expiresAt <= now).
const loanExpiryInterval = setInterval(async () => {
  try {
    const count = await expireOverdueLoans();
    if (count > 0) console.log(`[loans] Auto-expired ${count} overdue loan(s)`);
  } catch (err) {
    console.error('[loans] Expiry tick failed:', err);
  }
}, 5 * 60_000);
loanExpiryInterval.unref?.();
// Run once at boot to catch loans that expired while the server was down.
void expireOverdueLoans().then((n) => {
  if (n > 0) console.log(`[loans] Boot expiry: marked ${n} overdue loan(s) as expired`);
}).catch(() => {});

const port = parseInt(process.env.PORT || '3001');
console.log(`Dispatch HQ Combined Server starting on port ${port}`);
const server = serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`Dispatch HQ Server running at http://${info.address}:${info.port}`);
  console.log(`   Health:  http://localhost:${info.port}/health`);
  console.log(`   API:     http://localhost:${info.port}/api/`);
  console.log(`   WS:      ws://localhost:${info.port}/ws`);
  console.log(`   Frontend: ${FRONTEND_DIR}`);
});
wsServer.injectWebSocket(server);
