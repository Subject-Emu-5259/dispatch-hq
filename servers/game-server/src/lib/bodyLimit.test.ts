import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  jsonBodyLimit,
  limitForPath,
  JSON_BODY_LIMIT_DEFAULT,
  SAVE_BODY_LIMIT,
} from './bodyLimit';

function makeApp(): Hono {
  const app = new Hono();
  app.use('*', jsonBodyLimit);
  app.post('/write', async (c) => {
    await c.req.json();
    return c.json({ ok: true });
  });
  app.post('/api/player/saves', async (c) => {
    await c.req.json();
    return c.json({ ok: true });
  });
  return app;
}

describe('jsonBodyLimit', () => {
  it('rejects a body over the default cap with 413', async () => {
    const app = makeApp();
    const big = 'x'.repeat(JSON_BODY_LIMIT_DEFAULT + 1);
    const res = await app.request('/write', {
      method: 'POST',
      body: big,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(413);
  });

  it('allows a body under the default cap', async () => {
    const app = makeApp();
    const res = await app.request('/write', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('gives the save route the larger cap', async () => {
    const app = makeApp();
    // Over the 1 MiB default, under the 10 MiB save override — valid JSON so
    // the handler's own c.req.json() parse succeeds once past the limiter.
    const big = JSON.stringify({ data: 'x'.repeat(JSON_BODY_LIMIT_DEFAULT) });
    const res = await app.request('/api/player/saves', {
      method: 'POST',
      body: big,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('limitForPath selects the save override and the default otherwise', () => {
    expect(limitForPath('/api/player/saves')).toBe(SAVE_BODY_LIMIT);
    expect(limitForPath('/api/player/saves/')).toBe(SAVE_BODY_LIMIT);
    expect(limitForPath('/api/chat')).toBe(JSON_BODY_LIMIT_DEFAULT);
    expect(limitForPath('/api/auth/login')).toBe(JSON_BODY_LIMIT_DEFAULT);
  });
});
