// ============================================
// Dispatch HQ — Preload bridge
// ============================================
// Minimal, safe surface exposed to the loaded pages. The game is a web app
// and doesn't need Node access; this exists so native features have a place
// to live without loosening contextIsolation. The retry/open actions are
// used by the bundled offline page (assets/offline.html) — the game page
// itself ignores them.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dispatchDesktop', {
  platform: process.platform,
  isDesktop: true,
  /** Ask the main process to re-probe the server and load the game. */
  retryLoad: () => ipcRenderer.send('desktop:retry-load'),
  /** Open the live web version in the system browser. */
  openWebVersion: () => ipcRenderer.send('desktop:open-web-version'),
});
