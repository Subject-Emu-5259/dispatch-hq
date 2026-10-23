// ============================================
// Dispatch HQ — Static File Resolution
// ============================================
// Pure resolution of a request path inside the built frontend directory,
// extracted from serve-combined.ts's serveStatic so the rules are unit-tested.
//
// The class of bugs this locks down (v0.28.0):
//   • v0.27.0 homepage 500 — the root "/" (and any bare directory path)
//     resolves to a directory; readFileSync on a directory throws EISDIR.
//     Directories must fall through to the SPA catch-all, never be read.
//   • Path traversal — a ".." segment resolves outside the frontend dir and
//     must be rejected before touching the disk.
//   • MIME types — /fonts/*.css and /icon-192.png must serve as their real
//     type, not the SPA's text/html (the v0.26.1 service-worker font bug).
import { join, extname, sep } from 'path';
import { existsSync, statSync } from 'fs';

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export interface StaticResolution {
  filePath: string;
  contentType: string;
}

/**
 * Resolve a request path inside `frontendDir` to a real file.
 *
 * Returns null when the path escapes the directory (traversal), names
 * something that doesn't exist, or resolves to a directory — in all three
 * cases the caller falls through to the SPA catch-all. Pure and synchronous,
 * so it is trivially unit-testable without booting the server.
 */
export function resolveStaticFile(frontendDir: string, reqPath: string): StaticResolution | null {
  const filePath = join(frontendDir, reqPath);
  // Path-traversal guard: a ".." segment in the request resolves outside
  // FRONTEND_DIR — reject before touching the disk so no route can read a
  // file outside the built frontend.
  if (!filePath.startsWith(frontendDir + sep)) return null;
  // Serve regular files only. The root "/" (and any bare directory path)
  // resolves to a directory — join normalizes "/" to frontendDir + sep —
  // and readFileSync on a directory throws EISDIR (the v0.27.0 homepage 500).
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return {
    filePath,
    contentType: MIME_TYPES[extname(filePath)] || 'application/octet-stream',
  };
}
