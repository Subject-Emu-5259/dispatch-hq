// ============================================
// Dispatch HQ — Config
// ============================================

import { ALLIANCE_MIN_LEVEL } from '@dispatch-hq/shared';

export { ALLIANCE_MIN_LEVEL };

// The dev-only fallback literals live in ./config/devFallbacks — the single
// source of truth — and are re-exported here (import + re-export so the names
// are ALSO in local scope for the guards below) so the urlBootGuard tests keep
// importing them from the same place they always did.
//
//   JWT_SECRET:      retired from production in the pre-launch rotation
//                    (runbook §0b); any process signing with it is broken.
//   DATABASE_URL:    publicly-known dev credentials; since v0.22.19 the server
//                    refuses to boot against them (runbook §0a2).
//   REDIS_URL:       a WARNING, not a hard stop — Redis degrades to in-memory
//                    fanout when absent (single-instance mode is supported).
import { DEV_JWT_FALLBACK, DEV_DATABASE_FALLBACK, DEV_REDIS_FALLBACK } from './config/devFallbacks';
export { DEV_JWT_FALLBACK, DEV_DATABASE_FALLBACK, DEV_REDIS_FALLBACK };

/**
 * Pure pin check, mirroring the deploy.sh session-secret pre-flight: a secret
 * is pinned only when it is a NON-EMPTY string that is NOT the literal dev
 * fallback. An explicitly-set fallback is just as broken as a missing one.
 */
export function jwtSecretIsPinned(secret: string | undefined | null): boolean {
  return typeof secret === 'string' && secret.length > 0 && secret !== DEV_JWT_FALLBACK;
}

/**
 * Generic pin check for the data-store URLs, mirroring jwtSecretIsPinned: a
 * URL is pinned only when it is a NON-EMPTY string that is NOT the literal dev
 * fallback. An explicitly-set fallback is just as broken as a missing one —
 * both silently boot against a local dev store.
 */
export function urlIsPinned(
  url: string | undefined | null,
  fallback: string,
): boolean {
  return typeof url === 'string' && url.length > 0 && url !== fallback;
}

export function databaseUrlIsPinned(url: string | undefined | null): boolean {
  return urlIsPinned(url, DEV_DATABASE_FALLBACK);
}

export function redisUrlIsPinned(url: string | undefined | null): boolean {
  return urlIsPinned(url, DEV_REDIS_FALLBACK);
}

/**
 * Boot-time guard (v0.22.18): an unset/empty JWT_SECRET — or one still holding
 * the literal dev fallback — is a hard stop at startup, not a warning. Tokens
 * minted under a missing/fallback secret are signed with a publicly-known
 * value and every restart can orphan live sessions (the v0.17.5 incident).
 * Tests boot config directly (NODE_ENV=test under vitest) and never serve, so
 * they bypass the throw; local dev can explicitly opt in with
 * ALLOW_DEV_JWT_SECRET=1 (never in production).
 */
export function assertJwtPinned(
  pinned: boolean,
  opts: { isTest?: boolean; allowDev?: boolean } = {},
): void {
  if (pinned) return;
  if (opts.isTest || opts.allowDev) return;
  throw new Error(
    '[dispatch-hq] FATAL: JWT_SECRET is missing, empty, or still the dev fallback — refusing to start. ' +
    'Set a real JWT_SECRET in the service env (see plans/RELEASES.md runbook §0b). ' +
    'Local-only escape hatch: ALLOW_DEV_JWT_SECRET=1 (never use in production).'
  );
}

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  
  database: {
    url: process.env.DATABASE_URL || DEV_DATABASE_FALLBACK,
  },
  
  redis: {
    url: process.env.REDIS_URL || DEV_REDIS_FALLBACK,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || DEV_JWT_FALLBACK,
    // 30 days, matching the auth cookie — a token that dies before its cookie
    // made every save/settings call 401 and silently orphaned player progress.
    expiresIn: '30d',
  },

  // Production must run with a PINNED JWT_SECRET in the service env so every
  // restart and deploy mints/verifies tokens with the same secret — otherwise a
  // process started outside the service (or an env drift) orphans every live
  // session the moment it is replaced. The fallback below is dev-only.
  // See plans/RELEASES.md → "Deploy runbook" for the pin procedure.
  jwtSecretPinned: jwtSecretIsPinned(process.env.JWT_SECRET),
  
  cors: {
    // Allowlisted origins for credentialed cross-origin API calls (v0.18.0
    // hardening). The public URL and the local dev server are always allowed;
    // extend via CORS_ORIGIN as a comma-separated list in the service env.
    origins: Array.from(new Set([
      ...(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      'https://dispatch-hq.onrender.com',
      'http://localhost:3000',
    ])),
  },
  // Legacy single-origin alias (index.ts dev entry); keep pointing at the first
  // allowlisted origin so both entrypoints agree.
  get corsOrigin(): string { return this.cors.origins[0] ?? ''; },

  // Payments (v0.31.0) — membership + coin-pack storefront. Defaults to the
  // manual provider (checkout creates a pending order for founder fulfillment)
  // so the store is never a dead end before Stripe keys land; set
  // PAYMENT_PROVIDER=stripe + the two keys to go live.
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || 'manual') === 'stripe' ? 'stripe' as const : 'manual' as const,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    // Public origin used in Stripe checkout success/cancel URLs.
    baseUrl: process.env.PUBLIC_BASE_URL || 'https://dispatch-hq.onrender.com',
  },

  // Emails granted access to the admin dashboard. The founder email is ALWAYS
  // granted (union with any ADMIN_EMAILS env list) so the owner can never be
  // locked out of the Admin Console by a misconfigured env var.
  founderEmail: 'deandrewh26@gmail.com',

  // Guest auto-prune (v0.22.x): disposable guest accounts (guest_xxx@…) older
  // than 30 days with no saves are deleted daily. Set PRUNE_GUESTS=0 to
  // disable; PRUNE_GUEST_MAX_AGE_DAYS and PRUNE_GUEST_INTERVAL_HOURS tune it.
  pruneGuests: {
    enabled: process.env.PRUNE_GUESTS !== '0',
    maxAgeDays: parseInt(process.env.PRUNE_GUEST_MAX_AGE_DAYS || '30', 10),
    intervalHours: parseInt(process.env.PRUNE_GUEST_INTERVAL_HOURS || '24', 10),
  },
  adminEmails: Array.from(new Set([
    ...(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    'deandrewh26@gmail.com',
  ])),
};

// Surface secret drift the moment the server starts: an unpinned JWT_SECRET
// means tokens depend on a dev fallback and any restart outside the service
// env can orphan live sessions (the v0.17.5 incident). Boot fails loudly now
// (v0.22.18) so a misconfigured local run dies at startup instead of minting
// publicly-signed tokens. Tests (NODE_ENV=test) and an explicit local escape
// hatch (ALLOW_DEV_JWT_SECRET=1) are the only bypasses.
assertJwtPinned(config.jwtSecretPinned, {
  isTest: process.env.NODE_ENV === 'test',
  allowDev: process.env.ALLOW_DEV_JWT_SECRET === '1',
});

// Same treatment for the data stores (v0.22.19): a deploy that boots without
// a pinned DATABASE_URL silently connects to the local-dev fallback — the
// exact "wrong database" class that used to surface at runtime instead of
// startup. DATABASE_URL is a HARD STOP (data integrity: the wrong DB is
// corruption). REDIS_URL is a LOUD WARNING, not a stop: Redis pub/sub
// deliberately degrades to in-memory fanout when absent (single-instance
// mode), so a missing Redis must not brick a legitimately single-instance
// deployment — but it must be loud about it. Both mirror the JWT bypasses:
// NODE_ENV=test (vitest boots config directly) and the explicit local escape
// hatches ALLOW_DEV_DATABASE_URL=1 / ALLOW_DEV_REDIS_URL=1.
assertDatabaseUrlPinned(databaseUrlIsPinned(config.database.url), {
  isTest: process.env.NODE_ENV === 'test',
  allowDev: process.env.ALLOW_DEV_DATABASE_URL === '1',
});
assertRedisUrlPinned(redisUrlIsPinned(config.redis.url), {
  isTest: process.env.NODE_ENV === 'test',
  allowDev: process.env.ALLOW_DEV_REDIS_URL === '1',
});

/**
 * Boot-time guard for DATABASE_URL (v0.22.19, mirroring assertJwtPinned): an
 * unset/empty DATABASE_URL — or one still holding the literal dev fallback —
 * is a hard stop at startup. The fallback's credentials are committed in this
 * file, so a server that boots against it is either a local dev box or a
 * misconfigured deploy pointing at the wrong (dev) database. Refuse loudly so
 * a misconfigured deploy dies at boot instead of connecting to the wrong DB.
 * Tests (NODE_ENV=test) bypass; local dev can explicitly opt in with
 * ALLOW_DEV_DATABASE_URL=1 (never in production).
 */
export function assertDatabaseUrlPinned(
  pinned: boolean,
  opts: { isTest?: boolean; allowDev?: boolean } = {},
): void {
  if (pinned) return;
  if (opts.isTest || opts.allowDev) return;
  throw new Error(
    '[dispatch-hq] FATAL: DATABASE_URL is missing, empty, or still the local-dev fallback — refusing to start. ' +
    'A deploy without a pinned DATABASE_URL silently boots against the dev database ' +
    '(' + DEV_DATABASE_FALLBACK + '). ' +
    'Set a real DATABASE_URL in the service env (see plans/RELEASES.md runbook §0a2). ' +
    'Local-only escape hatch: ALLOW_DEV_DATABASE_URL=1 (never use in production).'
  );
}

/**
 * Boot-time guard for REDIS_URL (v0.22.19). Deliberately a LOUD WARNING, not a
 * throw: Redis pub/sub degrades to in-memory fanout when absent (single-instance
 * mode is a supported deployment), so a missing Redis must not refuse to boot —
 * but it must be impossible to miss. Returns whether the URL is pinned, so
 * tests can assert the warning fired.
 */
export function assertRedisUrlPinned(
  pinned: boolean,
  opts: { isTest?: boolean; allowDev?: boolean } = {},
): boolean {
  if (pinned) return true;
  if (opts.isTest || opts.allowDev) return false;
  console.error(
    '[dispatch-hq] WARNING: REDIS_URL is missing, empty, or still the local-dev fallback ' +
    '(' + DEV_REDIS_FALLBACK + ') — Redis pub/sub will run IN-MEMORY (single-instance mode). ' +
    'Cross-instance features (unit positions, alliance chat clustering, viewport relay) ' +
    'will not fan out across instances. This is a deliberate degradation, not a crash; ' +
    'set a real REDIS_URL to enable cluster-wide sync, or silence this warning with ' +
    'ALLOW_DEV_REDIS_URL=1 (local dev only).'
  );
  return false;
}

/**
 * Pure gate for admin-route access. Case-insensitive. The founder email is
 * always allowed; anything in ADMIN_EMAILS is allowed; everything else is
 * denied. Kept as a pure function so the route middleware and the unit test
 * exercise exactly the same logic.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return config.adminEmails.includes(normalized);
}

/**
 * Gate for alliance features (create/join). Alliances are locked until the
 * player reaches Level {@link ALLIANCE_MIN_LEVEL} — except the founder, who
 * can always access them. Pure so route middleware and unit tests exercise
 * identical logic. The level constant lives in @dispatch-hq/shared so the
 * client and server share one source of truth.
 */
export function canAccessAlliances(email: string | null | undefined, level: number): boolean {
  if (isAdminEmail(email)) return true;
  return typeof level === 'number' && level >= ALLIANCE_MIN_LEVEL;
}
