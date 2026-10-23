import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'https://dispatch-hq-deandrewharris.zocomputer.io',
      '/ws': { target: 'wss://dispatch-hq-deandrewharris.zocomputer.io', ws: true },
      // On-origin map data (dev mirrors prod: same-origin paths, upstream hosts
      // stripped the same way the server's /tiles + /routing proxy does).
      // On-origin map data (dev mirrors prod: same-origin paths, upstream hosts
      // stripped the same way the server's /tiles + /routing proxy does). The
      // upstreams require a real User-Agent — OSM rejects http-proxy's default
      // one (403/500), which made tiles and routes fail in dev while prod was
      // fine (v0.28.0 fix). Mirrors the server's mapData.ts header set.
      '/tiles': {
        target: 'https://tile.openstreetmap.org',
        changeOrigin: true,
        headers: { 'User-Agent': 'DispatchHQ-dev/0.28.0 (local vite dev proxy)', Accept: 'image/png' },
        rewrite: (p: string) => p.replace(/^\/tiles/, ''),
      },
      '/routing': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        headers: { 'User-Agent': 'DispatchHQ-dev/0.28.0 (local vite dev proxy)', Accept: 'application/json' },
        rewrite: (p: string) => p.replace(/^\/routing/, ''),
      },
      '/geocode': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        headers: { 'User-Agent': 'DispatchHQ-dev/0.28.0 (local vite dev proxy)' },
        rewrite: (p: string) => p.replace(/^\/geocode/, ''),
      },
    },
  },
});
