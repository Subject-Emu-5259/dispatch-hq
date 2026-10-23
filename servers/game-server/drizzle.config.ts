import { defineConfig } from 'drizzle-kit';
import { DEV_DATABASE_FALLBACK } from './src/config/devFallbacks';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Pinned DATABASE_URL wins; the dev fallback is the single source of
    // truth in src/config/devFallbacks (never copy the literal here).
    url: process.env.DATABASE_URL || DEV_DATABASE_FALLBACK,
  },
});
