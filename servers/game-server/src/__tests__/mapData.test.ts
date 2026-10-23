import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tileHandler, routingHandler, geocodeHandler } from '../routes/mapData';

// ---- helpers -------------------------------------------------------------

let tmpCache: string;
let fetchSpy: ReturnType<typeof vi.fn>;

function fakeCtx(params: Record<string, string>, url: string): any {
  return {
    req: { param: (k: string) => params[k] ?? null, raw: { url } },
    notFound: () => new Response('not found', { status: 404 }),
    text: (s: string, status = 200) => new Response(s, { status }),
  };
}

function pngBytes(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
}

function okResponse(body: string | ArrayBuffer): Response {
  return new Response(body, { status: 200 });
}

// ---- suite ---------------------------------------------------------------

describe('mapData — on-origin tile + routing proxy', () => {
  beforeEach(() => {
    tmpCache = mkdtempSync(join(tmpdir(), 'dhq-mapdata-'));
    process.env.DHQ_CACHE_DIR = tmpCache;
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DHQ_CACHE_DIR;
    rmSync(tmpCache, { recursive: true, force: true });
  });

  describe('tileHandler', () => {
    it('serves a tile from upstream and writes it to the disk cache', async () => {
      fetchSpy.mockResolvedValue(okResponse(pngBytes()));
      const ctx = fakeCtx({ z: '13', x: '2043', y: '3240.png' }, 'http://x/tiles/13/2043/3240.png');

      const res = await tileHandler(ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toContain('immutable');

      const file = join(tmpCache, 'tiles', '13', '2043', '3240.png');
      expect(existsSync(file)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0][0])).toBe('https://tile.openstreetmap.org/13/2043/3240.png');
    });

    it('serves a cached tile WITHOUT hitting upstream again', async () => {
      const file = join(tmpCache, 'tiles', '11', '510', '810.png');
      mkdirSync(join(tmpCache, 'tiles', '11', '510'), { recursive: true });
      writeFileSync(file, new Uint8Array(pngBytes()));

      const ctx = fakeCtx({ z: '11', x: '510', y: '810.png' }, 'http://x/tiles/11/510/810.png');
      const res = await tileHandler(ctx);
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('dedupes concurrent misses for the same tile to a single upstream fetch', async () => {
      fetchSpy.mockResolvedValue(okResponse(pngBytes()));
      const ctx = fakeCtx({ z: '13', x: '5', y: '7.png' }, 'http://x/tiles/13/5/7.png');
      const [a, b, c] = await Promise.all([tileHandler(ctx), tileHandler(ctx), tileHandler(ctx)]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('404s on invalid tile references (bad zoom, out-of-range, non-numeric)', async () => {
      expect((await tileHandler(fakeCtx({}, 'http://x/tiles/20/1/1.png'))).status).toBe(404); // z > 19
      expect((await tileHandler(fakeCtx({}, 'http://x/tiles/2/9/0.png'))).status).toBe(404); // x >= 2^2
      expect((await tileHandler(fakeCtx({}, 'http://x/tiles/abc/1/1.png'))).status).toBe(404); // non-numeric z
    });

    it('502s when upstream fails', async () => {
      fetchSpy.mockResolvedValue(new Response('gone', { status: 404 }));
      const res = await tileHandler(fakeCtx({}, 'http://x/tiles/13/1/1.png'));
      expect(res.status).toBe(502);
    });
  });

  describe('routingHandler', () => {
    const routeUrl = 'http://x/routing/route/v1/driving/-90.12,35.1;-90.11,35.12?overview=full&geometries=geojson';
    const routeBody = JSON.stringify({ code: 'Ok', routes: [{ distance: 1200, duration: 90 }] });

    it('proxies a route to OSRM, caches it, and serves subsequent hits from cache', async () => {
      fetchSpy.mockResolvedValue(okResponse(routeBody));
      const ctx = fakeCtx({}, routeUrl);

      const first = await routingHandler(ctx);
      expect(first.status).toBe(200);
      expect(first.headers.get('content-type')).toContain('application/json');
      expect(await first.text()).toBe(routeBody);
      expect(String(fetchSpy.mock.calls[0][0])).toContain('router.project-osrm.org/route/v1/driving/-90.12,35.1;-90.11,35.12');

      // Cache hit — no second upstream fetch.
      const second = await routingHandler(ctx);
      expect(second.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('serves a fresh cached route without upstream', async () => {
      const dir = join(tmpCache, 'osrm');
      mkdirSync(dir, { recursive: true });
      // Replicate the sanitized (flattened) cache key for this URL — must match
      // routeCachePath in mapData.ts.
      const key = routeUrl.replace(/^http:\/\/x\/routing/, '')
        .replace(/[^a-zA-Z0-9.,;=_-]/g, '_');
      writeFileSync(join(dir, `${key}.json`), routeBody);

      const res = await routingHandler(fakeCtx({}, routeUrl));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(routeBody);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('tries the fallback OSRM endpoint when the primary fails', async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
        .mockResolvedValueOnce(okResponse(routeBody));
      const res = await routingHandler(fakeCtx({}, routeUrl));
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(String(fetchSpy.mock.calls[1][0])).toContain('routing.openstreetmap.de');
    });

    it('502s when every upstream fails', async () => {
      fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }));
      const res = await routingHandler(fakeCtx({}, routeUrl));
      expect(res.status).toBe(502);
    });
  });

  describe('geocodeHandler', () => {
    const geoUrl = 'http://x/geocode/search?q=Memphis&format=json&limit=8';
    const geoBody = JSON.stringify([{ place_id: 1, display_name: 'Memphis, TN' }]);

    it('proxies the city search to Nominatim, caches it, and serves hits from cache', async () => {
      fetchSpy.mockResolvedValue(okResponse(geoBody));
      const ctx = fakeCtx({}, geoUrl);
      ctx.req.header = () => 'en';

      const first = await geocodeHandler(ctx);
      expect(first.status).toBe(200);
      expect(await first.text()).toBe(geoBody);
      expect(String(fetchSpy.mock.calls[0][0])).toBe('https://nominatim.openstreetmap.org/search?q=Memphis&format=json&limit=8');

      const second = await geocodeHandler(ctx);
      expect(second.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // cache hit
    });

    it('502s when Nominatim is unreachable', async () => {
      fetchSpy.mockResolvedValue(new Response('nope', { status: 403 }));
      const ctx = fakeCtx({}, geoUrl);
      ctx.req.header = () => 'en';
      const res = await geocodeHandler(ctx);
      expect(res.status).toBe(502);
    });
  });
});
