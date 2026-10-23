// ============================================
// Dispatch HQ — Preload bridge
// ============================================
// Minimal, safe surface exposed to the loaded game page. The game is a
// server-served web app and doesn't need Node access; this exists so future
// native features (e.g. receiving the desktop's update events) have a place
// without loosening contextIsolation.

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('dispatchDesktop', {
  platform: process.platform,
  isDesktop: true,
});
