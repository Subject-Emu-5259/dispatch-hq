// ============================================
// Dispatch HQ — On-Origin Map Data Proxy
// ============================================
// Serves the game's map data from ITS OWN origin instead of third-party hosts:
//
//   /tiles/{z}/{x}/{y}.png   → OpenStreetMap raster tiles, cached to disk
//   /routing/route/...       → OSRM driving routes, cached to disk
//   /routing/nearest/...     → OSRM road snapping, cached to disk
//
// First request for a given tile/route fetches from the upstream provider and
// writes it to a local disk cache (env `DHQ_CACHE_DIR`, default /tmp/dhq-cache);
// every later request is served from the game's own origin with long cache
// headers. The client keeps remote endpoints as a last-resort fallback only.
import type { Context } from 'hono';
import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TILE_UPSTREAM = 'https://tile.openstreetmap.org';
const ROUTING_UPSTREAMS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];
const GEOCODE_UPSTREAM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'DispatchHQ/0.23.1 (emergency dispatch game; on-origin map-data cache)';

const TILE_CACHE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=31536000, immutable',
};
const ROUTE_CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=604800',
};
const GEOCODE_CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=604800',
};

// One in-flight request per key so concurrent misses for the same tile/route
// don't fan out N identical upstream fetches (a 30-marker map would otherwise
// re-fetch the same tiles while the first request is still in flight).
const inFlight = new Map<string, Promise<Buffer | null>>();

function cacheDir(): string {
  return process.env.DHQ_CACHE_DIR || '/tmp/dhq-cache';
}

/** Buffer → ArrayBuffer view (the TS DOM lib rejects Buffer as BodyInit). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function tileCachePath(z: number, x: number, y: number): string {
  return join(cacheDir(), 'tiles', String(z), String(x), `${y}.png`);
}

function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_UPSTREAM}/${z}/${x}/${y}.png`;
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const file = tileCachePath(z, x, y);
  if (existsSync(file)) return readFileSync(file);

  const key = `${z}/${x}/${y}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(tileUrl(z, x, y), {
          headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' },
        });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(join(cacheDir(), 'tiles', String(z), String(x)), { recursive: true });
        writeFileSync(file, buf);
        return buf;
      } catch {
        return null;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  return pending;
}

/**
 * Serve a raster tile for /tiles/{z}/{x}/{y}.png — 404 on any invalid ref.
 *
 * The route is registered as a wildcard (`/tiles/*`) and z/x/y are parsed from
 * the URL here. Do NOT parse via `c.req.param()`: under Hono's RegExpRouter a
 * `:z/:x/:y.png` param route matches but does not populate `param('y')` (the
 * `.png` suffix is absorbed into the param name), so every tile 404'd in
 * production while `/routing/*` and `/geocode/*` (which parse the URL) worked.
 */
export async function tileHandler(c: Context): Promise<Response> {
  const m = String(c.req.raw.url).match(/\/tiles\/(\d+)\/(\d+)\/(\d+)(?:\.png)?(?:[?#].*)?$/);
  if (!m) return c.notFound();
  const z = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (z < 0 || z > 19) return c.notFound();
  const max = 2 ** z;
  if (x < 0 || x >= max || y < 0 || y >= max) return c.notFound();

  const buf = await fetchTile(z, x, y);
  if (!buf) return c.text('Tile unavailable', 502);
  return new Response(toArrayBuffer(buf), { headers: TILE_CACHE_HEADERS });
}

function geocodeCachePath(url: URL): string {
  const suffix = url.pathname.replace(/^\/geocode/, '');
  const key = (suffix + url.search).replace(/[^a-zA-Z0-9.,;=_-]/g, '_');
  return join(cacheDir(), 'geocode', `${key}.json`);
}

function routeCachePath(url: URL): string {
  // Key = the path under /routing plus the query, flattened to a single safe
  // filename (the path prefix contains / which must NOT become directories).
  const suffix = url.pathname.replace(/^\/routing/, ''); // e.g. /route/v1/driving/-90.1,35.2;...
  const key = (suffix + url.search).replace(/[^a-zA-Z0-9.,;=_-]/g, '_');
  return join(cacheDir(), 'osrm', `${key}.json`);
}

const ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // road network changes are rare; 7d is plenty

/** Serve an OSRM route/nearest response for /routing/* — cached on disk. */
export async function routingHandler(c: Context): Promise<Response> {
  const url = new URL(c.req.raw.url);
  const suffix = url.pathname.replace(/^\/routing/, '');
  const file = routeCachePath(url);

  // Cache hit (within TTL) — serve from the game's own origin.
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < ROUTE_TTL_MS) {
    return new Response(toArrayBuffer(readFileSync(file)), { headers: ROUTE_CACHE_HEADERS });
  }

  // Try each upstream; first success wins and fills the cache.
  for (const base of ROUTING_UPSTREAMS) {
    const key = `${base}${suffix}${url.search}`;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const res = await fetch(key, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          });
          if (!res.ok) return null;
          const buf = Buffer.from(await res.arrayBuffer());
          mkdirSync(join(cacheDir(), 'osrm'), { recursive: true });
          writeFileSync(file, buf);
          return buf;
        } catch {
          return null;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, pending);
    }
    const buf = await pending;
    if (buf) return new Response(toArrayBuffer(buf), { headers: ROUTE_CACHE_HEADERS });
  }

  return c.text('Routing unavailable', 502);
}

/** Serve a Nominatim search result for /geocode/* — cached on disk. */
export async function geocodeHandler(c: Context): Promise<Response> {
  const url = new URL(c.req.raw.url);
  const file = geocodeCachePath(url);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < ROUTE_TTL_MS) {
    return new Response(toArrayBuffer(readFileSync(file)), { headers: GEOCODE_CACHE_HEADERS });
  }

  const target = `${GEOCODE_UPSTREAM}${url.pathname.replace(/^\/geocode/, '')}${url.search}`;
  const key = target;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(target, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'Accept-Language': c.req.header('accept-language') || 'en',
          },
        });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(join(cacheDir(), 'geocode'), { recursive: true });
        writeFileSync(file, buf);
        return buf;
      } catch {
        return null;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  const buf = await pending;
  if (!buf) return c.text('Geocoding unavailable', 502);
  return new Response(toArrayBuffer(buf), { headers: GEOCODE_CACHE_HEADERS });
}
