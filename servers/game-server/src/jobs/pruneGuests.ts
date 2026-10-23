// ============================================
// Dispatch HQ — Guest Auto-Prune Job
// ============================================
// Background maintenance: disposable guest accounts (guest_<hex>@dispatchhq.game)
// accumulate in the DB (80+ at one point) because guests never log in again.
// This job deletes guests that are BOTH:
//   1. older than the max age (30 days, measured from lastActive so recently
//      active guests — even save-less ones — are never touched), AND
//   2. have zero save rows (the player never made progress worth keeping).
//
// Real accounts are never candidates: the email pattern is exact, and the
// founder email is the opposite pattern entirely. The delete is FK-safe — every
// child row referencing the player is removed first, inside one transaction, in
// dependency order (children of children before parents).

import { and, eq, inArray, lt, not, exists, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  players, playerSaves, playerSettings, playerStats, playerAchievements,
  stations, units, chatMessages, chatMessageReceipts,
  alliances, allianceMembers, allianceJoinRequests,
  promoCodes, promoRedemptions, bugReports, guestUpgradeAudit,
  seasonalContestEntries, seasonalContests,
} from '../db/schema';

/** Default max age: 30 days. */
export const GUEST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Exact guest-email shape (matches auth.ts's `guest_` prefix rule for the
 * accounts the server actually creates — `guest_<hex>@dispatchhq.game`).
 * Kept as a regex so the pure logic is unit-testable without a DB.
 */
export const GUEST_EMAIL_RE = /^guest_[0-9a-f]+@dispatchhq\.game$/i;

/** SQL LIKE pattern mirroring GUEST_EMAIL_RE (underscore escaped = literal). */
export const GUEST_EMAIL_LIKE = sql`${players.email} LIKE 'guest\\_%@dispatchhq.game'`;

export function isGuestEmail(email: string): boolean {
  return GUEST_EMAIL_RE.test(email);
}

/** Pure prune predicate: no saves AND last activity older than maxAgeMs. */
export function isPruneCandidate(opts: {
  lastActive: Date;
  hasSaves: boolean;
  now?: Date;
  maxAgeMs?: number;
}): boolean {
  const now = opts.now ?? new Date();
  const maxAgeMs = opts.maxAgeMs ?? GUEST_MAX_AGE_MS;
  return !opts.hasSaves && now.getTime() - opts.lastActive.getTime() >= maxAgeMs;
}

export interface PruneResult {
  scanned: number;
  pruned: number;
}

/**
 * Find + delete stale guests. Runs one transaction; a failure anywhere rolls
 * the whole batch back, so a half-pruned account can never be left behind.
 */
export async function pruneGuestAccounts(now: Date = new Date(), maxAgeMs: number = GUEST_MAX_AGE_MS): Promise<PruneResult> {
  const cutoff = new Date(now.getTime() - maxAgeMs);

  const candidates = await db
    .select({ id: players.id, username: players.username, email: players.email, lastActive: players.lastActive })
    .from(players)
    .where(and(
      GUEST_EMAIL_LIKE,
      lt(players.lastActive, cutoff),
      // "No saves" — a guest with any save row is kept, period.
      not(exists(
        db.select({ id: playerSaves.id }).from(playerSaves).where(eq(playerSaves.playerId, players.id)),
      )),
    ));

  if (candidates.length === 0) return { scanned: 0, pruned: 0 };

  await db.transaction(async (tx) => {
    for (const g of candidates) {
      // Receipts referencing this guest as a reader (covers receipts the guest
      // wrote on OTHER messages too, not just their own).
      await tx.delete(chatMessageReceipts).where(eq(chatMessageReceipts.readerId, g.id));
      // Receipts on messages this guest sent (messageId → chatMessages).
      const guestMessages = tx.select({ id: chatMessages.id }).from(chatMessages).where(eq(chatMessages.senderId, g.id));
      await tx.delete(chatMessageReceipts).where(inArray(chatMessageReceipts.messageId, guestMessages));
      await tx.delete(chatMessages).where(eq(chatMessages.senderId, g.id));
      // Units before stations (units.stationId → stations).
      await tx.delete(units).where(eq(units.ownerId, g.id));
      await tx.delete(stations).where(eq(stations.ownerId, g.id));
      await tx.delete(playerAchievements).where(eq(playerAchievements.playerId, g.id));
      await tx.delete(playerStats).where(eq(playerStats.playerId, g.id));
      await tx.delete(playerSettings).where(eq(playerSettings.playerId, g.id));
      await tx.delete(playerSaves).where(eq(playerSaves.playerId, g.id));
      await tx.delete(bugReports).where(eq(bugReports.playerId, g.id));
      // Alliance memberships + join requests (both player-side and the ones
      // aimed at alliances this guest leads).
      await tx.delete(allianceMembers).where(eq(allianceMembers.playerId, g.id));
      await tx.delete(allianceJoinRequests).where(eq(allianceJoinRequests.playerId, g.id));
      const ledAlliances = tx.select({ id: alliances.id }).from(alliances).where(eq(alliances.leaderId, g.id));
      await tx.delete(allianceMembers).where(inArray(allianceMembers.allianceId, ledAlliances));
      await tx.delete(allianceJoinRequests).where(inArray(allianceJoinRequests.allianceId, ledAlliances));
      await tx.delete(alliances).where(eq(alliances.leaderId, g.id));
      // Promo redemptions by this guest, plus codes they created (and the
      // redemptions on those codes).
      await tx.delete(promoRedemptions).where(eq(promoRedemptions.playerId, g.id));
      const guestCodes = tx.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.createdBy, g.id));
      await tx.delete(promoRedemptions).where(inArray(promoRedemptions.promoId, guestCodes));
      await tx.delete(promoCodes).where(eq(promoCodes.createdBy, g.id));
      await tx.delete(seasonalContestEntries).where(eq(seasonalContestEntries.playerId, g.id));
      // Contest winner pointer: null it rather than deleting the event record.
      await tx.update(seasonalContests).set({ winnerId: null }).where(eq(seasonalContests.winnerId, g.id));
      // Upgrade audit rows pointing AT this guest as the old identity. The
      // account side stays (those are real accounts); the pruned guest's trail
      // goes with them or the FK blocks the delete.
      await tx.delete(guestUpgradeAudit).where(eq(guestUpgradeAudit.guestId, g.id));
      // Finally the shell itself.
      await tx.delete(players).where(eq(players.id, g.id));
    }
  });

  return { scanned: candidates.length, pruned: candidates.length };
}

/**
 * Start the daily prune. First run happens after `firstRunDelayMs` (default
 * 10 min) so startup isn't competing with the DB warm-up; both timers are
 * unref'd so they never keep the process alive on their own.
 *
 * Returns a stop function (used by tests / graceful shutdown).
 */
export function startGuestPruneJob(opts?: {
  intervalMs?: number;
  firstRunDelayMs?: number;
  enabled?: boolean;
  maxAgeMs?: number;
}): () => void {
  if (opts?.enabled === false) return () => {};
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  const firstRunDelayMs = opts?.firstRunDelayMs ?? 10 * 60 * 1000;
  const maxAgeMs = opts?.maxAgeMs ?? GUEST_MAX_AGE_MS;

  const run = async () => {
    try {
      const result = await pruneGuestAccounts(new Date(), maxAgeMs);
      console.log(
        `[prune-guests] ${result.pruned} stale guest account(s) pruned (${result.scanned} scanned)`,
      );
    } catch (err) {
      // Never crash the server over housekeeping — log and move on.
      console.error('[prune-guests] run failed:', err);
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
