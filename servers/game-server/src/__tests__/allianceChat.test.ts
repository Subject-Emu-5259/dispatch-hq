import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Redis pub/sub so the lifecycle (subscribe/unsubscribe) and the
// cluster publish path can be asserted without a live Redis.
const ALLIANCE_PREFIX = 'dhq:alliance:';
vi.mock('../lib/pubsub', () => {
  const channel = (allianceId: string) => `${ALLIANCE_PREFIX}${allianceId}`;
  return {
    isPubSubReady: vi.fn(() => false),
    publishBroadcast: vi.fn(),
    publishAllianceMessage: vi.fn(),
    subscribeAllianceChannel: vi.fn(),
    unsubscribeAllianceChannel: vi.fn(),
    allianceChannel: vi.fn(channel),
    allianceIdFromChannel: vi.fn((ch: string) =>
      ch.startsWith(ALLIANCE_PREFIX) ? ch.slice(ALLIANCE_PREFIX.length) : null,
    ),
    publishViewport: vi.fn(),
    deleteViewport: vi.fn(),
    fetchViewport: vi.fn(),
  };
});

import { connectionManager, handleClusterMessage } from '../websocket/connectionManager';
import {
  isPubSubReady,
  publishAllianceMessage,
  subscribeAllianceChannel,
  unsubscribeAllianceChannel,
} from '../lib/pubsub';

/** Minimal fake WSContext that records JSON payloads sent through it. */
function fakeWs() {
  const sent: string[] = [];
  const ws = {
    send: (s: string) => { sent.push(s); },
    close: () => {},
  };
  return { ws, sent };
}

const chatMessage = (id: string, sender: string, text: string, allianceId: string) => ({
  type: 'alliance_chat',
  id,
  sender,
  text,
  allianceId,
  timestamp: new Date().toISOString(),
});

const tracked: string[] = [];

function connect(playerId: string, allianceId: string | null) {
  const fake = fakeWs();
  connectionManager.addConnection(playerId, fake.ws as any, { username: playerId, allianceId });
  tracked.push(playerId);
  return fake;
}

describe('alliance chat clustering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps persistent return values, so re-assert the default:
    // without this, the Redis-available test would leak into later tests.
    vi.mocked(isPubSubReady).mockReturnValue(false);
  });

  afterEach(() => {
    for (const pid of tracked.splice(0)) connectionManager.removeConnection(pid);
  });

  describe('local fallback (Redis unavailable)', () => {
    it('delivers only to members of the target alliance, sender included', () => {
      const memberA = connect('p-a', 'all1');
      const memberB = connect('p-b', 'all1');
      const otherAlliance = connect('p-x', 'all2');
      const noAlliance = connect('p-none', null);

      connectionManager.broadcastToAlliance('all1', chatMessage('m1', 'A', 'hello squad', 'all1') as any);

      expect(vi.mocked(publishAllianceMessage)).not.toHaveBeenCalled();
      expect(memberA.sent).toHaveLength(1); // echo to the sender
      expect(memberB.sent).toHaveLength(1);
      expect(otherAlliance.sent).toHaveLength(0); // different alliance
      expect(noAlliance.sent).toHaveLength(0);    // not in any alliance

      const delivered = JSON.parse(memberA.sent[0]);
      expect(delivered).toMatchObject({ type: 'alliance_chat', id: 'm1', text: 'hello squad' });
    });

    it('stops delivering to a player whose alliance meta was cleared', () => {
      const memberA = connect('p-a', 'all1');
      const memberB = connect('p-b', 'all1');

      connectionManager.setAlliance('p-b', null);
      connectionManager.broadcastToAlliance('all1', chatMessage('m2', 'A', 'bye', 'all1') as any);

      expect(memberA.sent).toHaveLength(1);
      expect(memberB.sent).toHaveLength(0); // no new message after leaving
    });
  });

  describe('cluster publish path (Redis available)', () => {
    it('broadcastToAlliance publishes to the per-alliance channel', () => {
      vi.mocked(isPubSubReady).mockReturnValue(true);
      connect('p-a', 'all1');

      connectionManager.broadcastToAlliance('all1', chatMessage('m1', 'A', 'hi', 'all1') as any);

      expect(publishAllianceMessage).toHaveBeenCalledTimes(1);
      const [channel, msg] = vi.mocked(publishAllianceMessage).mock.calls[0];
      expect(channel).toBe('all1');
      expect(msg).toMatchObject({ type: 'alliance_chat', id: 'm1', text: 'hi' });
    });
  });

  describe('cluster routing (handleClusterMessage)', () => {
    it('routes per-alliance channels only to that alliance\'s local members', () => {
      const memberA = connect('p-a', 'all1');
      const memberB = connect('p-b', 'all1');
      const otherAlliance = connect('p-x', 'all2');

      handleClusterMessage('dhq:alliance:all1', JSON.stringify(chatMessage('m3', 'C', 'from another instance', 'all1')));

      expect(memberA.sent).toHaveLength(1);
      expect(memberB.sent).toHaveLength(1);
      expect(otherAlliance.sent).toHaveLength(0);
    });

    it('routes the global broadcast channel to every local socket', () => {
      const a = connect('p-a', 'all1');
      const b = connect('p-b', null);

      handleClusterMessage('dhq:broadcast', JSON.stringify({ type: 'state_delta', changes: [], serverTime: Date.now() }));

      expect(a.sent).toHaveLength(1);
      expect(b.sent).toHaveLength(1);
    });
  });

  describe('subscription lifecycle', () => {
    it('counts exactly once when setAlliance precedes addConnection (auth flow)', () => {
      // Mirrors wsServer onOpen: setAlliance runs before addConnection, so the
      // player has no local meta yet and must not be counted twice.
      connectionManager.setAlliance('p-a', 'all1');
      connectionManager.addConnection('p-a', fakeWs().ws as any, { username: 'A', allianceId: 'all1' });
      tracked.push('p-a');

      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(1);
      expect(subscribeAllianceChannel).toHaveBeenCalledWith('all1');

      // Reconnecting with the same alliance is idempotent — no churn.
      connectionManager.setAlliance('p-a', 'all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(1);
      expect(unsubscribeAllianceChannel).not.toHaveBeenCalled();
    });

    it('subscribes on first local member, unsubscribes when the last leaves', () => {
      connect('p-a', 'all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledWith('all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(1);

      // A second member does not re-subscribe (count is already > 0).
      connect('p-b', 'all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(1);

      connectionManager.removeConnection('p-a');
      connectionManager.removeConnection('p-b');
      expect(unsubscribeAllianceChannel).toHaveBeenCalledWith('all1');
      expect(unsubscribeAllianceChannel).toHaveBeenCalledTimes(1);
    });

    it('swaps subscriptions when a member changes alliances', () => {
      connect('p-a', 'all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledWith('all1');

      connectionManager.setAlliance('p-a', 'all2');
      expect(unsubscribeAllianceChannel).toHaveBeenCalledWith('all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledWith('all2');

      // Idempotent: same alliance again is a no-op, no channel churn.
      connectionManager.setAlliance('p-a', 'all2');
      expect(unsubscribeAllianceChannel).toHaveBeenCalledTimes(1);
      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes when an alliance is dissolved for its last local member', () => {
      connect('p-a', 'all1');
      connect('p-b', 'all1');
      expect(subscribeAllianceChannel).toHaveBeenCalledTimes(1);

      connectionManager.clearAlliance('all1');
      expect(unsubscribeAllianceChannel).toHaveBeenCalledWith('all1');
      // Both members had their meta nulled.
      expect(connectionManager.getAlliance('p-a')).toBeNull();
      expect(connectionManager.getAlliance('p-b')).toBeNull();
    });
  });
});
