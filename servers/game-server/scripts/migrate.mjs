// Applies committed Drizzle migrations (servers/game-server/drizzle/) to the
// DATABASE_URL database, then exits. Run once at container start, before the
// server boots; the migrator tracks applied migrations in the DB, so repeat
// runs are no-ops. Added for the Render deployment (the old Zo runbook ran
// `drizzle-kit push` by hand instead — RELEASES.md §1).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set — refusing to continue.');
  process.exit(1);
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log('[migrate] migrations applied (or already up to date)');
} finally {
  await client.end();
}
