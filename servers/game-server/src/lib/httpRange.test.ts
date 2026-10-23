import { describe, it, expect } from 'vitest';
import { buildStaticResponse } from './httpRange';

// Deterministic 1000-byte payload: content[i] = i % 256.
function payload(size = 1000): Uint8Array {
  return Uint8Array.from({ length: size }, (_, i) => i % 256);
}

async function bodyBytes(res: Response): Promise<number[]> {
  return [...new Uint8Array(await res.arrayBuffer())];
}

const CT = 'video/mp4';
const CC = 'public, max-age=300, must-revalidate';

describe('buildStaticResponse — HTTP Range (Safari <video> streaming regression)', () => {
  it('serves the full file with 200 + Accept-Ranges when no Range header is present', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC });
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Type')).toBe(CT);
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(await bodyBytes(res)).toEqual([...payload()]);
  });

  it('answers bytes=start-end with 206 and the exact slice', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=100-199' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(await bodyBytes(res)).toEqual([...payload().slice(100, 200)]);
  });

  it('answers an open-ended bytes=start- with 206 through EOF', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=900-' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 900-999/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(await bodyBytes(res)).toEqual([...payload().slice(900)]);
  });

  it('answers a suffix bytes=-N with 206 for the last N bytes', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=-100' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 900-999/1000');
    expect(await bodyBytes(res)).toEqual([...payload().slice(900)]);
  });

  it('serves a single byte range (the probe Safari sends first)', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=0-1' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/1000');
    expect(res.headers.get('Content-Length')).toBe('2');
    expect(await bodyBytes(res)).toEqual([0, 1]);
  });

  it('clamps an over-long end to the last byte', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=0-999999' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-999/1000');
    expect(await bodyBytes(res)).toEqual([...payload()]);
  });

  it('serves the whole file when a suffix is larger than the file', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=-5000' });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-999/1000');
    expect(await bodyBytes(res)).toEqual([...payload()]);
  });

  it('returns 416 with bytes */<size> when start is past EOF', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=1000-' });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect((await bodyBytes(res)).length).toBe(0);
  });

  it('returns 416 for an inverted range bytes=5-2', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=5-2' });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('returns 416 for a zero-length suffix bytes=-0', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=-0' });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('ignores an empty bytes=- and serves the full file', async () => {
    const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: 'bytes=-' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(await bodyBytes(res)).toEqual([...payload()]);
  });

  it('ignores a malformed range and serves the full file', async () => {
    for (const bad of ['bytes=abc', 'bytes=1-2-3', 'bytes=foo-bar', 'not-a-range']) {
      const res = buildStaticResponse({ content: payload(), contentType: CT, cacheControl: CC, rangeHeader: bad });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Range')).toBeNull();
    }
  });

  it('handles an empty file: no range → 200, any range → 416', async () => {
    const empty = payload(0);
    const full = buildStaticResponse({ content: empty, contentType: CT, cacheControl: CC });
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Length')).toBe('0');

    const ranged = buildStaticResponse({ content: empty, contentType: CT, cacheControl: CC, rangeHeader: 'bytes=0-' });
    expect(ranged.status).toBe(416);
    expect(ranged.headers.get('Content-Range')).toBe('bytes */0');
  });
});
