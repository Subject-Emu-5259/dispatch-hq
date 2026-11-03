// ============================================
// Dispatch HQ — Batch 1 harness (P0-1, P0-3, P1-M5, P1-M6, P0-2 safe half)
// ============================================
// Real behavior, not parser checks: the actual route handlers run against
// mocked rows (redaction, 410), the real rate limiter runs in a Hono app
// (scope isolation, proxy flood), and the real cache pruner runs against a
// temp directory (bounded growth, TTL cleanup).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---- GET /:id redaction: mock the DB row + the admin gate ----------------
const PLAYER_ROW = {
  id: 'player-b',
  username: 'commander-b',
  email: 'b@example.com',
  credits: 12345,
  coins: 7,
  xp: 900,
  level: 4,
  isPremium: false,
  premiumExpiresAt: null,
  homeLat: 35.1,
  homeLng: -90.0,
  createdAt: new Date('2026-01-01'),
  lastActive: new Date('2026-01-02'),
};

const isAdminMock = vi.fn((_id: string): boolean => false);

vi.mock('../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([PLAYER_ROW]),
        }),
      }),
    }),
  },
}));
vi.mock('../lib/requireAdmin', () => ({
  isAdminPlayer: (id: string) => isAdminMock(id),
}));
// lib/shop pulls the real config + shared curve; premiumActive only reads
// premiumExpiresAt, so the real implementation is safe to run here.
vi.mock('../lib/grants', () => ({
  pendingGrants: vi.fn(async () => []),
  ackGrants: vi.fn(async () => 0),
}));
// wsServer pulls the Redis-backed connection manager at import time; the
// snapshot-strip test only needs the pure function, so stub the live layer
// (same pattern as allianceChat.test.ts).
vi.mock('../lib/pubsub', () => ({
  isPubSubReady: vi.fn(() => false),
  publishBroadcast: vi.fn(),
}));
vi.mock('../websocket/connectionManager', () => ({
  connectionManager: {
    setAlliance: vi.fn(),
    addConnection: vi.fn(),
    restoreViewport: vi.fn(),
    updatePresence: vi.fn(() => false),
    broadcast: vi.fn(),
    broadcastDelta: vi.fn(),
    getConnectedCount: vi.fn(() => 0),
    getPresence: vi.fn(() => []),
  },
  handleClusterMessage: vi.fn(),
}));

import { playerRoutes } from '../routes/player';
import { validateStatsSync } from '../routes/player';
import { alliancesRouter } from '../routes/alliances';
import { sanitizeSnapshotPlayer } from '../websocket/wsServer';
import { rateLimit } from '../lib/rateLimit';
import { isAllowedRoutingSuffix, isAllowedGeocodeSuffix, pruneCacheDir } from '../routes/mapData';

function playerApp(callerId: string): Hono<{ Variables: { playerId: string } }> {
  const app = new Hono<{ Variables: { playerId: string } }>();
  app.use('*', async (c, next) => {
    c.set('playerId', callerId);
    await next();
  });
  app.route('/', playerRoutes);
  return app;
}

describe('P0-1 GET /api/player/:id redaction', () => {
  beforeEach(() => { isAdminMock.mockReturnValue(false); });

  it('self request returns the full profile including email + home coords', async () => {
    const res = await playerApp('player-b').request('/player-b');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.email).toBe('b@example.com');
    expect(body.homeLat).toBe(35.1);
    expect(body.homeLng).toBe(-90.0);
    expect(body.credits).toBe(12345);
  });

  it('another authenticated non-admin player gets 404 with NO email/home/coords', async () => {
    const res = await playerApp('player-a').request('/player-b');
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain('b@example.com');
    expect(text).not.toContain('35.1');
    expect(text).not.toContain('12345');
  });

  it('an admin caller can still read another player (admin tooling preserved)', async () => {
    isAdminMock.mockReturnValue(true);
    const res = await playerApp('admin-id').request('/player-b');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.email).toBe('b@example.com');
  });
});

describe('P1-M5 stats plausibility gate', () => {
  const base = { missionsCompleted: 100, totalCreditsEarned: 50000, missionsFailed: 5, mutualAidAnswered: 3, bestResponseTime: 120 };

  it('accepts a legit small sync', () => {
    expect(validateStatsSync(base, { ...base, missionsCompleted: 103, totalCreditsEarned: 51200 })).toBeNull();
  });

  it('rejects a +1,000,000 mission jump', () => {
    const err = validateStatsSync(base, { ...base, missionsCompleted: 1000 });
    expect(err).toMatch(/implausible/);
  });

  it('rejects a credits jump over the per-sync delta cap', () => {
    expect(validateStatsSync(base, { ...base, totalCreditsEarned: 50000 + 2000001 })).toMatch(/implausible/);
  });

  it('rejects absolute absurd totals even for a brand-new stats row', () => {
    expect(validateStatsSync(null, { ...base, missionsCompleted: 1000001 })).toMatch(/plausible maximum/);
  });

  it('rejects a first-ever sync jumping straight to the absolute cap (no free first sync)', () => {
    // Regression: live 2026-11-03 a throwaway guest's first sync of exactly
    // 1,000,000 missions landed and ranked on the missions board, because the
    // delta check only ran when a baseline row already existed.
    expect(validateStatsSync(null, { ...base, missionsCompleted: 1000000 })).toMatch(/implausible/);
    expect(validateStatsSync(null, { ...base, missionsCompleted: 501 })).toMatch(/implausible/);
    expect(validateStatsSync(null, { ...base, totalCreditsEarned: 2000001 })).toMatch(/implausible/);
  });

  it('accepts a legit small first-ever sync (baseline is zero)', () => {
    expect(validateStatsSync(null, { missionsCompleted: 5, totalCreditsEarned: 1200, missionsFailed: 1, mutualAidAnswered: 2, bestResponseTime: 300 })).toBeNull();
    expect(validateStatsSync(null, { missionsCompleted: 500, totalCreditsEarned: 2000000, missionsFailed: 500, mutualAidAnswered: 500, bestResponseTime: 0 })).toBeNull();
  });

  it('rejects impossible best response times (too fast or over a day)', () => {
    expect(validateStatsSync(base, { ...base, bestResponseTime: 2 })).toMatch(/plausible range/);
    expect(validateStatsSync(base, { ...base, bestResponseTime: 90000 })).toMatch(/plausible range/);
    expect(validateStatsSync(base, { ...base, bestResponseTime: 0 })).toBeNull();
  });
});

describe('P1-M6 alliance XP: client-reported XP is retired', () => {
  it('POST /alliances/xp returns 410, never a credit', async () => {
    const app = new Hono<{ Variables: { playerId: string } }>();
    app.use('*', async (c, next) => { c.set('playerId', 'player-a'); await next(); });
    app.route('/', alliancesRouter);
    const res = await app.request('/xp', { method: 'POST', body: JSON.stringify({ xp: 500 }) });
    expect(res.status).toBe(410);
    const body = await res.json() as Record<string, unknown>;
    expect(String(body.error)).toMatch(/retired/);
  });
});

describe('P0-2 safe half: WS snapshot carries no credential material', () => {
  it('strips passwordHash and keeps every other field', () => {
    const safe = sanitizeSnapshotPlayer({ ...PLAYER_ROW, passwordHash: 'abc:def' });
    expect('passwordHash' in safe).toBe(false);
    expect(safe.email).toBe('b@example.com');
    expect(safe.credits).toBe(12345);
    expect(safe.id).toBe('player-b');
  });
});

describe('P0-3 proxy: path allowlists', () => {
  it('routing allows only /route/v1/* and /nearest/v1/*', () => {
    expect(isAllowedRoutingSuffix('/route/v1/driving/-90,35;-89,35')).toBe(true);
    expect(isAllowedRoutingSuffix('/nearest/v1/driving/-90,35')).toBe(true);
    expect(isAllowedRoutingSuffix('/table/v1/driving/-90,35')).toBe(false);
    expect(isAllowedRoutingSuffix('/route/v1/driving/../../etc')).toBe(false);
    expect(isAllowedRoutingSuffix('')).toBe(false);
  });

  it('geocode allows only /search', () => {
    expect(isAllowedGeocodeSuffix('/search')).toBe(true);
    expect(isAllowedGeocodeSuffix('/reverse')).toBe(false);
    expect(isAllowedGeocodeSuffix('/search/extra')).toBe(false);
  });
});

describe('P0-3 proxy: bounded cache', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dhq-batch1-cache-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('deletes expired route files and oldest-first until under the cap', () => {
    // 10 tile files, 100 bytes each, with strictly increasing mtimes.
    const tiles = join(dir, 'tiles', '13', '1');
    mkdirSync(tiles, { recursive: true });
    for (let i = 0; i < 10; i++) {
      const f = join(tiles, `${i}.png`);
      writeFileSync(f, Buffer.alloc(100, i));
      const t = new Date(Date.now() - (10 - i) * 1000);
      utimesSync(f, t, t);
    }
    // One 8-day-old osrm file (past the 7-day TTL) — must go first.
    const osrm = join(dir, 'osrm');
    mkdirSync(osrm, { recursive: true });
    const stale = join(osrm, 'old.json');
    writeFileSync(stale, Buffer.alloc(50, 1));
    utimesSync(stale, new Date(Date.now() - 8 * 24 * 3600 * 1000), new Date(Date.now() - 8 * 24 * 3600 * 1000));

    const out = pruneCacheDir(dir, 500);
    expect(existsSync(stale)).toBe(false);
    expect(out.bytes).toBeLessThanOrEqual(500);
    expect(out.deleted).toBeGreaterThan(0);
    // Survivors are the NEWEST tiles (oldest-first eviction).
    const remaining = readdirSync(tiles).map((n) => Number(n.replace('.png', ''))).sort((a, b) => a - b);
    expect(remaining[0]).toBeGreaterThan(0);
  });

  it('a cache already under the cap is untouched', () => {
    const tiles = join(dir, 'tiles');
    mkdirSync(tiles, { recursive: true });
    writeFileSync(join(tiles, 'a.png'), Buffer.alloc(10));
    const out = pruneCacheDir(dir, 1024);
    expect(out.deleted).toBe(0);
    expect(existsSync(join(tiles, 'a.png'))).toBe(true);
  });
});

describe('P0-3 proxy: scoped rate limits', () => {
  it('a proxy-tile burst does NOT eat the auth bucket (scope isolation)', async () => {
    const app = new Hono();
    app.post('/tiles', rateLimit({ windowMs: 60_000, max: 2, scope: 'proxy-tiles' }), (c) => c.json({ ok: true }));
    app.post('/auth', rateLimit({ windowMs: 60_000, max: 2 }), (c) => c.json({ ok: true }));
    const ip = { 'X-Forwarded-For': '203.0.113.9' };
    expect((await app.request('/tiles', { method: 'POST', headers: ip })).status).toBe(200);
    expect((await app.request('/tiles', { method: 'POST', headers: ip })).status).toBe(200);
    expect((await app.request('/tiles', { method: 'POST', headers: ip })).status).toBe(429);
    // Auth bucket untouched by the tile flood.
    expect((await app.request('/auth', { method: 'POST', headers: ip })).status).toBe(200);
  });

  it('a legit map session fits: dozens of tiles under the 300/min proxy cap', async () => {
    const app = new Hono();
    app.get('/tiles', rateLimit({ windowMs: 60_000, max: 300, scope: 'proxy-tiles' }), (c) => c.json({ ok: true }));
    const ip = { 'X-Forwarded-For': '203.0.113.10' };
    let ok = 0;
    for (let i = 0; i < 60; i++) {
      if ((await app.request('/tiles', { headers: ip })).status === 200) ok += 1;
    }
    expect(ok).toBe(60);
  });
});
