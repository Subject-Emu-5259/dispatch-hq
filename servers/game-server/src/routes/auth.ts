// ============================================
// Dispatch HQ — Auth Routes (cookie-based)
// ============================================
// Tokens are issued as HttpOnly SameSite=Strict cookies instead of being
// returned to localStorage. This keeps auth state server-side and off
// browser localStorage.

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { setCookie } from 'hono/cookie';
import { db } from '../db';
import {
  players,
  playerSaves,
  stations,
  units,
  playerSettings,
  playerStats,
  playerAchievements,
  promoRedemptions,
  allianceMembers,
  allianceJoinRequests,
  alliances,
  chatMessages,
  chatMessageReceipts,
  bugReports,
  guestUpgradeAudit,
} from '../db/schema';
import { signToken } from '../auth/jwt';
import { areSignupsOpen, getSignupGateState } from '../lib/signupGate';
import { premiumActive } from '../lib/shop';
import { config } from '../config';
import { isValidEmail, isValidUsername, isValidPassword, fieldTooLong } from '../lib/validation';
import type { AuthVars } from '../auth/middleware';

const auth = new Hono<{ Variables: AuthVars }>();

const TOKEN_COOKIE = 'token';
const TOKEN_MAX_AGE_DAYS = parseInt(String(config.jwt.expiresIn), 10) || 7;

function isSecureRequest(c: any): boolean {
  return c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https');
}

function setAuthCookie(c: any, token: string) {
  setCookie(c, TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: isSecureRequest(c),
    maxAge: 60 * 60 * 24 * TOKEN_MAX_AGE_DAYS,
    path: '/',
  });
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Synthetic guest emails are guest_<hex>@dispatchhq.game. */
export function isGuestEmail(email: string): boolean {
  return email.toLowerCase().startsWith('guest_');
}

/**
 * Tables whose player reference must follow a guest into their upgraded
 * account (re-keyed to the new player id so the merged account inherits every
 * identity-linked row and the guest shell holds nothing). If a new table
 * starts referencing players.id, it must be added here — the upgrade test
 * guards this list against the schema.
 */
export const UPGRADE_REKEY: { table: any; column: any }[] = [
  { table: playerSaves, column: playerSaves.playerId },
  { table: stations, column: stations.ownerId },
  { table: units, column: units.ownerId },
  { table: playerSettings, column: playerSettings.playerId },
  { table: playerStats, column: playerStats.playerId },
  { table: playerAchievements, column: playerAchievements.playerId },
  { table: promoRedemptions, column: promoRedemptions.playerId },
  { table: allianceMembers, column: allianceMembers.playerId },
  { table: allianceJoinRequests, column: allianceJoinRequests.playerId },
  { table: alliances, column: alliances.leaderId },
  { table: chatMessages, column: chatMessages.senderId },
  { table: chatMessageReceipts, column: chatMessageReceipts.readerId },
  { table: bugReports, column: bugReports.playerId },
];

export function sanitizePlayer(row: typeof players.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    credits: row.credits,
    coins: row.coins,
    xp: row.xp,
    level: row.level,
    isPremium: premiumActive(row),
    homeLat: row.homeLat,
    homeLng: row.homeLng,
    createdAt: row.createdAt.toISOString(),
    lastActive: row.lastActive.toISOString(),
  };
}

/**
 * Public signup-gate status for the register form + guest-upgrade card.
 * Unlike the founder-only /api/admin/signup-gate, this one is safe to call
 * unauthenticated — it only exposes { open, reopensAt }, never admin data.
 */
auth.get('/signup-status', (c) => {
  const { open, reopensAt } = getSignupGateState();
  return c.json({ open, reopensAt });
});

auth.post('/register', async (c) => {
  let body: { username?: string; email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { username, email, password } = body;
  if (!username || !email || !password) {
    return c.json({ error: 'Missing required fields: username, email, password' }, 400);
  }
  // Founder-controlled signup gate: when closed, new accounts are rejected
  // (403) while login/guest play keep working. Login path intentionally
  // unaffected — existing players are never locked out. The response carries
  // reopensAt (when armed) so the client can show a live countdown.
  if (!areSignupsOpen()) {
    const { reopensAt } = getSignupGateState();
    return c.json({
      error: 'New signups are temporarily paused. Existing players can still log in and play.',
      reopensAt,
    }, 403);
  }
  if (!isValidUsername(username)) {
    return c.json({ error: 'Username must be 3-30 characters (letters, digits, space, _ or -)' }, 400);
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'Please enter a valid email address' }, 400);
  }
  if (!isValidPassword(password)) {
    return c.json({ error: 'Password must be 6-128 characters' }, 400);
  }

  const existing = await db.select().from(players).where(eq(players.email, email)).limit(1);
  if (existing.length > 0) return c.json({ error: 'Email already registered' }, 409);

  const result = await db.insert(players).values({
    username,
    email,
    passwordHash: hashPassword(password),
  }).returning();
  const row = result[0];
  const token = await signToken(row.id);
  setAuthCookie(c, token);
  return c.json({ player: sanitizePlayer(row) }, 201);
});

auth.post('/login', async (c) => {
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'Missing email or password' }, 400);
  if (!isValidEmail(email)) return c.json({ error: 'Please enter a valid email address' }, 400);
  if (fieldTooLong(password, 128)) return c.json({ error: 'Password is too long' }, 400);

  const result = await db.select().from(players).where(eq(players.email, email)).limit(1);
  if (result.length === 0 || !verifyPassword(password, result[0].passwordHash)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const row = result[0];
  await db.update(players).set({ lastActive: new Date() }).where(eq(players.id, row.id));
  const token = await signToken(row.id);
  setAuthCookie(c, token);
  return c.json({ player: sanitizePlayer(row) });
});

/**
 * Upgrade a guest session into a real account (authMiddleware-protected, so
 * the guest is identified from their cookie — the client never supplies the
 * guest id). With mergeCampaign, the guest's campaign and identity-linked data
 * are transferred to the new account in one transaction and the inert guest
 * row is deleted; without it, the new account starts fresh and the guest
 * account is left untouched.
 */
auth.post('/upgrade', async (c) => {
  const guestId = c.get('playerId');
  let body: { username?: string; email?: string; password?: string; mergeCampaign?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { username, email, password, mergeCampaign } = body;
  if (!username || !email || !password) {
    return c.json({ error: 'Missing required fields: username, email, password' }, 400);
  }
  // The signup gate also covers guest→account upgrades: both create a real
  // account, and the upgrade path is the main backdoor past a closed gate.
  if (!areSignupsOpen()) {
    const { reopensAt } = getSignupGateState();
    return c.json({
      error: 'New signups are temporarily paused. Your guest progress stays safe on this device.',
      reopensAt,
    }, 403);
  }
  if (password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400);

  const guestRows = await db.select().from(players).where(eq(players.id, guestId)).limit(1);
  const guest = guestRows[0];
  if (!guest || !isGuestEmail(guest.email)) {
    return c.json({ error: 'Only a guest session can be upgraded' }, 400);
  }

  const existing = await db.select().from(players).where(eq(players.email, email)).limit(1);
  if (existing.length > 0) return c.json({ error: 'Email already registered' }, 409);

  const merged = mergeCampaign === true;
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(players).values({
        username,
        email,
        passwordHash: hashPassword(password),
      }).returning();
      if (!created) throw new Error('Account creation failed');

      if (merged) {
        // Carry the guest's progression onto the new identity.
        await tx.update(players)
          .set({
            credits: guest.credits,
            coins: guest.coins,
            xp: guest.xp,
            level: guest.level,
            homeLat: guest.homeLat,
            homeLng: guest.homeLng,
            lastActive: new Date(),
          })
          .where(eq(players.id, created.id));

        // Re-key every identity-linked row so nothing is orphaned. The unique
        // constraints can never collide: a brand-new account has no saves,
        // settings, achievements, redemptions, or alliance memberships yet.
        for (const { table, column } of UPGRADE_REKEY) {
          await tx.update(table).set({ [column.name]: created.id }).where(eq(column, guestId));
        }

        // The guest row stays (zeroed) rather than deleted: the guest's
        // WebSocket session can remain alive until the next page load, and its
        // server writes (chat senderId etc.) must keep their foreign key
        // valid. The row is now inert — synthetic email, unusable random
        // password, zeroed stats — so it can't rank, log in, or be upgraded.
        await tx.update(players)
          .set({ credits: 0, coins: 0, xp: 0, level: 1, lastActive: new Date() })
          .where(eq(players.id, guestId));
      }

      // Audit every upgrade (merged or not) so the founder can trace accidental
      // merges from the Admin Console. guestId stays pointing at the guest shell
      // row (which is kept), so the FK remains valid indefinitely.
      await tx.insert(guestUpgradeAudit).values({
        guestId,
        accountId: created.id,
        merged,
      });

      // Re-read so the response reflects the merged progression (the insert
      // row carries the defaults, not the transferred credits/xp/level).
      const finalRows = await tx.select().from(players).where(eq(players.id, created.id)).limit(1);
      const finalRow = finalRows[0] ?? created;
      const token = await signToken(created.id);
      setAuthCookie(c, token);
      return c.json({ player: sanitizePlayer(finalRow), merged }, 201);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('unique') || message.includes('duplicate')) {
      return c.json({ error: 'Username or email already taken' }, 409);
    }
    console.error('Account upgrade failed:', err);
    return c.json({ error: 'Upgrade failed — please try again' }, 500);
  }
});

auth.post('/guest', async (c) => {
  const rand = randomBytes(8).toString('hex');
  const username = `Guest_${rand}`;
  const email = `guest_${rand}@dispatchhq.game`;
  const password = randomBytes(24).toString('hex');
  const result = await db.insert(players).values({
    username,
    email,
    passwordHash: hashPassword(password),
  }).returning();
  const row = result[0];
  const token = await signToken(row.id);
  setAuthCookie(c, token);
  return c.json({ player: sanitizePlayer(row) }, 201);
});

auth.post('/logout', (c) => {
  setCookie(c, TOKEN_COOKIE, '', {
    httpOnly: true,
    sameSite: 'Strict',
    secure: isSecureRequest(c),
    maxAge: 0,
    path: '/',
  });
  return c.json({ success: true });
});

export { auth as authRoutes };
