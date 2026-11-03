// ============================================
// Dispatch HQ — Live Mutual Aid (Batch 3c)
// ============================================
// Pure rules for the live mutual-aid network (main edition, WS relay).
// The server NEVER moves money for aid: it only validates alliance
// membership + throttles and re-broadcasts. Rewards are applied to the
// local save exactly like every other mission reward (gameplay money is
// client-side; the DB wallet is promos/grants only), so this path cannot
// re-open the Batch 1 (P1-M2) check-then-act holes — there is no server
// balance check, debit, or credit anywhere in it.
//
// Split rule: the requester keeps 60% of the mission reward, the helper
// (or helpers, split evenly) share 40%. Integer credits/XP, remainder
// goes to the requester so the total never exceeds the mission reward.

export const MUTUAL_AID_REQUESTER_SHARE = 0.6;
export const MUTUAL_AID_HELPER_SHARE = 0.4;

export type AidStatus = 'open' | 'accepted' | 'cleared' | 'expired';

export interface AidRequest {
  missionId: string;
  missionName: string;
  city: string;
  requesterId: string;
  requesterName: string;
  helperIds: string[];
  helperNames: string[];
  status: AidStatus;
}

/** Split a mission reward between requester and helpers. Totals never exceed the reward. */
export function splitAidReward(
  creditsReward: number,
  xpReward: number,
  helperCount: number,
): { requester: { credits: number; xp: number }; helpers: { credits: number; xp: number }[] } {
  const helpers = Math.max(0, Math.floor(helperCount));
  if (helpers === 0) {
    return { requester: { credits: creditsReward, xp: xpReward }, helpers: [] };
  }
  const helperCreditsTotal = Math.floor(creditsReward * MUTUAL_AID_HELPER_SHARE);
  const helperXpTotal = Math.floor(xpReward * MUTUAL_AID_HELPER_SHARE);
  const perHelperCredits = Math.floor(helperCreditsTotal / helpers);
  const perHelperXp = Math.floor(helperXpTotal / helpers);
  return {
    // Remainder (from flooring) stays with the requester — total ≤ reward.
    requester: {
      credits: creditsReward - perHelperCredits * helpers,
      xp: xpReward - perHelperXp * helpers,
    },
    helpers: Array.from({ length: helpers }, () => ({ credits: perHelperCredits, xp: perHelperXp })),
  };
}

/** "CLEARED BY <helper>" credit line for the mission card. */
export function clearedByCredit(helperNames: string[]): string {
  if (helperNames.length === 0) return '';
  return `CLEARED BY ${helperNames.join(', ')}`;
}

/** Validate a new aid request. Returns an error string, or null when valid. */
export function validateAidRequest(req: {
  missionId?: string;
  missionName?: string;
  city?: string;
  requesterId?: string;
}): string | null {
  if (!req.missionId?.trim()) return 'missionId is required';
  if (!req.missionName?.trim()) return 'missionName is required';
  if (!req.city?.trim()) return 'city is required';
  if (!req.requesterId?.trim()) return 'requesterId is required';
  return null;
}

/** Accept an open request. Guards: no self-accept, no double-accept, only open requests. */
export function acceptAidRequest(
  req: AidRequest,
  helperId: string,
  helperName: string,
): { request: AidRequest } | { error: string } {
  if (req.status !== 'open') return { error: `Aid request is ${req.status}, not open` };
  if (helperId === req.requesterId) return { error: 'You cannot answer your own aid request' };
  if (req.helperIds.includes(helperId)) return { error: 'You already accepted this aid request' };
  return {
    request: {
      ...req,
      helperIds: [...req.helperIds, helperId],
      helperNames: [...req.helperNames, helperName],
      status: 'accepted',
    },
  };
}

/** Mark an accepted request cleared by one of its helpers. */
export function clearAidRequest(
  req: AidRequest,
  helperName: string,
): { request: AidRequest } | { error: string } {
  if (req.status !== 'accepted') return { error: `Aid request is ${req.status}, not accepted` };
  if (!req.helperNames.includes(helperName)) return { error: 'Only an accepted helper can clear this request' };
  return { request: { ...req, status: 'cleared' } };
}
