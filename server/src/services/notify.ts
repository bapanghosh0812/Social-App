import crypto from 'crypto';
import { sqlite } from '../db/sqlite.js';
import { db } from '../db/database.js';
import { NotificationItem, NotificationType } from '../types/index.js';
import { realtime } from '../websocket/realtime.js';
import { miniUser } from './present.js';

/**
 * In-app notifications: persisted per user and pushed live over the realtime
 * channel. Self-actions and blocked actors never generate notifications, and
 * repeated likes from the same person on the same item are de-duplicated.
 */

type NotifyInput = Omit<NotificationItem, 'id' | 'userId' | 'isRead' | 'createdAt'> & { createdAt?: string };

interface Row {
  id: string;
  data: string;
  is_read: number;
  created_at: string;
}

function hydrate(row: Row) {
  const item = JSON.parse(row.data) as NotificationItem;
  const actor = item.actorId ? db.users.get(item.actorId) : undefined;
  const status = actor ? db.follows.status(item.userId, actor.id) : null;
  return {
    ...item,
    isRead: Boolean(row.is_read),
    actor: actor ? miniUser(actor) : null,
    actorFollowStatus: status === 'accepted' ? 'following' : status === 'pending' ? 'pending' : 'none',
  };
}

export const notifications = {
  create(userId: string, input: NotifyInput): void {
    if (!db.users.has(userId)) return;
    if (input.actorId) {
      if (input.actorId === userId) return;
      if (db.blocks.eitherBlocked(userId, input.actorId)) return;
      if (['like', 'comment_like', 'follow', 'follow_request'].includes(input.type)) {
        this.remove(userId, input.type, input.actorId, input.targetId);
      }
    }
    const item: NotificationItem = {
      id: `ntf_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      isRead: false,
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    };
    sqlite
      .prepare('INSERT INTO user_notifications (id, user_id, data, is_read, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(item.id, userId, JSON.stringify(item), item.createdAt);

    // Keep each inbox bounded.
    sqlite
      .prepare(
        `DELETE FROM user_notifications WHERE user_id = ? AND id NOT IN
         (SELECT id FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 300)`
      )
      .run(userId, userId);

    realtime.sendToUser(userId, {
      type: 'NOTIFICATION',
      notification: hydrate({ id: item.id, data: JSON.stringify(item), is_read: 0, created_at: item.createdAt }),
      unreadCount: this.unreadCount(userId),
    });
  },

  /** Remove a notification (e.g. after an unlike or unfollow). */
  remove(userId: string, type: NotificationType, actorId: string, targetId?: string): void {
    sqlite
      .prepare(
        `DELETE FROM user_notifications WHERE user_id = ?
         AND json_extract(data, '$.type') = ? AND json_extract(data, '$.actorId') = ?
         AND IFNULL(json_extract(data, '$.targetId'), '') = ?`
      )
      .run(userId, type, actorId, targetId || '');
  },

  list(userId: string, limit = 60) {
    const rows = sqlite
      .prepare('SELECT id, data, is_read, created_at FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as Row[];
    return rows.map(hydrate).filter((n) => !n.actorId || n.actor);
  },

  unreadCount(userId: string): number {
    return (
      sqlite.prepare('SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND is_read = 0').get(userId) as {
        n: number;
      }
    ).n;
  },

  markAllRead(userId: string): void {
    sqlite.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  },

  markRead(userId: string, id: string): void {
    sqlite.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND id = ?').run(userId, id);
  },

  delete(userId: string, id: string): void {
    sqlite.prepare('DELETE FROM user_notifications WHERE user_id = ? AND id = ?').run(userId, id);
  },
};
