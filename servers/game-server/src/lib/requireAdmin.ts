// ============================================
// Dispatch HQ — Admin gate helper
// ============================================
// Shared by routes that need founder/admin access outside routes/admin.ts
// (e.g. the POST /api/seed gate in both server entrypoints). Mirrors the
// gate in admin.ts: the authenticated player's email must be in the admin
// allow-list (founder email + ADMIN_EMAILS env, see config.isAdminEmail).
// Never trust a client-supplied flag — the email is read from the DB row
// for the authenticated playerId.

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { players } from '../db/schema';
import { isAdminEmail } from '../config';

export async function isAdminPlayer(playerId: string): Promise<boolean> {
  const rows = await db
    .select({ email: players.email })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  return isAdminEmail(rows[0]?.email ?? '');
}
