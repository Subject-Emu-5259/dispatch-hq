// ============================================
// Dispatch HQ — Premium-Expiry Sweep Job (v0.32.0)
// ============================================
// Membership is authoritative off `premium_expires_at` (see lib/shop.ts
// `premiumActive`); `is_premium` is the fast client-facing flag. Read paths
// already derive the flag from the timestamp at read time, but the stored
// boolean still needs hygiene: a member whose window lapses must stop showing
// ✦ premium everywhere, and a renewal must re-light the flag. This daily sweep
// reconciles the two in both directions so the flag is never wrong even if a
// read path (or a legacy row) was touched before the read-time fix shipped.

import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db';
import { players } from '../db/schema';
import { premiumActive } from '../lib/shop';

/** One day. */
export const PREMIUM_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface PremiumFlagRow {
  isPremium: boolean;
  premiumExpiresAt?: Date | string | null;
}

/**
 * True when the stored `isPremium` boolean disagrees with the authoritative
 * `premiumExpiresAt` window. Pure so the sweep's correctness is unit-testable
 * without a DB. `now` is injected for testability (defaults to wall clock).
 */
export function premiumFlagStale(p: PremiumFlagRow, now?: number): boolean {
  return p.isPremium !== premiumActive(p, now);
}

export interface PremiumSweepResult {
  /** Flags flipped OFF because the window had lapsed (or was never set). */
  deactivated: number;
  /** Flags flipped ON because the window is actually still open. */
  reactivated: number;
}

/**
 * Reconcile every player's `is_premium` flag against `premium_expires_at`.
 * Runs as a single statement pair (not a per-row loop) so it is cheap at scale;
 * a partial failure on either side is safe to retry next cycle since both
 * updates are idempotent.
 */
export async function sweepExpiredPremiums(now: Date = new Date()): Promise<PremiumSweepResult> {
  const deactivated = await db
    .update(players)
    .set({ isPremium: false })
    .where(and(
      eq(players.isPremium, true),
      or(isNull(players.premiumExpiresAt), lte(players.premiumExpiresAt, now)),
    ))
    .returning({ id: players.id });

  const reactivated = await db
    .update(players)
    .set({ isPremium: true })
    .where(and(
      eq(players.isPremium, false),
      gt(players.premiumExpiresAt, now),
    ))
    .returning({ id: players.id });

  return {
    deactivated: deactivated.length,
    reactivated: reactivated.length,
  };
}

/**
 * Start the daily premium sweep. First run happens after `firstRunDelayMs`
 * (default 15 min) so startup isn't competing with the DB warm-up; both timers
 * are unref'd so they never keep the process alive on their own.
 *
 * Returns a stop function (used by tests / graceful shutdown).
 */
export function startPremiumExpiryJob(opts?: {
  intervalMs?: number;
  firstRunDelayMs?: number;
  enabled?: boolean;
}): () => void {
  if (opts?.enabled === false) return () => {};
  const intervalMs = opts?.intervalMs ?? PREMIUM_SWEEP_INTERVAL_MS;
  const firstRunDelayMs = opts?.firstRunDelayMs ?? 15 * 60 * 1000;

  const run = async () => {
    try {
      const result = await sweepExpiredPremiums(new Date());
      if (result.deactivated > 0 || result.reactivated > 0) {
        console.log(
          `[premium-expiry] ${result.deactivated} lapsed membership flag(s) cleared, ${result.reactivated} re-activated`,
        );
      }
    } catch (err) {
      // Never crash the server over housekeeping — log and move on.
      console.error('[premium-expiry] run failed:', err);
    }
  };

  const first = setTimeout(() => { void run(); }, firstRunDelayMs);
  first.unref?.();
  const interval = setInterval(() => { void run(); }, intervalMs);
  interval.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
