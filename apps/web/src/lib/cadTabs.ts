// ============================================
// Dispatch HQ — CAD tab helpers (Incoming / Board / Radio / Assistant)
// ============================================
// Pure and dependency-free: the console adapts its own types to the shapes
// below, so this module is unit-testable here and portable to the Reddit
// tree without pulling in game code. Nothing here invents data — every
// output derives from the snapshot passed in.

export type CadSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CadCallStatus = 'ringing' | 'active' | 'dispatched' | 'closed';

export interface IncomingCallLike {
  id: string;
  status: CadCallStatus;
  severity: CadSeverity;
  /** Epoch ms the call rang; 0 when unknown (sorts last, never first). */
  receivedAt: number;
}

const SEVERITY_RANK: Record<CadSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Incoming queue order: ringing calls first (they need an answer), then
 * severity high→low, then newest first. Arrival order alone buried critical
 * calls under newer noise; this is what a dispatcher scans first.
 */
export function sortIncomingCalls<T extends IncomingCallLike>(calls: T[]): T[] {
  return [...calls].sort((a, b) => {
    const ringing = (b.status === 'ringing' ? 1 : 0) - (a.status === 'ringing' ? 1 : 0);
    if (ringing !== 0) return ringing;
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    return (b.receivedAt || 0) - (a.receivedAt || 0);
  });
}

/**
 * Drop accepted/dispatched calls whose mission left the store (completed,
 * archived, or expired). Ringing calls have no mission yet and are always
 * kept; closed calls are removed by their own button, not by this sweep.
 * Before this, dispatched entries lingered until 50 newer calls pushed
 * them out — the queue read as stale history, not live work.
 */
export function pruneStaleCalls<T extends IncomingCallLike>(
  calls: T[],
  missionIds: ReadonlySet<string>,
): T[] {
  return calls.filter((c) => {
    if (c.status !== 'active' && c.status !== 'dispatched') return true;
    return missionIds.has(`m_${c.id}`);
  });
}

/**
 * Board-visible mission statuses. A mission in progress or completing is
 * still on the board — the old filter dropped it the moment it left
 * on_scene, so work vanished mid-completion while its card still knew how
 * to render it.
 */
export const BOARD_VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'dispatching',
  'en_route',
  'on_scene',
  'in_progress',
  'completing',
]);

export function isBoardVisibleMission(status: string): boolean {
  return BOARD_VISIBLE_STATUSES.has(status);
}

// ── Assistant ──────────────────────────────────────────────────────────

export interface AssistantMissionLike {
  name: string;
  priority: CadSeverity;
  difficulty: number;
  /** Seconds remaining; 0 when the mission carries no clock. */
  timeRemaining: number;
}

export interface AssistantSnapshot {
  activeCount: number;
  /** Unassigned, non-CPU missions — the ones a dispatcher can act on. */
  unassigned: AssistantMissionLike[];
  readyUnits: number;
  busyUnits: number;
  stationCount: number;
  /** Units stationed and available to patrol (have a station). */
  patrolReadyUnits: number;
}

function sortAssistantMissions(missions: AssistantMissionLike[]): AssistantMissionLike[] {
  return [...missions].sort(
    (a, b) =>
      SEVERITY_RANK[b.priority] - SEVERITY_RANK[a.priority] ||
      b.difficulty - a.difficulty,
  );
}

export interface AssistantReply {
  text: string;
  /** The reply names an action the console can take right now, if any. */
  action: 'autodispatch' | null;
}

/**
 * Grounded assistant replies: every number and name comes from the snapshot.
 * Nothing is suggested without live state behind it — an empty queue answers
 * "all assigned", never a fabricated recommendation. The old handler listed
 * triage in raw array order while calling it "top priority", and pointed
 * dispatchers at a "Call Queue tab" that does not hold Auto-Dispatch (it
 * lives on the Board tab); both are fixed here.
 */
export function assistantReply(query: string, snap: AssistantSnapshot): AssistantReply {
  const q = query.toLowerCase();
  const triage = sortAssistantMissions(snap.unassigned);
  if (q.includes('status') || q.includes('situation') || q.includes('brief')) {
    return {
      text:
        `Status report:\n` +
        `• ${snap.activeCount} active missions, ${snap.unassigned.length} need units\n` +
        `• ${snap.readyUnits} ready units, ${snap.busyUnits} busy\n` +
        `• ${snap.stationCount} stations operational`,
      action: null,
    };
  }
  if (q.includes('triage') || q.includes('priority')) {
    return {
      text:
        triage.length === 0
          ? 'All missions are assigned.'
          : `Top priority unassigned:\n${triage
              .slice(0, 3)
              .map((m, i) => `${i + 1}. ${m.name} — ${m.priority} priority, difficulty ${m.difficulty}`)
              .join('\n')}`,
      action: null,
    };
  }
  if (q.includes('dispatch') || q.includes('send')) {
    return {
      text:
        snap.unassigned.length === 0
          ? 'No unassigned missions to dispatch.'
          : `I recommend dispatching units to ${snap.unassigned.length} mission(s). Use Auto-Dispatch on the Board tab, or tap Auto-Dispatch now below.`,
      action: snap.unassigned.length > 0 ? 'autodispatch' : null,
    };
  }
  if (q.includes('patrol')) {
    return {
      text:
        snap.patrolReadyUnits === 0
          ? 'No units available to patrol.'
          : `${snap.patrolReadyUnits} unit(s) ready to patrol. Open the Unit Roster tab.`,
      action: null,
    };
  }
  if (q.includes('critical')) {
    const critical = triage.filter((m) => m.priority === 'critical');
    return {
      text:
        critical.length === 0
          ? 'No critical missions waiting for units right now.'
          : `Critical missions needing units:\n${critical
              .map((m) => `• ${m.name} — difficulty ${m.difficulty}`)
              .join('\n')}`,
      action: null,
    };
  }
  if (q.includes('expir') || q.includes('urgent') || q.includes('soon')) {
    const expiring = [...snap.unassigned]
      .filter((m) => m.timeRemaining > 0 && m.timeRemaining < 300)
      .sort((a, b) => a.timeRemaining - b.timeRemaining);
    return {
      text:
        expiring.length === 0
          ? 'Nothing unassigned expires in the next 5 minutes.'
          : `Expiring soon (unassigned):\n${expiring
              .map((m) => `• ${m.name} — ${Math.ceil(m.timeRemaining / 60)} min left`)
              .join('\n')}`,
      action: null,
    };
  }
  if (q.includes('unit')) {
    return {
      text: `${snap.readyUnits} ready units, ${snap.busyUnits} busy.`,
      action: null,
    };
  }
  if (q.includes('station')) {
    return {
      text: `${snap.stationCount} stations operational.`,
      action: null,
    };
  }
  return {
    text: 'I can help with status, triage, dispatch recommendations, patrol planning, critical missions, and expiring missions. What do you need?',
    action: null,
  };
}

/**
 * Proactive dispatch brief — the same live snapshot, no questions asked.
 * Names only missions that are actually waiting; an empty queue says so.
 */
export function assistantBrief(snap: AssistantSnapshot): string {
  const triage = sortAssistantMissions(snap.unassigned);
  const critical = triage.filter((m) => m.priority === 'critical');
  const expiring = [...snap.unassigned]
    .filter((m) => m.timeRemaining > 0 && m.timeRemaining < 300)
    .sort((a, b) => a.timeRemaining - b.timeRemaining);
  const lines = [
    `Dispatch brief — live state:`,
    `• ${snap.activeCount} active missions, ${snap.unassigned.length} need units`,
    `• Critical waiting: ${
      critical.length === 0 ? 'none' : critical.map((m) => m.name).join(', ')
    }`,
    `• Expiring soon: ${
      expiring.length === 0
        ? 'none'
        : expiring.map((m) => `${m.name} (${Math.ceil(m.timeRemaining / 60)} min)`).join(', ')
    }`,
    `• ${snap.readyUnits} ready units, ${snap.busyUnits} busy, ${snap.stationCount} stations`,
  ];
  return lines.join('\n');
}
