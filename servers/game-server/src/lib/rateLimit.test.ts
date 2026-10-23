import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimit, getRateLimitStats, pruneRateLimitStats } from './rateLimit';

function makeApp(max: number, windowMs = 60_000): Hono {
  const app = new Hono();
  app.post('/limited', rateLimit({ windowMs, max }));
  app.post('/limited', (c) => c.json({ ok: true }));
  app.get('/open', (c) => c.json({ ok: true }));
  return app;
}

describe('rateLimit', () => {
  it('allows requests up to the limit then blocks with 429 + Retry-After', async () => {
    const app = makeApp(2);
    const headers = { 'X-Forwarded-For': '10.0.0.1' };
    const first = await app.request('/limited', { method: 'POST', headers });
    expect(first.status).toBe(200);
    const second = await app.request('/limited', { method: 'POST', headers });
    expect(second.status).toBe(200);
    const third = await app.request('/limited', { method: 'POST', headers });
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBeTruthy();
    const body = await third.json();
    expect(body.error).toBeTruthy();
  });

  it('buckets are per client IP, not shared', async () => {
    const app = makeApp(1);
    const a1 = await app.request('/limited', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    const a2 = await app.request('/limited', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    const b1 = await app.request('/limited', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '5.6.7.8' },
    });
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(200);
  });

  it('window resets after windowMs', async () => {
    const app = makeApp(1, 20); // 20ms window
    const headers = { 'X-Forwarded-For': '10.0.0.9' };
    expect((await app.request('/limited', { method: 'POST', headers })).status).toBe(200);
    expect((await app.request('/limited', { method: 'POST', headers })).status).toBe(429);
    await new Promise((r) => setTimeout(r, 40));
    expect((await app.request('/limited', { method: 'POST', headers })).status).toBe(200);
  });

  it('only rate-limits the configured route', async () => {
    const app = makeApp(1);
    expect((await app.request('/open')).status).toBe(200);
    expect((await app.request('/open')).status).toBe(200);
  });

  it('keys on a custom bucket (e.g. player id) when keyFn is set', async () => {
    const app = new Hono();
    // Player id rides in a header for this test; in production it comes from
    // the auth middleware's context var.
    app.post(
      '/limited',
      rateLimit({ windowMs: 60_000, max: 1, keyFn: (c) => `player:${c.req.header('x-player-id')}` }),
    );
    app.post('/limited', (c) => c.json({ ok: true }));

    // Same player from two different IPs shares one bucket → second request 429s.
    const r1 = await app.request('/limited', { method: 'POST', headers: { 'x-player-id': 'p1', 'X-Forwarded-For': '1.1.1.1' } });
    const r2 = await app.request('/limited', { method: 'POST', headers: { 'x-player-id': 'p1', 'X-Forwarded-For': '2.2.2.2' } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);

    // A different player is unaffected.
    const r3 = await app.request('/limited', { method: 'POST', headers: { 'x-player-id': 'p2', 'X-Forwarded-For': '1.1.1.1' } });
    expect(r3.status).toBe(200);
  });
});

describe('rate-limit observability counters (v0.30.0)', () => {
  it('increments allowed and blocked counters per route label', async () => {
    const label = 'test-counters';
    const app = new Hono();
    app.post('/x', rateLimit({ windowMs: 60_000, max: 1, label }));
    app.post('/x', (c) => c.json({ ok: true }));
    const headers = { 'X-Forwarded-For': '9.9.9.9' };
    expect((await app.request('/x', { method: 'POST', headers })).status).toBe(200);
    expect((await app.request('/x', { method: 'POST', headers })).status).toBe(429);
    const route = getRateLimitStats().routes.find((r) => r.route === label);
    expect(route).toBeDefined();
    expect(route!.allowed).toBe(1);
    expect(route!.blocked).toBe(1);
    expect(route!.lastBlockedAt).not.toBeNull();
  });

  it('ranks per-key offenders by blocked count', async () => {
    const label = 'test-offenders';
    const app = new Hono();
    app.post('/x', rateLimit({ windowMs: 60_000, max: 1, label }));
    app.post('/x', (c) => c.json({ ok: true }));
    const a = { 'X-Forwarded-For': '8.8.8.8' };
    const b = { 'X-Forwarded-For': '8.8.4.4' };
    await app.request('/x', { method: 'POST', headers: a }); // allowed
    await app.request('/x', { method: 'POST', headers: a }); // blocked #1
    await app.request('/x', { method: 'POST', headers: a }); // blocked #2
    await app.request('/x', { method: 'POST', headers: b }); // allowed
    await app.request('/x', { method: 'POST', headers: b }); // blocked #1
    const stats = getRateLimitStats();
    expect(stats.offenders.find((o) => o.key === '8.8.8.8')?.blocked).toBe(2);
    expect(stats.offenders.find((o) => o.key === '8.8.4.4')?.blocked).toBe(1);
    expect(stats.offenders[0]?.key).toBe('8.8.8.8');
  });

  it('prunes offender stats past the retention window', async () => {
    const label = 'test-prune';
    const app = new Hono();
    app.post('/x', rateLimit({ windowMs: 60_000, max: 1, label }));
    app.post('/x', (c) => c.json({ ok: true }));
    const headers = { 'X-Forwarded-For': '7.7.7.7' };
    await app.request('/x', { method: 'POST', headers }); // allowed
    await app.request('/x', { method: 'POST', headers }); // blocked
    expect(getRateLimitStats().offenders.some((o) => o.key === '7.7.7.7')).toBe(true);
    pruneRateLimitStats(Date.now() + 2 * 60 * 60 * 1000);
    expect(getRateLimitStats().offenders.some((o) => o.key === '7.7.7.7')).toBe(false);
  });
});
