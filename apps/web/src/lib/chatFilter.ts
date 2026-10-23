// ============================================
// Dispatch HQ — Public chat filter (v0.22.x)
// ============================================
// The Public Chat feed carries player lines AND system-style broadcasts
// (System, Dispatch, PSA, Notice, Dispatch HQ). The All / Players only /
// HQ only toggle filters the VIEW without ever mutating the feed — hidden
// lines reappear the moment the filter is widened, and unread counting is
// unaffected.

export type ChatLineType = 'system' | 'user' | 'dispatch' | 'psa' | 'notice' | 'message';
export type ChatFilter = 'all' | 'players' | 'hq';

/** Should a chat line with `type` appear under the given filter? */
export function chatLineMatchesFilter(type: ChatLineType, filter: ChatFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'players') return type === 'user';
  // HQ only — any non-player line is a system-style broadcast.
  return type !== 'user';
}
