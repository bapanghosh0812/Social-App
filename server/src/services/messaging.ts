import crypto from 'crypto';
import { sqlite } from '../db/sqlite.js';
import { ChatMessage, MessageAttachment } from '../types/index.js';

/**
 * One-to-one direct messaging persistence. Pure data access — HTTP routes add
 * permission checks and push realtime events.
 */

interface ConversationRow {
  id: string;
  pair_key: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment: string | null;
  created_at: string;
  deleted: number;
}

export interface ConversationSummary {
  id: string;
  otherUserId: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  otherLastReadAt: string | null;
}

const pairKey = (a: string, b: string) => [a, b].sort().join(':');

export function toMessage(row: MessageRow): ChatMessage {
  let attachment: MessageAttachment | null = null;
  if (row.attachment) {
    try {
      attachment = JSON.parse(row.attachment);
    } catch {
      attachment = null;
    }
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.deleted ? '' : row.body,
    attachment: row.deleted ? null : attachment,
    createdAt: row.created_at,
    deleted: Boolean(row.deleted),
  };
}

export const messaging = {
  getOrCreate(userA: string, userB: string): ConversationRow {
    const key = pairKey(userA, userB);
    const existing = sqlite.prepare('SELECT * FROM conversations WHERE pair_key = ?').get(key) as ConversationRow | undefined;
    if (existing) return existing;
    const now = new Date().toISOString();
    const row: ConversationRow = {
      id: `conv_${crypto.randomBytes(8).toString('hex')}`,
      pair_key: key,
      user_a: userA,
      user_b: userB,
      created_at: now,
      updated_at: now,
    };
    sqlite
      .prepare('INSERT INTO conversations (id, pair_key, user_a, user_b, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(row.id, row.pair_key, row.user_a, row.user_b, row.created_at, row.updated_at);
    return row;
  },

  get(conversationId: string): ConversationRow | undefined {
    return sqlite.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as ConversationRow | undefined;
  },

  isMember(conversationId: string, userId: string): boolean {
    const c = this.get(conversationId);
    return Boolean(c && (c.user_a === userId || c.user_b === userId));
  },

  otherMember(conversationId: string, userId: string): string | null {
    const c = this.get(conversationId);
    if (!c) return null;
    return c.user_a === userId ? c.user_b : c.user_a;
  },

  send(conversationId: string, senderId: string, body: string, attachment?: MessageAttachment | null): ChatMessage {
    const now = new Date().toISOString();
    const row: MessageRow = {
      id: `msg_${crypto.randomBytes(9).toString('hex')}`,
      conversation_id: conversationId,
      sender_id: senderId,
      body,
      attachment: attachment ? JSON.stringify(attachment) : null,
      created_at: now,
      deleted: 0,
    };
    sqlite
      .prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, body, attachment, created_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)'
      )
      .run(row.id, row.conversation_id, row.sender_id, row.body, row.attachment, row.created_at);
    sqlite.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
    this.markRead(conversationId, senderId, now);
    return toMessage(row);
  },

  /** Insert with an explicit timestamp (demo seeding). */
  insertAt(conversationId: string, senderId: string, body: string, createdAt: string, attachment?: MessageAttachment | null) {
    sqlite
      .prepare(
        'INSERT INTO messages (id, conversation_id, sender_id, body, attachment, created_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)'
      )
      .run(
        `msg_${crypto.randomBytes(9).toString('hex')}`,
        conversationId,
        senderId,
        body,
        attachment ? JSON.stringify(attachment) : null,
        createdAt
      );
    sqlite
      .prepare('UPDATE conversations SET updated_at = (SELECT MAX(created_at) FROM messages WHERE conversation_id = ?) WHERE id = ?')
      .run(conversationId, conversationId);
  },

  list(conversationId: string, before?: string, limit = 40): ChatMessage[] {
    const rows = (
      before
        ? sqlite
            .prepare('SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?')
            .all(conversationId, before, limit)
        : sqlite.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?').all(conversationId, limit)
    ) as MessageRow[];
    return rows.reverse().map(toMessage);
  },

  getMessage(messageId: string): ChatMessage | null {
    const row = sqlite.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRow | undefined;
    return row ? toMessage(row) : null;
  },

  softDelete(messageId: string): void {
    sqlite.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(messageId);
  },

  markRead(conversationId: string, userId: string, at = new Date().toISOString()): void {
    sqlite
      .prepare(
        `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
         ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = MAX(last_read_at, excluded.last_read_at)`
      )
      .run(conversationId, userId, at);
  },

  lastReadAt(conversationId: string, userId: string): string | null {
    const r = sqlite
      .prepare('SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND user_id = ?')
      .get(conversationId, userId) as { last_read_at: string } | undefined;
    return r?.last_read_at ?? null;
  },

  summaries(userId: string): ConversationSummary[] {
    const convs = sqlite
      .prepare('SELECT * FROM conversations WHERE user_a = ? OR user_b = ? ORDER BY updated_at DESC LIMIT 100')
      .all(userId, userId) as ConversationRow[];
    return convs.map((c) => {
      const otherUserId = c.user_a === userId ? c.user_b : c.user_a;
      const lastRow = sqlite
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(c.id) as MessageRow | undefined;
      const readAt = this.lastReadAt(c.id, userId) || '';
      const unread = (
        sqlite
          .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_id != ? AND created_at > ? AND deleted = 0')
          .get(c.id, userId, readAt) as { n: number }
      ).n;
      return {
        id: c.id,
        otherUserId,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        lastMessage: lastRow ? toMessage(lastRow) : null,
        unreadCount: unread,
        otherLastReadAt: this.lastReadAt(c.id, otherUserId),
      };
    });
  },

  totalUnread(userId: string): number {
    return this.summaries(userId).reduce((n, s) => n + (s.unreadCount > 0 ? 1 : 0), 0);
  },
};
