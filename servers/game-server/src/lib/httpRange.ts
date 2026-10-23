// ============================================
// Dispatch HQ — HTTP Range (static asset streaming)
// ============================================
// Pure helper for the 200/206/416 responses a static file server must produce.
// Extracted from serve-combined.ts's serveStatic so the v0.23.7 Safari fix —
// answering `Range: bytes=…` with 206 Partial Content so <video> can stream the
// home-page trailer — is unit-testable instead of buried in the server entry
// point. Safari will not play a progressive MP4 unless the server honors byte
// ranges.

export interface StaticResponseOptions {
  content: Uint8Array;
  contentType: string;
  cacheControl: string;
  rangeHeader?: string | null;
}

/** Buffer/TypedArray → ArrayBuffer view (the TS DOM lib rejects Uint8Array as BodyInit). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Build the response for a static asset, honoring a single `bytes=` range.
 *
 * - No / malformed / empty range → 200 with the full body.
 * - `bytes=start-end`, `bytes=start-` (open-ended), `bytes=-N` (suffix) → 206
 *   with the exact slice and a `Content-Range` header.
 * - Unsatisfiable range (start past EOF, inverted, or a zero-length suffix) →
 *   416 with an unsatisfied-range Content-Range header (RFC 7233 form).
 *
 * `Accept-Ranges: bytes` is advertised on every response so clients (and
 * Cloudflare) know ranges are supported up front.
 */
export function buildStaticResponse(opts: StaticResponseOptions): Response {
  const { content, contentType, cacheControl, rangeHeader } = opts;
  const size = content.byteLength;
  const base = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl,
  };

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    // Ignore a malformed/empty range (e.g. `bytes=-` with both sides missing)
    // and fall through to the full-file response.
    if (match && (match[1] !== '' || match[2] !== '')) {
      const [, startStr, endStr] = match;
      let start: number;
      let end: number;
      if (startStr === '') {
        // Suffix range: the last N bytes.
        const suffix = parseInt(endStr, 10);
        start = Math.max(0, size - suffix);
        end = size - 1;
      } else {
        start = parseInt(startStr, 10);
        end = endStr === '' ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
      }
      // Unified unsatisfiable check covers both branches: start past EOF,
      // an inverted `bytes=5-2`, or a zero-length suffix `bytes=-0`.
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${size}`,
            ...base,
          },
        });
      }
      const chunk = content.subarray(start, end + 1);
      return new Response(toArrayBuffer(chunk), {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(chunk.byteLength),
          ...base,
        },
      });
    }
  }

  return new Response(toArrayBuffer(content), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      ...base,
    },
  });
}
