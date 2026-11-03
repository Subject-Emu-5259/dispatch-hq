// ============================================
// Dispatch HQ — Radio Mission-State Lines (Batch 3d)
// ============================================
// Text-first deepening of RadioComms: procedural flavor lines that fire on
// MISSION-state transitions (the old panel only reacted to unit status).
// No new audio system — the existing radio beep path is untouched; these
// lines ride the same transcript the unit-status lines already use.

import type { MissionStatus } from '@dispatch-hq/shared';

/**
 * Flavor line for a mission moving prev -> next, or null when the
 * transition is not a radio moment (e.g. generated -> active bookkeeping).
 * First-seen missions (prev null) get the line for their current state.
 */
export function missionStateLine(
  prev: MissionStatus | null,
  next: MissionStatus,
  missionName: string,
): string | null {
  if (prev === next) return null;
  switch (next) {
    case 'dispatching':
    case 'en_route':
      return `Units rolling to ${missionName} — ETA on the board.`;
    case 'on_scene':
      return `First unit on scene at ${missionName} — size-up in progress.`;
    case 'in_progress':
      return `Working the scene at ${missionName} — crews committed.`;
    case 'completing':
      return `Wrapping up at ${missionName} — clearing shortly.`;
    case 'completed':
      return `All clear on ${missionName} — scene secured, units returning.`;
    case 'failed':
    case 'expired':
      return `${missionName} closed without a full clear — units standing by for the next call.`;
    default:
      return null;
  }
}
