import { describe, it, expect } from 'vitest';
import { isGuestEmail, UPGRADE_REKEY } from '../routes/auth';
import { guestUpgradeAudit } from '../db/schema';

/** Every column in UPGRADE_REKEY, in the order the merge loop applies them. */
function rekeyColumns(): string[] {
  return UPGRADE_REKEY.map((t) => t.column.name);
}

describe('guest upgrade helpers', () => {
  it('recognizes synthetic guest emails (guest_<hex>@dispatchhq.game)', () => {
    expect(isGuestEmail('guest_ab12cd34@dispatchhq.game')).toBe(true);
    expect(isGuestEmail('Guest_AB12CD34@dispatchhq.game')).toBe(true);
    expect(isGuestEmail('deandrewh26@gmail.com')).toBe(false);
    expect(isGuestEmail('guest@example.com')).toBe(false);
    expect(isGuestEmail('')).toBe(false);
  });

  it('re-keys every players-referencing column so the merged account inherits all data', () => {
    // Canary against schema drift: if a table starts referencing players.id,
    // it must be added to UPGRADE_REKEY in routes/auth.ts (and this list) so
    // the guest's data follows them into their upgraded account.
    const columns = UPGRADE_REKEY.map((t) => t.column.name).sort();
    expect(columns).toEqual([
      'leader_id', // alliances.leaderId
      'owner_id',  // stations.ownerId
      'owner_id',  // units.ownerId
      'player_id', // playerSaves.playerId
      'player_id', // playerSettings.playerId
      'player_id', // playerStats.playerId
      'player_id', // playerAchievements.playerId
      'player_id', // promoRedemptions.playerId
      'player_id', // allianceMembers.playerId
      'player_id', // allianceJoinRequests.playerId
      'player_id', // bugReports.playerId
      'reader_id', // chatMessageReceipts.readerId
      'sender_id', // chatMessages.senderId
    ]);
    expect(UPGRADE_REKEY).toHaveLength(13);
  });

  it('keeps the upgrade audit table OUT of the re-key list (it is the trail)', () => {
    // The audit row records guest → account. If the merge loop re-keyed it,
    // the guest id would be overwritten with the account id and the trail
    // would be destroyed. It must stay immutable — the guest shell row is kept
    // (zeroed), so the guestId FK stays valid forever.
    expect(rekeyColumns()).not.toContain(guestUpgradeAudit.guestId.name);
    expect(rekeyColumns()).not.toContain(guestUpgradeAudit.accountId.name);
  });
});
