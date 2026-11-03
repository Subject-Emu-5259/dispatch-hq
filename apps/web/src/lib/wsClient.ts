// ============================================
// Dispatch HQ — WebSocket Client
// ============================================
// Connects to the game server using the HttpOnly auth cookie. Credentials
// are sent automatically by the browser during the handshake, so no token
// management is required on the client.

import {
  enqueueOfflineAction, drainOfflineQueue, dispatchActionEvent,
  ACTION_QUEUED_EVENT, ACTION_FLUSHED_EVENT, ACTION_DROPPED_EVENT,
  type QueuedAction,
} from './batch3e';

type MessageHandler = (message: any) => void;

function getDefaultWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

class WsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private connected = false;
  private shouldReconnect = true;
  // Batch 1 polish: timestamp (ms epoch) of the last connection attempt, so
  // the Online chip can show "last attempt" next to its Reconnect button
  // instead of leaving a stuck Offline state mysterious.
  private lastAttemptAt: number | null = null;
  // Real socket-state listener (v0.22.x): the store's wsConnected flag used to
  // depend on an auth_ok MESSAGE arriving, so a socket that was genuinely up
  // (presence + unit relay working) could still read as "Offline" on the chip.
  // This fires on EVERY socket open/close so the UI mirrors reality.
  private connectionListener: ((connected: boolean) => void) | null = null;
  // Batch 3e offline action queue (feature 19): messages sent while the
  // socket is down queue in memory (FIFO, cap 50, max 3 attempts each)
  // and flush on reconnect instead of failing silently. LIMITS, stated
  // honestly: the queue is in-memory — a reload drops it (saves have the
  // browser mirror; socket actions do not) — and a dropped entry is
  // reported via ACTION_DROPPED_EVENT, never silently swallowed.
  private offlineQueue: QueuedAction[] = [];
  private queueSeq = 0;

  /** Begin a connection. The auth cookie is sent automatically. */
  connect() {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.doConnect();
  }

  private getWsUrl(): string {
    return import.meta.env.VITE_WS_URL || getDefaultWsUrl();
  }

  private doConnect() {
    this.cleanupSocket();
    this.lastAttemptAt = Date.now();
    try {
      this.ws = new WebSocket(this.getWsUrl());
    } catch (e) {
      console.error('WS connect error:', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.connectionListener?.(true);
      // Batch 3e: reconnect flushes the offline action queue (see limits above).
      this.flushOfflineQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const handlers = this.handlers.get(message.type);
        handlers?.forEach((h) => h(message));
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.connectionListener?.(false);
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // Suppressed — onclose handles reconnect sequencing.
    };
  }

  private cleanupSocket() {
    if (this.ws) {
      const prev = this.ws;
      prev.onopen = null;
      prev.onmessage = null;
      prev.onclose = null;
      prev.onerror = null;
      try { prev.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (!this.shouldReconnect) return;
    // Batch 3c (P1-M4): NEVER give up permanently. The old code set
    // shouldReconnect = false after 5 attempts, so a ~30s outage left the
    // chip on gray "Offline" forever until the player left the screen (the
    // connect effect only re-runs on gameScreen/onlineMode/maintenance
    // changes). Backoff still caps at 30s; attempts keep counting so the
    // UI can show how long recovery has been trying, but retries continue
    // indefinitely while the session wants a connection. Only an explicit
    // disconnect() stops them.
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  /** Consecutive failed attempts since the last successful open (0 = connected or never tried). */
  getReconnectAttempts() {
    return this.reconnectAttempts;
  }

  /** Send a message to the server. No-op if the socket isn't open. */
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Batch 3e: send, or queue for the reconnect flush when offline. Returns
   * 'sent' | 'queued' | 'rejected' (queue full — the caller must surface
   * this; the action is NOT silently dropped). Queued entries fire
   * ACTION_QUEUED_EVENT so the offline banner can count them.
   */
  sendOrQueue(message: any, kind: string = 'message'): 'sent' | 'queued' | 'rejected' {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return 'sent';
    }
    const res = enqueueOfflineAction(this.offlineQueue, {
      id: `q-${Date.now()}-${this.queueSeq++}`,
      kind,
      payload: message,
    });
    if (!res.ok) return 'rejected';
    this.offlineQueue = res.queue;
    dispatchActionEvent(ACTION_QUEUED_EVENT);
    return 'queued';
  }

  /** Queued offline actions waiting for a reconnect flush. */
  getQueuedActionCount(): number {
    return this.offlineQueue.length;
  }

  /** Flush the offline queue over the live socket (also runs on open). */
  flushOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const ws = this.ws;
    const result = drainOfflineQueue(this.offlineQueue, (action) => {
      try {
        ws.send(JSON.stringify(action.payload));
        return true;
      } catch {
        return false;
      }
    });
    this.offlineQueue = result.remaining;
    if (result.sent.length > 0) dispatchActionEvent(ACTION_FLUSHED_EVENT);
    if (result.dropped.length > 0) dispatchActionEvent(ACTION_DROPPED_EVENT);
  }

  /** Report a unit's live position for the multiplayer relay (throttled by the caller). */
  sendUnitPosition(unitId: string, lat: number, lng: number, speedKmh: number, heading: number) {
    this.send({ type: 'unit_position', unitId, lat, lng, speedKmh, heading });
  }

  /** Batch 3c — live mutual aid: ask alliance members for help on a mission. */
  sendMutualAidRequest(missionId: string, missionName: string, city: string) {
    this.send({ type: 'mutual_aid_request', missionId, missionName, city });
  }

  /** Batch 3c — live mutual aid: accept another commander's aid request. */
  sendMutualAidAccept(missionId: string, requesterName: string) {
    this.send({ type: 'mutual_aid_accept', missionId, requesterName });
  }

  /** Batch 3c — live mutual aid: report a helper-cleared mission (CLEARED BY credit). */
  sendMutualAidCleared(missionId: string, helperName: string) {
    this.send({ type: 'mutual_aid_cleared', missionId, helperName });
  }

  /** Send an alliance chat message — the server persists + broadcasts it live. */
  sendAllianceChat(message: string) {
    this.send({ type: 'alliance_chat', message });
  }

  /** Acknowledge delivery of an alliance message so the sender sees ✓✓. */
  sendAllianceReceipt(messageId: string, allianceId: string) {
    this.send({ type: 'alliance_chat_receipt', messageId, allianceId });
  }

  /** Signal that the current player is typing in alliance chat (throttled by the caller). */
  sendAllianceTyping() {
    this.send({ type: 'alliance_typing' });
  }

  /** Subscribe to a server message type. Returns an unsubscribe function. */
  onMessage(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  isConnected() {
    return this.connected;
  }

  /** Ms epoch of the last connection attempt, or null if never attempted. */
  getLastAttemptAt() {
    return this.lastAttemptAt;
  }

  /** Subscribe to real socket-state changes (open/close/disconnect). Returns
   * an unsubscribe function. The store's wsConnected flag rides this so the
   * floating online chip always mirrors the actual socket, not just auth_ok. */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListener = listener;
    return () => {
      if (this.connectionListener === listener) this.connectionListener = null;
    };
  }

  /** Fully disconnect and stop reconnection attempts. */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.connected = false;
    this.connectionListener?.(false);
  }
}

export const wsClient = new WsClient();
