import { getToken, wsUrl } from './api.js';

type Handler = (event: any) => void;

/**
 * Realtime connection to /ws/v1. Authenticates with the first message (the
 * token never goes in the URL), reconnects with exponential backoff, and fans
 * events out to subscribers by `type`.
 */
class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry = 0;
  private reconnectTimer: number | null = null;
  private heartbeat: number | null = null;
  private wanted = false;
  private queue: unknown[] = [];
  ready = false;

  connect() {
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = getToken();
    if (!token) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'AUTH', token }));
    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'READY') {
        this.ready = true;
        this.retry = 0;
        this.startHeartbeat();
        const pending = this.queue.splice(0);
        pending.forEach((m) => this.send(m));
      }
      this.emit(msg.type, msg);
      this.emit('*', msg);
    };
    ws.onclose = (e) => {
      this.ready = false;
      this.stopHeartbeat();
      this.emit('DISCONNECTED', { code: e.code });
      if (e.code === 4401) return; // session revoked or invalid — don't hammer the server
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.wanted = false;
    this.queue = [];
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.ready = false;
  }

  /** Send now if authenticated, otherwise queue until the connection is ready. */
  send(msg: unknown) {
    if (this.ws && this.ready && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (this.queue.length < 100) this.queue.push(msg);
      this.connect();
    }
  }

  on(type: string, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  private emit(type: string, msg: unknown) {
    this.handlers.get(type)?.forEach((h) => {
      try {
        h(msg);
      } catch (err) {
        console.error('Realtime handler failed', err);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 800 * 2 ** this.retry) + Math.random() * 400;
    this.retry += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => this.send({ type: 'PING' }), 25_000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export const realtime = new RealtimeClient();
