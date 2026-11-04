import { describe, expect, it } from 'vitest';
import {
  assistantBrief,
  assistantReply,
  isBoardVisibleMission,
  pruneStaleCalls,
  sortIncomingCalls,
  type AssistantSnapshot,
  type IncomingCallLike,
} from './cadTabs';

const call = (
  id: string,
  status: IncomingCallLike['status'],
  severity: IncomingCallLike['severity'],
  receivedAt: number,
): IncomingCallLike => ({ id, status, severity, receivedAt });

describe('sortIncomingCalls', () => {
  it('rings first, then severity high→low, then newest first', () => {
    const sorted = sortIncomingCalls([
      call('old-low', 'dispatched', 'low', 100),
      call('new-medium', 'ringing', 'medium', 300),
      call('old-critical', 'ringing', 'critical', 100),
      call('new-critical', 'ringing', 'critical', 200),
      call('active-high', 'active', 'high', 400),
    ]).map((c) => c.id);
    expect(sorted).toEqual([
      'new-critical',
      'old-critical',
      'new-medium',
      'active-high',
      'old-low',
    ]);
  });

  it('never mutates the input order', () => {
    const input = [call('a', 'ringing', 'low', 1), call('b', 'ringing', 'critical', 2)];
    sortIncomingCalls(input);
    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('pruneStaleCalls', () => {
  it('drops accepted/dispatched calls whose mission left the store', () => {
    const kept = pruneStaleCalls(
      [
        call('ringing-1', 'ringing', 'high', 1),
        call('live', 'dispatched', 'high', 2),
        call('gone', 'dispatched', 'high', 3),
        call('archived', 'active', 'medium', 4),
      ],
      new Set(['m_live']),
    ).map((c) => c.id);
    expect(kept).toEqual(['ringing-1', 'live']);
  });
});

describe('isBoardVisibleMission', () => {
  it('keeps in_progress and completing on the board', () => {
    expect(isBoardVisibleMission('in_progress')).toBe(true);
    expect(isBoardVisibleMission('completing')).toBe(true);
    expect(isBoardVisibleMission('en_route')).toBe(true);
    expect(isBoardVisibleMission('completed')).toBe(false);
  });
});

const snap: AssistantSnapshot = {
  activeCount: 4,
  unassigned: [
    { name: 'Noise Complaint', priority: 'low', difficulty: 20, timeRemaining: 600 },
    { name: 'Structure Fire', priority: 'critical', difficulty: 80, timeRemaining: 120 },
    { name: 'Robbery in Progress', priority: 'critical', difficulty: 90, timeRemaining: 400 },
    { name: 'Injury Accident', priority: 'high', difficulty: 60, timeRemaining: 240 },
  ],
  readyUnits: 5,
  busyUnits: 2,
  stationCount: 3,
  patrolReadyUnits: 2,
};

describe('assistantReply', () => {
  it('lists triage in priority order, not array order', () => {
    const reply = assistantReply('triage', snap);
    expect(reply.text).toContain('1. Robbery in Progress');
    expect(reply.text).toContain('2. Structure Fire');
    expect(reply.text).toContain('3. Injury Accident');
  });

  it('points dispatch at the Board tab and offers the action', () => {
    const reply = assistantReply('dispatch units', snap);
    expect(reply.text).toContain('Board tab');
    expect(reply.text).not.toContain('Call Queue');
    expect(reply.action).toBe('autodispatch');
  });

  it('answers empty queues honestly, with no action', () => {
    const empty: AssistantSnapshot = { ...snap, activeCount: 0, unassigned: [] };
    expect(assistantReply('triage', empty).text).toContain('All missions are assigned');
    const dispatch = assistantReply('dispatch', empty);
    expect(dispatch.text).toContain('No unassigned missions');
    expect(dispatch.action).toBeNull();
  });

  it('names critical and expiring missions from live state only', () => {
    expect(assistantReply('critical', snap).text).toContain('Structure Fire');
    const expiring = assistantReply('expiring soon', snap);
    expect(expiring.text).toContain('Structure Fire');
    expect(expiring.text).toContain('Injury Accident');
    expect(expiring.text).not.toContain('Robbery in Progress');
  });
});

describe('assistantBrief', () => {
  it('names what is actually waiting and says none when nothing is', () => {
    const brief = assistantBrief(snap);
    expect(brief).toContain('Critical waiting: Robbery in Progress, Structure Fire');
    expect(brief).toContain('Structure Fire (2 min)');
    expect(brief).toContain('4 active missions, 4 need units');
    const calm = assistantBrief({ ...snap, activeCount: 0, unassigned: [] });
    expect(calm).toContain('Critical waiting: none');
    expect(calm).toContain('Expiring soon: none');
  });
});
