// ============================================
// Dispatch HQ — wsClient connection-state mirroring tests
// ============================================
// The floating online chip mirrors the REAL socket state (open/close), not the
// auth_ok message. These tests lock that contract: onConnectionChange fires
// true on open, false on close and disconnect, and unsubscribes cleanly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wsClient } from './wsClient';

// jsdom has no WebSocket implementation — provide a minimal fake so the
// client can actually connect and we can drive open/close events.
class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

let socket: FakeWebSocket;

describe('wsClient connection mirroring', () => {
  beforeEach(() => {
    // A plain function (not an arrow / vi.fn) so `new WebSocket(...)` works —
    // vitest's Mock isn't a constructor when given an arrow implementation.
    (globalThis as any).WebSocket = function (this: unknown, url: string) {
      socket = new FakeWebSocket(url);
      return socket;
    };
  });

  afterEach(() => {
    wsClient.disconnect();
    vi.restoreAllMocks();
  });

  it('notifies the listener with true when the socket opens', () => {
    const listener = vi.fn();
    wsClient.onConnectionChange(listener);

    wsClient.connect();
    socket.onopen?.();

    expect(listener).toHaveBeenCalledWith(true);
  });

  it('notifies the listener with false when the socket closes', () => {
    const listener = vi.fn();
    wsClient.onConnectionChange(listener);

    wsClient.connect();
    socket.onopen?.();
    socket.onclose?.();

    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('notifies the listener with false when fully disconnecting', () => {
    const listener = vi.fn();
    wsClient.onConnectionChange(listener);

    wsClient.connect();
    socket.onopen?.();
    wsClient.disconnect();

    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = wsClient.onConnectionChange(listener);

    wsClient.connect();
    socket.onopen?.();
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    socket.onclose?.();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports the internal connected state accurately', () => {
    wsClient.connect();
    expect(wsClient.isConnected()).toBe(false);

    socket.onopen?.();
    expect(wsClient.isConnected()).toBe(true);

    socket.onclose?.();
    expect(wsClient.isConnected()).toBe(false);
  });
});
