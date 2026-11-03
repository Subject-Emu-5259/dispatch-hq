// ============================================
// Dispatch HQ — Shared-Station Leases (Batch 3c)
// ============================================
// Pure lease rules. Leases sit on top of the Batch 1 (P1-M2) claim path:
// a leased station stays alliance-owned (no ownership transfer), and the
// claim route refuses a station with an active lease, so a lease can never
// be orphaned by a claim. The double-lease race is closed in Postgres by
// a partial unique index (one active lease per station) — the second
// concurrent insert conflicts and the route returns 409; the pure rule
// here (validate + split + expiry) is what the route enforces on top.
//
// Money: creating a lease charges an UPFRONT lease fee from the lessee's
// DB credits into the alliance treasury, in ONE transaction with the
// guarded debit (`credits >= fee`, affected rows as the verdict) — the
// exact Batch 1 pattern. There is no check-then-act balance read.
// Automated distribution of future station revenue is QUEUED behind the
// server mission ledger (no server-verified revenue event exists yet);
// the split rule below is implemented, pure-tested, and ready for it.

export const LEASE_MIN_TERM_DAYS = 1;
export const LEASE_MAX_TERM_DAYS = 30;
export const LEASE_MIN_REVENUE_SHARE_PCT = 0;
export const LEASE_MAX_REVENUE_SHARE_PCT = 50;
/** Upfront fee per lease day, in credits. */
export const LEASE_FEE_PER_DAY = 100;

export type LeaseStatus = 'active' | 'ended' | 'expired';

export function validateLeaseTerms(termDays: number, revenueSharePct: number): string | null {
  if (!Number.isInteger(termDays) || termDays < LEASE_MIN_TERM_DAYS || termDays > LEASE_MAX_TERM_DAYS) {
    return `termDays must be an integer between ${LEASE_MIN_TERM_DAYS} and ${LEASE_MAX_TERM_DAYS}`;
  }
  if (!Number.isInteger(revenueSharePct) || revenueSharePct < LEASE_MIN_REVENUE_SHARE_PCT || revenueSharePct > LEASE_MAX_REVENUE_SHARE_PCT) {
    return `revenueSharePct must be an integer between ${LEASE_MIN_REVENUE_SHARE_PCT} and ${LEASE_MAX_REVENUE_SHARE_PCT}`;
  }
  return null;
}

/** Upfront fee for a term. */
export function leaseFeeFor(termDays: number): number {
  return termDays * LEASE_FEE_PER_DAY;
}

/** End date for a lease starting now (or at `start`). */
export function leaseEndDate(start: Date, termDays: number): Date {
  return new Date(start.getTime() + termDays * 24 * 60 * 60 * 1000);
}

/** Effective status: an 'active' lease past its end is expired (computed on read, never trusted from the row alone). */
export function leaseEffectiveStatus(stored: LeaseStatus, endsAt: Date, now: Date = new Date()): LeaseStatus {
  if (stored === 'active' && now.getTime() >= endsAt.getTime()) return 'expired';
  return stored;
}

/**
 * Split station revenue between the lessee and the alliance treasury.
 * revenueSharePct = the treasury's share; the lessee keeps the rest.
 * Integer credits; flooring remainder goes to the lessee.
 */
export function leaseRevenueSplit(
  revenueCredits: number,
  revenueSharePct: number,
): { lessee: number; treasury: number } {
  const treasury = Math.floor(revenueCredits * (revenueSharePct / 100));
  return { lessee: revenueCredits - treasury, treasury };
}
