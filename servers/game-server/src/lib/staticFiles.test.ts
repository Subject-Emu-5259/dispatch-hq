import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStaticFile, MIME_TYPES } from './staticFiles';

// Real fixture tree (built frontend shape): index.html, hashed assets,
// self-hosted fonts, PWA icon, service worker, offline fallback.
let dir: string;
let frontendDir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dhq-static-'));
  frontendDir = join(dir, 'dist');
  mkdirSync(join(frontendDir, 'fonts'), { recursive: true });
  mkdirSync(join(frontendDir, 'assets'), { recursive: true });
  writeFileSync(join(frontendDir, 'index.html'), '<html></html>');
  writeFileSync(join(frontendDir, 'fonts', 'fonts.css'), '/* fonts */');
  writeFileSync(join(frontendDir, 'icon-192.png'), 'PNG');
  writeFileSync(join(frontendDir, 'service-worker.js'), '/* sw */');
  writeFileSync(join(frontendDir, 'assets', 'index-hash.js'), '/* bundle */');
  writeFileSync(join(frontendDir, 'offline.html'), '<html>offline</html>');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveStaticFile', () => {
  it('rejects the root "/" — a directory — so the SPA catch-all answers instead (v0.27.0 EISDIR regression)', () => {
    expect(resolveStaticFile(frontendDir, '/')).toBeNull();
  });

  it('rejects any bare directory path (e.g. /fonts) for the same reason', () => {
    expect(resolveStaticFile(frontendDir, '/fonts')).toBeNull();
    expect(resolveStaticFile(frontendDir, '/assets')).toBeNull();
  });

  it('serves index.html as text/html', () => {
    const r = resolveStaticFile(frontendDir, '/index.html');
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('text/html; charset=utf-8');
  });

  it('serves /fonts/fonts.css as text/css, not the SPA text/html (v0.26.1 font bug)', () => {
    const r = resolveStaticFile(frontendDir, '/fonts/fonts.css');
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('text/css; charset=utf-8');
    expect(existsSync(r!.filePath)).toBe(true);
  });

  it('serves /icon-192.png as image/png', () => {
    const r = resolveStaticFile(frontendDir, '/icon-192.png');
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('image/png');
  });

  it('serves hashed assets and the service worker', () => {
    const r = resolveStaticFile(frontendDir, '/assets/index-hash.js');
    expect(r).not.toBeNull();
    expect(r!.contentType).toBe('application/javascript; charset=utf-8');
    expect(resolveStaticFile(frontendDir, '/service-worker.js')).not.toBeNull();
    expect(resolveStaticFile(frontendDir, '/offline.html')).not.toBeNull();
  });

  it('rejects path traversal before touching the disk', () => {
    expect(resolveStaticFile(frontendDir, '/../secrets.txt')).toBeNull();
    expect(resolveStaticFile(frontendDir, '/assets/../../etc/passwd')).toBeNull();
    expect(resolveStaticFile(frontendDir, '/%2e%2e/etc/passwd')).toBeNull();
  });

  it('returns null for missing files', () => {
    expect(resolveStaticFile(frontendDir, '/nope.png')).toBeNull();
    expect(resolveStaticFile(frontendDir, '/missing/route')).toBeNull();
  });

  it('falls back to application/octet-stream for unknown extensions', () => {
    writeFileSync(join(frontendDir, 'weird.bin'), 'x');
    const r = resolveStaticFile(frontendDir, '/weird.bin');
    expect(r!.contentType).toBe('application/octet-stream');
  });

  it('MIME_TYPES covers every extension the server explicitly routes', () => {
    for (const ext of ['.html', '.css', '.js', '.json', '.png', '.jpg', '.jpeg', '.mp4', '.svg', '.ico', '.woff', '.woff2', '.webp', '.gif']) {
      expect(MIME_TYPES[ext]).toBeDefined();
    }
  });
});
