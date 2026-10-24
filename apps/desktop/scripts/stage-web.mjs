// ============================================
// stage-web.mjs — build the game client for the desktop bundle
// ============================================
// Builds apps/web in Vite "desktop" mode and stages the output into
// apps/desktop/web-dist/, where electron-builder picks it up as an
// extraResource and the shell serves it locally (see src/main.ts).
//
// The desktop build differs from the Render web deploy build in exactly
// two baked-in values, injected here as process env (Vite gives real
// environment variables priority over .env files, and the repo gitignores
// .env.* — so the pipeline script is the one canonical place for them):
//
//   VITE_API_URL=https://dispatch-hq.onrender.com/api
//     apiClient.ts: API_BASE = import.meta.env.VITE_API_URL || '/api'
//   VITE_WS_URL=wss://dispatch-hq.onrender.com/ws
//     wsClient.ts: import.meta.env.VITE_WS_URL || <origin-derived /ws>
//
// The plain web build (pnpm --filter @dispatch-hq/web build, what Render
// runs) never sees these, so production keeps its same-origin '/api'
// default and origin-derived WebSocket URL. Asset base stays the Vite
// default ('/'): the shell serves the bundle under the production origin
// itself, so root-absolute asset URLs resolve to disk (see main.ts).

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = path.resolve(DESKTOP_DIR, '..', 'web');
const STAGE_DIR = path.join(DESKTOP_DIR, 'web-dist');

const DESKTOP_ENV = {
  VITE_API_URL: 'https://dispatch-hq.onrender.com/api',
  VITE_WS_URL: 'wss://dispatch-hq.onrender.com/ws',
};

const viteBin = path.join(
  WEB_DIR,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);
if (!fs.existsSync(viteBin)) {
  console.error(`stage-web: vite not found at ${viteBin} — run \`pnpm install\` at the repo root first.`);
  process.exit(1);
}

console.log('stage-web: building apps/web (vite --mode desktop) with production endpoints baked in…');
execFileSync(viteBin, ['build', '--mode', 'desktop'], {
  cwd: WEB_DIR,
  stdio: 'inherit',
  env: { ...process.env, ...DESKTOP_ENV },
});

const webDist = path.join(WEB_DIR, 'dist');
if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  console.error(`stage-web: ${webDist}/index.html missing after build — refusing to stage.`);
  process.exit(1);
}

fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.cpSync(webDist, STAGE_DIR, { recursive: true });

let bytes = 0;
for (const entry of fs.readdirSync(STAGE_DIR, { recursive: true, withFileTypes: true })) {
  if (entry.isFile()) {
    bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }
}
console.log(`stage-web: staged ${STAGE_DIR} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
