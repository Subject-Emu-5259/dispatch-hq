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
  /** Ask the main process to restart the (wake-aware) connection attempt. */
  retryLoad: () => ipcRenderer.send('desktop:retry-load'),
  /** Open the live web version in the system browser. */
  openWebVersion: () => ipcRenderer.send('desktop:open-web-version'),
  /**
   * Subscribe to connection-state changes from the main process
   * ('waking' while the wake loop is running, 'unreachable' once the wake
   * window has run out). Used by the bundled status page
   * (assets/offline.html); returns an unsubscribe function.
   */
  onConnectState: (callback: (state: string) => void) => {
    const handler = (_event: unknown, state: string) => callback(state);
    ipcRenderer.on('desktop:connect-state', handler);
    return () => ipcRenderer.removeListener('desktop:connect-state', handler);
  },
});
