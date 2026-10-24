// ============================================
// Dispatch HQ — Desktop App (Electron main)
// ============================================
// As of v0.4.0 this is a REAL bundled PC build, not a web wrapper: the full
// game client (apps/web) is compiled in "desktop mode" and shipped inside
// the app (see scripts/stage-web.mjs). The game is multiplayer, so the
// bundle still talks to the production server for accounts, saves, chat,
// and live play — but the client itself (HTML/JS/CSS/assets) is on disk.
//
// How the bundled client is served — and why it is NOT a custom app://
// scheme: the production server issues SameSite=Strict auth cookies and
// CORS-allowlist credentialed calls to its own origin only (see
// servers/game-server/src/config.ts). A page loaded from any other origin
// (app://, file://, loopback) could never send those cookies, so login
// would be impossible without changing the server. Instead the app keeps
// the production origin as the document origin and intercepts that host's
// https traffic at the session level:
//   * document + static requests are answered from the bundled web dist,
//   * the server's data paths (/api, /health, /tiles, /routing, /geocode)
//     pass through to the real server via net.fetch on this session, so
//     cookies and CORS behave exactly as they do in a browser tab,
//   * traffic to any other host passes through untouched.
// The web bundle is built with absolute production endpoints
// (VITE_API_URL=https://dispatch-hq.onrender.com/api,
//  VITE_WS_URL=wss://dispatch-hq.onrender.com/ws — see stage-web.mjs), which
// are same-origin from the game's point of view, so nothing about the
// client's networking had to change.
//
// DHQ_APP_URL remains as a dev override: when set, none of the above
// happens and the app keeps the pre-0.4.0 remote-load behavior.
//
// Updates arrive on two channels (docs/DESKTOP.md):
//   * Native OTA — electron-updater checks the GitHub Releases feed,
//     downloads in the background, and offers a restart to apply.
//   * Server version — the /health poll below still tracks the live game
//     version for the window title + "updated" notification.

import {
  app,
  BrowserWindow,
  Notification,
  shell,
  session,
  protocol,
  net,
  dialog,
  ipcMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';

/** The one production origin: API, WebSocket, and document origin. */
const PROD_ORIGIN = 'https://dispatch-hq.onrender.com';
const PROD_HOST = new URL(PROD_ORIGIN).host;

/** Where players re-download the app (the updater's fallback surface). */
const ITCH_PAGE = 'https://avok-interactive.itch.io/dispatch-hq';

// Dev override: an explicit URL (e.g. http://localhost:3000) restores the
// legacy "load the remote site" behavior and disables bundling entirely.
const REMOTE_OVERRIDE = process.env.DHQ_APP_URL?.trim() || '';
const APP_URL = REMOTE_OVERRIDE || PROD_ORIGIN;
const BUNDLED = !REMOTE_OVERRIDE;

// DHQ_SMOKE=1 runs the render gate used by scripts/build-release.sh: load the
// game, wait for real content, print SMOKE_OK and exit 0 (or exit 1 on any
// load failure/timeout) so a packaged app that can't render fails the release.
const SMOKE = process.env.DHQ_SMOKE === '1';

// Last-seen version + a tiny log live in userData so updates are never
// re-nagged and any check failure is diagnosable.
const UPDATE_STATE_FILE = 'update-state.json';
const UPDATE_LOG_FILE = 'desktop-updates.log';

let mainWindow: BrowserWindow | null = null;
let currentGameVersion: string | null = null;
/** Absolute path of the bundled web dist, when bundled mode is active. */
let bundledDistDir: string | null = null;
/** True while the offline page is on screen (re-entry guard). */
let showingOfflinePage = false;

interface UpdateState {
  lastSeenVersion?: string;
  /** Set once the 0.3.0-wrapper service worker + caches have been cleared. */
  bundledMigrationV1?: boolean;
  /** App version for which the "get it from itch" fallback already fired. */
  updaterFallbackFor?: string;
}

function userDataPath(file: string): string {
  return path.join(app.getPath('userData'), file);
}

function readUpdateState(): UpdateState {
  try {
    return JSON.parse(fs.readFileSync(userDataPath(UPDATE_STATE_FILE), 'utf-8')) as UpdateState;
  } catch {
    return {};
  }
}

function patchUpdateState(patch: Partial<UpdateState>): void {
  try {
    const next = { ...readUpdateState(), ...patch };
    fs.writeFileSync(userDataPath(UPDATE_STATE_FILE), JSON.stringify(next, null, 2));
  } catch (err) {
    logUpdate(`failed to persist update state: ${(err as Error).message}`);
  }
}

function writeUpdateState(state: { lastSeenVersion: string }): void {
  patchUpdateState(state);
}

function logUpdate(line: string): void {
  try {
    fs.appendFileSync(
      userDataPath(UPDATE_LOG_FILE),
      `${new Date().toISOString()}  ${line}\n`,
    );
  } catch {
    /* log is best-effort */
  }
}

/** Strip the trailing slash so origin comparison is stable. */
function appOrigin(): string {
  return APP_URL.replace(/\/+$/, '');
}

// ── Bundled web dist ────────────────────────────────────────────────────────
// Packaged builds carry the web dist as an electron-builder extraResource
// (process.resourcesPath/web-dist). In a dev checkout it sits next to the
// compiled shell (apps/desktop/web-dist, produced by stage-web.mjs).

function resolveWebDistDir(): string | null {
  const candidates: string[] = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'web-dist'));
  candidates.push(path.join(__dirname, '..', 'web-dist'));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

function offlinePagePath(): string {
  if (app.isPackaged && process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'offline.html');
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.join(__dirname, '..', 'assets', 'offline.html');
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
};

/** Map a URL pathname to a file inside the dist, refusing escapes. */
function resolveDistFile(distDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, '');
  if (!rel) return null;
  const abs = path.normalize(path.join(distDir, rel));
  if (!abs.startsWith(distDir + path.sep)) return null; // traversal guard
  try {
    if (fs.statSync(abs).isFile()) return abs;
  } catch {
    /* miss — caller falls back */
  }
  return null;
}

function serveDistFile(filePath: string): Response {
  const ext = path.extname(filePath).toLowerCase();
  const headers: Record<string, string> = {
    'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
  };
  // Entry points must never be served stale after an app update; hashed
  // assets are immutable by name and may cache freely.
  if (filePath.endsWith('index.html') || filePath.endsWith('service-worker.js')) {
    headers['Cache-Control'] = 'no-cache';
  }
  return new Response(new Uint8Array(fs.readFileSync(filePath)), { status: 200, headers });
}

/** The server's own data paths — always network, never the bundle. */
const SERVER_PATH_PREFIXES = ['/api/', '/tiles/', '/routing/', '/geocode/'];
function isServerPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname === '/health' ||
    SERVER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** Forward a request to the real network stack on this session, bypassing
 *  this handler so there is no recursion. The handler's Request object
 *  itself cannot be re-fetched (its body stream is bound to the original
 *  upload — net.fetch answers ERR_UNEXPECTED), so a fresh request is built
 *  from its parts. Cookies are deliberately NOT copied by hand: net.fetch
 *  attaches the session's cookies for the URL itself, which is what keeps
 *  the SameSite=Strict auth cookie flowing exactly as in a browser. */
function passthrough(request: Request): Promise<Response> {
  const init: {
    method: string;
    headers: Headers;
    body?: ReadableStream<Uint8Array> | null;
    duplex?: 'half';
    bypassCustomProtocolHandlers: boolean;
  } = {
    method: request.method,
    headers: request.headers,
    bypassCustomProtocolHandlers: true,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body;
    init.duplex = 'half'; // required by the fetch spec for stream bodies
  }
  return net.fetch(request.url, init);
}

/**
 * https interception for bundled mode (see the header for why the document
 * origin stays the production origin). Only the game host is special:
 * server data paths and non-GET requests pass through, existing bundle
 * files are served from disk, asset-like misses pass through so the server
 * answers honestly, and everything else is an SPA route → index.html.
 */
async function handleHttps(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== PROD_HOST || !bundledDistDir) return passthrough(request);
  if (request.method !== 'GET' || isServerPath(url.pathname)) return passthrough(request);

  const file = resolveDistFile(bundledDistDir, url.pathname);
  if (file) return serveDistFile(file);

  // A missing path that looks like a file (has an extension) is a genuine
  // 404-or-server-asset case; extensionless paths are client-side routes.
  const lastSegment = url.pathname.split('/').pop() ?? '';
  if (/\.[a-z0-9]+$/i.test(lastSegment)) return passthrough(request);

  return serveDistFile(path.join(bundledDistDir, 'index.html'));
}

// ── Server reachability + offline page ──────────────────────────────────────
// The bundle renders locally, but play needs the production server. Probe
// /health before the first load: unreachable → a bundled, styled offline
// page with Retry / "open web version" instead of a dead window.

async function probeServer(timeoutMs = 10_000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // net.fetch (Chromium's stack) rather than Node's global fetch: it
    // honors the OS/env proxy configuration exactly like the renderer will,
    // so the probe measures the reachability the app actually has.
    const res = await net.fetch(`${PROD_ORIGIN}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function loadOfflinePage(win: BrowserWindow): void {
  if (showingOfflinePage) return;
  showingOfflinePage = true;
  void win.loadFile(offlinePagePath()).catch(() => {
    // Last resort: an inline page is uglier than a dead window is worse.
    void win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<title>Dispatch HQ — Offline</title><body style="background:#0f172a;color:#e2e8f0;font-family:system-ui;padding:3rem"><h1>Dispatch HQ can\'t reach the server</h1><p>Check your connection, then restart the app. Your saves live on the server — nothing is lost.</p></body>',
        ),
    );
  });
}

async function loadGame(win: BrowserWindow): Promise<void> {
  showingOfflinePage = false;
  if (BUNDLED && bundledDistDir) {
    if (await probeServer()) {
      void win.loadURL(`${PROD_ORIGIN}/`);
    } else {
      loadOfflinePage(win);
    }
    return;
  }
  void win.loadURL(APP_URL);
}

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Dispatch HQ',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: !SMOKE, // smoke mode runs headless (offscreen renderer is enough)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;

  // Guard navigation: the game origin is home — in bundled mode that origin
  // is served from disk, in override mode it is the remote site. Everything
  // external (Facebook, Reddit, the help links) opens in the system browser.
  const allowedOrigin = new URL(appOrigin()).origin;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(allowedOrigin)) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') && showingOfflinePage) return; // our own page
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // A failed main-frame load in bundled mode (e.g. a serving bug) lands on
  // the offline page rather than Chromium's error interstitial. Aborted
  // loads (-3) are navigation churn, not failures. The smoke gate installs
  // its own did-fail-load listener and still fails the release on trouble.
  win.webContents.on('did-fail-load', (_e, errorCode, _desc, _url, isMainFrame) => {
    if (BUNDLED && isMainFrame && errorCode !== -3 && !showingOfflinePage) {
      loadOfflinePage(win);
    }
  });

  void loadGame(win);

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Tag the title with the game version once known (also serves as a visible
  // confirmation that the update check ran).
  if (currentGameVersion) {
    win.setTitle(`Dispatch HQ — v${currentGameVersion}`);
  }
}

// Offline-page actions arrive over IPC from the preload bridge.
ipcMain.on('desktop:retry-load', () => {
  if (mainWindow) void loadGame(mainWindow);
});
ipcMain.on('desktop:open-web-version', () => {
  void shell.openExternal(PROD_ORIGIN);
});

// ── Server-driven version check ─────────────────────────────────────────────
// Fetch /health, read `version`, and compare against the last-seen version.
// A mismatch means the server shipped a new release since the user last ran
// the app — notify + restamp. In bundled mode this tracks the LIVE game
// version (the multiplayer world), independent of the app's own version.
async function checkForUpdates(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await net.fetch(`${appOrigin()}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`/health responded ${res.status}`);
    const body = (await res.json()) as { version?: string };
    const serverVersion = String(body.version ?? '').trim();
    if (!serverVersion) throw new Error('no version in /health payload');

    const state = readUpdateState();
    const wasFresh = state.lastSeenVersion === serverVersion;
    currentGameVersion = serverVersion;
    mainWindow?.setTitle(`Dispatch HQ — v${serverVersion}`);
    if (wasFresh) return; // already seen — nothing new

    const wasKnown = Boolean(state.lastSeenVersion);
    writeUpdateState({ lastSeenVersion: serverVersion });
    logUpdate(`version check: last=${state.lastSeenVersion ?? 'none'} -> server=${serverVersion}`);

    if (!wasKnown) {
      // First run — just record it; nothing to announce yet.
      return;
    }
    if (Notification.isSupported()) {
      new Notification({
        title: 'Dispatch HQ updated',
        body: `You're now running v${serverVersion} — the latest build is live.`,
      }).show();
    }
  } catch (err) {
    logUpdate(`version check failed: ${(err as Error).message}`);
    // Offline or server hiccup — the game still opens as-is.
  }
}

// Re-check hourly while running so a mid-session release is noticed.
setInterval(() => void checkForUpdates(), 60 * 60 * 1000);

// ── Native OTA updates (electron-updater, GitHub Releases feed) ────────────
// Configured by the publish block in electron-builder.yml, which embeds an
// app-update.yml into packaged builds. Inert in dev (not packaged), in
// smoke mode, and until a GitHub Release actually carries the feed files —
// a missing feed is logged, never surfaced. Checks run shortly after launch
// and every 4 hours; downloads happen in the background; a downloaded update
// offers restart-to-apply. If an ANNOUNCED update fails to download/apply
// (the classic case: an unsigned macOS build cannot replace itself), the
// player gets one notification per version pointing at the itch page.

let announcedUpdateVersion: string | null = null;

function initAutoUpdater(): void {
  if (!app.isPackaged || SMOKE) return;
  try {
    autoUpdater.logger = {
      info: (msg: unknown) => logUpdate(`updater: ${String(msg)}`),
      warn: (msg: unknown) => logUpdate(`updater warn: ${String(msg)}`),
      error: (msg: unknown) => logUpdate(`updater error: ${String(msg)}`),
      debug: (msg: unknown) => logUpdate(`updater debug: ${String(msg)}`),
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      announcedUpdateVersion = info.version;
      logUpdate(`updater: update available v${info.version}`);
    });
    autoUpdater.on('update-not-available', () => {
      logUpdate('updater: no update available');
    });
    autoUpdater.on('update-downloaded', (info) => {
      logUpdate(`updater: update downloaded v${info.version}`);
      if (Notification.isSupported()) {
        new Notification({
          title: 'Dispatch HQ update ready',
          body: `Version ${info.version} has been downloaded and will install on restart.`,
        }).show();
      }
      void dialog
        .showMessageBox({
          type: 'info',
          title: 'Update ready',
          message: `Dispatch HQ v${info.version} has been downloaded.`,
          detail: 'Restart the app now to apply the update, or keep playing — it will install the next time you quit.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        })
        .catch(() => {
          /* the notification above already told the player */
        });
    });
    autoUpdater.on('error', (err) => {
      logUpdate(`updater: error: ${err.message}`);
      // Only nag when an update was actually announced and then failed —
      // a missing/unreachable feed before the first release is routine.
      if (!announcedUpdateVersion) return;
      if (readUpdateState().updaterFallbackFor === announcedUpdateVersion) return;
      patchUpdateState({ updaterFallbackFor: announcedUpdateVersion });
      if (Notification.isSupported()) {
        const note = new Notification({
          title: 'Dispatch HQ update needs a manual download',
          body: `Version ${announcedUpdateVersion} couldn't be installed automatically. Click to get it from itch.io.`,
        });
        note.on('click', () => void shell.openExternal(ITCH_PAGE));
        note.show();
      }
    });

    const runCheck = (): void => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        logUpdate(`updater: check failed: ${err.message}`);
      });
    };
    setTimeout(runCheck, 20_000);
    setInterval(runCheck, 4 * 60 * 60 * 1000);
  } catch (err) {
    logUpdate(`updater: init failed: ${(err as Error).message}`);
  }
}

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Hardened defaults: no mixed content, no permission prompts the game
  // doesn't need, and the session cookie/profile persists across launches.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  if (BUNDLED) {
    bundledDistDir = resolveWebDistDir();
    if (bundledDistDir) {
      protocol.handle('https', handleHttps);
      // One-time migration for players upgrading from the 0.3.0 wrapper:
      // that build registered the live site's service worker on this same
      // origin/profile, and its cache-first worker could keep serving the
      // old remote game over the new bundled one. Cookies, localStorage,
      // and IndexedDB are deliberately left untouched.
      if (!readUpdateState().bundledMigrationV1) {
        try {
          await session.defaultSession.clearStorageData({
            storages: ['serviceworkers', 'cachestorage'],
          });
          logUpdate('bundled migration: cleared wrapper-era service worker + cache storage');
        } catch (err) {
          logUpdate(`bundled migration failed: ${(err as Error).message}`);
        }
        patchUpdateState({ bundledMigrationV1: true });
      }
    } else {
      // Dev checkout without a staged web bundle: fall back to the live
      // site so `pnpm start` still works (run stage-web.mjs for the real
      // bundled experience). Packaged builds always carry the bundle.
      console.warn('Dispatch HQ desktop: no bundled web dist found — falling back to the live site.');
      logUpdate('bundled dist missing — remote fallback engaged');
    }
  }

  createWindow();
  void checkForUpdates();
  initAutoUpdater();
  if (SMOKE) runSmoke();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ── Smoke test (DHQ_SMOKE=1) ─────────────────────────────────────────────────
// Release gate: the packaged app must actually render the game, not merely
// launch. Polls the renderer until it produces body content, then exits 0.
// Any load failure, renderer crash, or 60s stall exits 1 — the release fails.
function runSmoke(): void {
  const win = mainWindow;
  if (!win) {
    console.error('SMOKE_FAIL no-window');
    app.exit(1);
    return;
  }
  const fail = (why: string): void => {
    console.error(`SMOKE_FAIL ${why}`);
    app.exit(1);
  };
  const hardTimeout = setTimeout(() => fail('timeout'), 60_000);
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    fail(`did-fail-load ${code} ${String(desc)}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    fail(`renderer-gone ${details.reason}`);
  });
  win.webContents.once('did-finish-load', () => {
    const deadline = Date.now() + 45_000;
    const poll = (): void => {
      if (Date.now() > deadline) {
        fail('render-timeout');
        return;
      }
      win.webContents
        .executeJavaScript(
          '({ title: document.title, text: (document.body && document.body.innerText || "").trim().length })',
        )
        .then((r: { title: string; text: number }) => {
          if (r.text > 0) {
            clearTimeout(hardTimeout);
            console.log(`SMOKE_OK title="${r.title}" rendered=${r.text > 0}`);
            app.exit(0);
          } else {
            setTimeout(poll, 500);
          }
        })
        .catch(() => setTimeout(poll, 500));
    };
    setTimeout(poll, 500);
  });
}

// Standard macOS lifecycle: keep the app alive when all windows close.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.setAboutPanelOptions({
  applicationName: 'Dispatch HQ',
  applicationVersion: currentGameVersion ?? app.getVersion(),
  version: app.getVersion(),
  credits: 'Emergency dispatch simulation — the full game, bundled; multiplayer served live.',
});
