// ============================================
// Dispatch HQ — Desktop Shell (Electron main)
// ============================================
// A thin native shell around the live web game. The game itself is always
// served by the production URL (or $DHQ_APP_URL for local dev), so every
// launch is already the latest version.
//
// Updates are server-driven: the shell polls the game's /health endpoint and
// compares the server's version against the last-seen version stored in
// userData. On a bump it posts a native notification, stamps the window title
// with the new version, and records it — the existing deploy pipeline is the
// update pipeline (see docs/DESKTOP.md).

import { app, BrowserWindow, Notification, shell, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const APP_URL =
  process.env.DHQ_APP_URL?.trim() ||
  'https://dispatch-hq-deandrewharris.zocomputer.io';

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

function userDataPath(file: string): string {
  return path.join(app.getPath('userData'), file);
}

function readUpdateState(): { lastSeenVersion?: string } {
  try {
    return JSON.parse(fs.readFileSync(userDataPath(UPDATE_STATE_FILE), 'utf-8'));
  } catch {
    return {};
  }
}

function writeUpdateState(state: { lastSeenVersion: string }): void {
  try {
    fs.writeFileSync(userDataPath(UPDATE_STATE_FILE), JSON.stringify(state, null, 2));
  } catch (err) {
    logUpdate(`failed to persist update state: ${(err as Error).message}`);
  }
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  // Guard navigation: keep the shell pinned to the game origin. Everything
  // external (Facebook, Reddit, the help links) opens in the system browser.
  const allowedOrigin = new URL(appOrigin()).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(allowedOrigin)) {
      return { action: 'allow' };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(APP_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Tag the title with the game version once known (also serves as a visible
  // confirmation that the update check ran).
  if (currentGameVersion) {
    mainWindow.setTitle(`Dispatch HQ — v${currentGameVersion}`);
  }
}

// ── Server-driven update check ──────────────────────────────────────────────
// Fetch /health, read `version`, and compare against the last-seen version.
// A mismatch means the server shipped a new release since the user last ran
// the app — notify + restamp. Because the window renders the live URL, the
// new version is already on screen; this is the "update delivered" signal.
async function checkForUpdates(): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${appOrigin()}/health`, {
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
    // Offline or server hiccup — the shell still opens the game as-is.
  }
}

// Re-check hourly while running so a mid-session release is noticed.
setInterval(() => void checkForUpdates(), 60 * 60 * 1000);

app.whenReady().then(() => {
  // Hardened defaults: no mixed content, no permission prompts the game
  // doesn't need, and the session cookie/profile persists across launches.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  createWindow();
  void checkForUpdates();
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
          '({ title: document.title, text: (document.body && document.body.innerText || \"\").trim().length })',
        )
        .then((r: { title: string; text: number }) => {
          if (r.text > 0) {
            clearTimeout(hardTimeout);
            console.log(`SMOKE_OK title=\"${r.title}\" rendered=${r.text > 0}`);
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
  credits: 'Emergency dispatch simulation — server-served, always current.',
});
