import crypto from 'crypto';

/**
 * In-memory registry of live broadcasts.
 *
 * Video flows peer-to-peer over WebRTC (host → each viewer); this registry
 * only tracks who is live and who is watching so the realtime layer can relay
 * signaling, chat and reactions. Sessions end when the host stops or drops.
 */

export interface LiveSession {
  id: string;
  hostId: string;
  title: string;
  startedAt: string;
  likes: number;
  hostConnKey: string | null;
  viewers: Map<string, string>; // viewer connection key -> userId
  endTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, LiveSession>();

export const live = {
  start(hostId: string, title: string): LiveSession {
    for (const s of sessions.values()) {
      if (s.hostId === hostId) this.end(s.id);
    }
    const session: LiveSession = {
      id: `live_${crypto.randomBytes(8).toString('hex')}`,
      hostId,
      title: title.slice(0, 120) || 'Campus Live',
      startedAt: new Date().toISOString(),
      likes: 0,
      hostConnKey: null,
      viewers: new Map(),
      endTimer: null,
    };
    sessions.set(session.id, session);
    return session;
  },

  get(id: string): LiveSession | undefined {
    return sessions.get(id);
  },

  list(): LiveSession[] {
    return Array.from(sessions.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  end(id: string): LiveSession | undefined {
    const s = sessions.get(id);
    if (!s) return undefined;
    if (s.endTimer) clearTimeout(s.endTimer);
    sessions.delete(id);
    return s;
  },
};
