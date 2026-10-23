// ============================================
// Dispatch HQ — WebSocket Client
// ============================================
// Connects to the game server using the HttpOnly auth cookie. Credentials
// are sent automatically by the browser during the handshake, so no token
// management is required on the client.

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
  // Real socket-state listener (v0.22.x): the store's wsConnected flag used to
  // depend on an auth_ok MESSAGE arriving, so a socket that was genuinely up
  // (presence + unit relay working) could still read as "Offline" on the chip.
  // This fires on EVERY socket open/close so the UI mirrors reality.
  private connectionListener: ((connected: boolean) => void) | null = null;

  /** Begin a connection. The auth cookie is sent automatically. */
  connect() {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private getWsUrl(): string {
    return import.meta.env.VITE_WS_URL || getDefaultWsUrl();
  }

  private doConnect() {
    this.cleanupSocket();
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
    if (this.reconnectAttempts >= 5) {
      this.shouldReconnect = false;
      this.connected = false;
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  /** Send a message to the server. No-op if the socket isn't open. */
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Report a unit's live position for the multiplayer relay (throttled by the caller). */
  sendUnitPosition(unitId: string, lat: number, lng: number, speedKmh: number, heading: number) {
    this.send({ type: 'unit_position', unitId, lat, lng, speedKmh, heading });
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
