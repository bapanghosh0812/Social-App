import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage, Server } from 'http';
import crypto from 'crypto';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { db } from '../db/database.js';
import { userFromToken } from '../middleware/authMiddleware.js';
import { checkAdminPin } from '../config/adminSecrets.js';
import { live } from '../services/live.js';
import { messaging } from '../services/messaging.js';
import { miniUser } from '../services/present.js';

/**
 * Single authenticated realtime channel (`/ws/v1`).
 *
 *  - Clients authenticate with their first message ({type:'AUTH', token});
 *    credentials never travel in the URL, so they never land in access logs.
 *  - Origin is checked against CORS_ORIGINS, payloads are size-capped, each
 *    connection is rate-limited, and dead sockets are reaped by heartbeat.
 *  - Carries notifications, DMs, typing, presence, the admin review queue and
 *    WebRTC signaling for live broadcasts.
 */

interface Conn {
  key: string;
  ws: WebSocket;
  userId: string | null;
  isAdmin: boolean;
  alive: boolean;
  windowStart: number;
  msgCount: number;
  liveSessions: Set<string>;
}

const MAX_PAYLOAD = 64 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 300;
const AUTH_TIMEOUT_MS = 8000;

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private conns = new Map<string, Conn>();
  private byUser = new Map<string, Set<string>>();

  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/v1',
      maxPayload: MAX_PAYLOAD,
      verifyClient: (info: { origin: string; req: IncomingMessage }) => this.originAllowed(info.origin, info.req),
    });

    this.wss.on('connection', (ws) => this.onConnection(ws));

    const heartbeat = setInterval(() => {
      for (const c of this.conns.values()) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        try {
          c.ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, 30_000);
    heartbeat.unref();

    logger.info('Realtime hub mounted on /ws/v1');
  }

  private originAllowed(origin: string | undefined, req: IncomingMessage): boolean {
    if (!origin) return true; // native apps / non-browser clients
    if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host; // same-origin deployment
    } catch {
      return false;
    }
  }

  private onConnection(ws: WebSocket) {
    const conn: Conn = {
      key: crypto.randomBytes(9).toString('hex'),
      ws,
      userId: null,
      isAdmin: false,
      alive: true,
      windowStart: Date.now(),
      msgCount: 0,
      liveSessions: new Set(),
    };
    this.conns.set(conn.key, conn);

    const authTimer = setTimeout(() => {
      if (!conn.userId) ws.close(4401, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('message', (raw) => this.onMessage(conn, raw));
    ws.on('close', () => {
      clearTimeout(authTimer);
      this.onClose(conn);
    });
    ws.on('error', () => ws.terminate());
  }

  private onClose(conn: Conn) {
    this.conns.delete(conn.key);
    for (const sessionId of conn.liveSessions) this.leaveLive(conn, sessionId, true);
    if (conn.userId) {
      const set = this.byUser.get(conn.userId);
      set?.delete(conn.key);
      if (set && set.size === 0) {
        this.byUser.delete(conn.userId);
        const user = db.users.get(conn.userId);
        if (user) db.users.set(user.id, { ...user, lastActiveAt: new Date().toISOString() });
        this.broadcastPresence(conn.userId, false);
      }
    }
  }

  private send(conn: Conn, data: unknown) {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(data));
  }

  private onMessage(conn: Conn, raw: RawData) {
    conn.alive = true;
    const now = Date.now();
    if (now - conn.windowStart > RATE_WINDOW_MS) {
      conn.windowStart = now;
      conn.msgCount = 0;
    }
    if (++conn.msgCount > RATE_MAX) {
      conn.ws.close(4429, 'Rate limit exceeded');
      return;
    }

    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (!conn.userId) {
      if (msg.type === 'AUTH') this.authenticate(conn, msg.token);
      return;
    }

    switch (msg.type) {
      case 'PING':
        this.send(conn, { type: 'PONG' });
        break;
      case 'ADMIN_AUTH':
        this.adminAuth(conn, msg.pin);
        break;
      case 'TYPING':
        this.relayTyping(conn, msg.conversationId);
        break;
      case 'LIVE_HOST_ATTACH':
        this.hostAttach(conn, String(msg.sessionId || ''));
        break;
      case 'LIVE_JOIN':
        this.joinLive(conn, String(msg.sessionId || ''));
        break;
      case 'LIVE_LEAVE':
        this.leaveLive(conn, String(msg.sessionId || ''));
        break;
      case 'LIVE_SIGNAL':
        this.relaySignal(conn, String(msg.sessionId || ''), String(msg.to || ''), msg.data);
        break;
      case 'LIVE_CHAT':
        this.liveChat(conn, String(msg.sessionId || ''), msg.text);
        break;
      case 'LIVE_HEART':
        this.liveHeart(conn, String(msg.sessionId || ''));
        break;
      default:
        break;
    }
  }

  private authenticate(conn: Conn, token: unknown) {
    const user = typeof token === 'string' ? userFromToken(token) : undefined;
    if (!user) {
      conn.ws.close(4401, 'Unauthorized');
      return;
    }
    conn.userId = user.id;
    const set = this.byUser.get(user.id) || new Set<string>();
    const wasOffline = set.size === 0;
    set.add(conn.key);
    this.byUser.set(user.id, set);
    this.send(conn, { type: 'READY', userId: user.id });
    if (wasOffline) this.broadcastPresence(user.id, true);
  }

  private adminAuth(conn: Conn, pin: unknown) {
    const user = conn.userId ? db.users.get(conn.userId) : undefined;
    const isAdmin = Boolean(user && env.adminEmails.has(user.email.toLowerCase()));
    if (!user || !isAdmin || checkAdminPin(user.id, pin) !== 'ok') {
      this.send(conn, { type: 'ADMIN_DENIED' });
      return;
    }
    conn.isAdmin = true;
    this.send(conn, { type: 'ADMIN_READY' });
    this.sendAdminSnapshot(conn);
  }

  // --- Presence ---
  isOnline(userId: string): boolean {
    return (this.byUser.get(userId)?.size || 0) > 0;
  }

  private broadcastPresence(userId: string, online: boolean) {
    // Only people who share a conversation with the user learn their presence.
    const summaries = messaging.summaries(userId);
    for (const s of summaries) this.sendToUser(s.otherUserId, { type: 'PRESENCE', userId, online });
  }

  // --- Targeted delivery ---
  sendToUser(userId: string, data: unknown) {
    const keys = this.byUser.get(userId);
    if (!keys) return;
    for (const key of keys) {
      const c = this.conns.get(key);
      if (c) this.send(c, data);
    }
  }

  /** Close every socket of a user (used after logout-all / password change / deletion). */
  disconnectUser(userId: string) {
    const keys = this.byUser.get(userId);
    if (!keys) return;
    for (const key of Array.from(keys)) this.conns.get(key)?.ws.close(4401, 'Session revoked');
  }

  broadcastAdmins(data: unknown) {
    for (const c of this.conns.values()) if (c.isAdmin) this.send(c, data);
  }

  private sendAdminSnapshot(conn: Conn) {
    const pending = Array.from(db.verificationDocuments.values()).filter((d) => d.status === 'Pending').length;
    const reports = Array.from(db.reports.values()).filter((r) => r.status === 'open').length;
    this.send(conn, { type: 'ADMIN_COUNTS', payload: { pendingVerifications: pending, openReports: reports } });
  }

  refreshAdmins() {
    for (const c of this.conns.values()) if (c.isAdmin) this.sendAdminSnapshot(c);
  }

  private relayTyping(conn: Conn, conversationId: unknown) {
    if (typeof conversationId !== 'string' || !conn.userId) return;
    const other = messaging.otherMember(conversationId, conn.userId);
    if (!other || !messaging.isMember(conversationId, conn.userId)) return;
    if (db.blocks.eitherBlocked(conn.userId, other)) return;
    this.sendToUser(other, { type: 'TYPING', conversationId, userId: conn.userId });
  }

  // --- Live broadcasting (WebRTC signaling relay) ---
  private liveParticipants(sessionId: string): Conn[] {
    const s = live.get(sessionId);
    if (!s) return [];
    const keys = [s.hostConnKey, ...s.viewers.keys()].filter(Boolean) as string[];
    return keys.map((k) => this.conns.get(k)).filter(Boolean) as Conn[];
  }

  private broadcastLiveStats(sessionId: string) {
    const s = live.get(sessionId);
    if (!s) return;
    const payload = { type: 'LIVE_STATS', sessionId, viewerCount: s.viewers.size, likes: s.likes };
    for (const c of this.liveParticipants(sessionId)) this.send(c, payload);
  }

  private hostAttach(conn: Conn, sessionId: string) {
    const s = live.get(sessionId);
    if (!s || s.hostId !== conn.userId) {
      this.send(conn, { type: 'LIVE_ERROR', sessionId, message: 'Live session not found.' });
      return;
    }
    if (s.endTimer) {
      clearTimeout(s.endTimer);
      s.endTimer = null;
    }
    s.hostConnKey = conn.key;
    conn.liveSessions.add(sessionId);
    this.send(conn, { type: 'LIVE_HOST_READY', sessionId });
    // Re-announce viewers that joined before the host (re)attached.
    for (const [viewerKey, userId] of s.viewers) {
      this.send(conn, { type: 'LIVE_VIEWER_JOINED', sessionId, viewerKey, user: miniUser(db.users.get(userId)) });
    }
    this.broadcastLiveStats(sessionId);
  }

  private joinLive(conn: Conn, sessionId: string) {
    const s = live.get(sessionId);
    if (!s || !conn.userId) {
      this.send(conn, { type: 'LIVE_ENDED', sessionId });
      return;
    }
    if (db.blocks.eitherBlocked(conn.userId, s.hostId)) {
      this.send(conn, { type: 'LIVE_ERROR', sessionId, message: 'This broadcast is not available.' });
      return;
    }
    if (s.viewers.size >= env.liveMaxViewers && !s.viewers.has(conn.key)) {
      this.send(conn, { type: 'LIVE_ERROR', sessionId, message: 'This live is full right now. Try again soon.' });
      return;
    }
    s.viewers.set(conn.key, conn.userId);
    conn.liveSessions.add(sessionId);
    this.send(conn, { type: 'LIVE_JOINED', sessionId, viewerKey: conn.key, hostOnline: Boolean(s.hostConnKey) });
    const host = s.hostConnKey ? this.conns.get(s.hostConnKey) : undefined;
    if (host) {
      this.send(host, {
        type: 'LIVE_VIEWER_JOINED',
        sessionId,
        viewerKey: conn.key,
        user: miniUser(db.users.get(conn.userId)),
      });
    }
    this.broadcastLiveStats(sessionId);
  }

  private leaveLive(conn: Conn, sessionId: string, disconnected = false) {
    const s = live.get(sessionId);
    conn.liveSessions.delete(sessionId);
    if (!s) return;
    if (s.hostConnKey === conn.key) {
      s.hostConnKey = null;
      // Give the host a short grace period to reconnect before ending.
      const grace = disconnected ? 20_000 : 0;
      s.endTimer = setTimeout(() => this.endLive(sessionId), grace);
      return;
    }
    if (s.viewers.delete(conn.key)) {
      const host = s.hostConnKey ? this.conns.get(s.hostConnKey) : undefined;
      if (host) this.send(host, { type: 'LIVE_VIEWER_LEFT', sessionId, viewerKey: conn.key });
      this.broadcastLiveStats(sessionId);
    }
  }

  endLive(sessionId: string) {
    const participants = this.liveParticipants(sessionId);
    const s = live.end(sessionId);
    if (!s) return;
    for (const c of participants) {
      c.liveSessions.delete(sessionId);
      this.send(c, { type: 'LIVE_ENDED', sessionId });
    }
    logger.info(`Live session ended: ${sessionId}`);
  }

  private relaySignal(conn: Conn, sessionId: string, to: string, data: unknown) {
    const s = live.get(sessionId);
    if (!s || !data || typeof data !== 'object') return;
    const isHost = s.hostConnKey === conn.key;
    if (isHost) {
      if (!s.viewers.has(to)) return;
      const viewer = this.conns.get(to);
      if (viewer) this.send(viewer, { type: 'LIVE_SIGNAL', sessionId, from: 'host', data });
    } else if (s.viewers.has(conn.key) && to === 'host' && s.hostConnKey) {
      const host = this.conns.get(s.hostConnKey);
      if (host) this.send(host, { type: 'LIVE_SIGNAL', sessionId, from: conn.key, data });
    }
  }

  private liveChat(conn: Conn, sessionId: string, text: unknown) {
    const s = live.get(sessionId);
    if (!s || !conn.userId || typeof text !== 'string') return;
    if (s.hostConnKey !== conn.key && !s.viewers.has(conn.key)) return;
    const clean = text.trim().slice(0, 300);
    if (!clean) return;
    const payload = {
      type: 'LIVE_CHAT',
      sessionId,
      message: {
        id: crypto.randomBytes(6).toString('hex'),
        user: miniUser(db.users.get(conn.userId)),
        text: clean,
        createdAt: new Date().toISOString(),
      },
    };
    for (const c of this.liveParticipants(sessionId)) this.send(c, payload);
  }

  private liveHeart(conn: Conn, sessionId: string) {
    const s = live.get(sessionId);
    if (!s || (s.hostConnKey !== conn.key && !s.viewers.has(conn.key))) return;
    s.likes += 1;
    const payload = { type: 'LIVE_HEART', sessionId, likes: s.likes };
    for (const c of this.liveParticipants(sessionId)) this.send(c, payload);
  }

  liveViewerCount(sessionId: string): number {
    return live.get(sessionId)?.viewers.size || 0;
  }
}

export const realtime = new RealtimeHub();
