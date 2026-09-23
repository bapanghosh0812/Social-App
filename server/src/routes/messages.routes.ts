import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { messageLimiter } from '../middleware/rateLimits.js';
import { MessageAttachment, User } from '../types/index.js';
import { messaging } from '../services/messaging.js';
import { realtime } from '../websocket/realtime.js';
import { canSeeAuthor, isVideoUrl, miniUser, viewerContext } from '../services/present.js';

const router = Router();
router.use(requireAuth);

/** Resolve a shared item into a small, safe preview card. */
function resolveAttachment(raw: unknown, sender: User): MessageAttachment | null | 'invalid' {
  if (!raw) return null;
  if (typeof raw !== 'object') return 'invalid';
  const { type, id } = raw as { type?: string; id?: string };
  if (typeof id !== 'string') return 'invalid';
  const ctx = viewerContext(sender);

  if (type === 'post') {
    const p = db.posts.get(id);
    if (!p || !canSeeAuthor(ctx, p.authorId)) return 'invalid';
    const author = db.users.get(p.authorId);
    return {
      type,
      id,
      title: p.content.slice(0, 120),
      thumbUrl: p.mediaUrls.find((u) => !isVideoUrl(u)) || '',
      authorName: author?.fullName,
    };
  }
  if (type === 'reel') {
    const r = db.reels.get(id);
    if (!r || !canSeeAuthor(ctx, r.authorId)) return 'invalid';
    return { type, id, title: r.caption.slice(0, 120), thumbUrl: r.thumbnailUrl, authorName: db.users.get(r.authorId)?.fullName };
  }
  if (type === 'story') {
    const s = db.stories.get(id);
    if (!s || !canSeeAuthor(ctx, s.userId)) return 'invalid';
    return {
      type,
      id,
      title: s.caption.slice(0, 120),
      thumbUrl: s.mediaType === 'image' ? s.mediaUrl : '',
      authorName: db.users.get(s.userId)?.fullName,
    };
  }
  if (type === 'profile') {
    const u = db.users.get(id);
    if (!u || ctx.hidden.has(u.id)) return 'invalid';
    return { type, id, title: u.collegeName || u.companyName || '', thumbUrl: u.avatarUrl, authorName: u.fullName };
  }
  return 'invalid';
}

function deliver(senderId: string, recipientId: string, sender: User, text: unknown, rawAttachment: unknown) {
  const body = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
  const attachment = resolveAttachment(rawAttachment, sender);
  if (attachment === 'invalid') return { error: 'That item can no longer be shared.' };
  if (!body && !attachment) return { error: 'Message is empty.' };

  const conv = messaging.getOrCreate(senderId, recipientId);
  const message = messaging.send(conv.id, senderId, body, attachment);
  const payload = { type: 'MESSAGE_NEW', conversationId: conv.id, message, from: miniUser(sender) };
  realtime.sendToUser(recipientId, payload);
  realtime.sendToUser(senderId, payload);
  return { conversationId: conv.id, message };
}

router.get('/conversations', (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const hidden = db.blocks.hiddenFor(me.id);
  const conversations = messaging
    .summaries(me.id)
    .filter((s) => db.users.has(s.otherUserId))
    .map((s) => ({
      ...s,
      otherUser: miniUser(db.users.get(s.otherUserId)),
      isOnline: !hidden.has(s.otherUserId) && realtime.isOnline(s.otherUserId),
      isBlocked: hidden.has(s.otherUserId),
    }));
  res.json({ success: true, conversations });
});

router.get('/unread-count', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, unread: messaging.totalUnread(req.user!.id) });
});

/** Open (or create) a conversation with someone. */
router.post('/conversations', (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const other = db.users.get(String(req.body?.userId || ''));
  if (!other || other.id === me.id || db.blocks.eitherBlocked(me.id, other.id)) {
    return res.status(404).json({ success: false, error: 'You can’t message this account.' });
  }
  const conv = messaging.getOrCreate(me.id, other.id);
  res.json({
    success: true,
    conversation: {
      id: conv.id,
      otherUserId: other.id,
      otherUser: miniUser(other),
      isOnline: realtime.isOnline(other.id),
      otherLastReadAt: messaging.lastReadAt(conv.id, other.id),
    },
  });
});

router.get('/conversations/:id/messages', (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const conv = messaging.get(req.params.id);
  if (!conv || !messaging.isMember(conv.id, me.id)) return res.status(404).json({ success: false, error: 'Conversation not found.' });
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const messages = messaging.list(conv.id, before, 40);
  const otherId = conv.user_a === me.id ? conv.user_b : conv.user_a;
  res.json({
    success: true,
    messages,
    hasMore: messages.length === 40,
    otherLastReadAt: messaging.lastReadAt(conv.id, otherId),
  });
});

router.post('/conversations/:id/messages', messageLimiter, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const conv = messaging.get(req.params.id);
  if (!conv || !messaging.isMember(conv.id, me.id)) return res.status(404).json({ success: false, error: 'Conversation not found.' });
  const otherId = conv.user_a === me.id ? conv.user_b : conv.user_a;
  if (db.blocks.eitherBlocked(me.id, otherId) || !db.users.has(otherId)) {
    return res.status(403).json({ success: false, error: 'You can’t message this account.' });
  }
  const result = deliver(me.id, otherId, me, req.body?.text, req.body?.attachment);
  if ('error' in result) return res.status(400).json({ success: false, error: result.error });
  res.status(201).json({ success: true, message: result.message });
});

/** Send directly to a user (share sheet, story replies). */
router.post('/send', messageLimiter, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const recipientIds: string[] = Array.isArray(req.body?.userIds)
    ? req.body.userIds.slice(0, 20)
    : [String(req.body?.userId || '')];
  const results: { userId: string; conversationId?: string; error?: string }[] = [];
  for (const id of recipientIds) {
    const other = db.users.get(String(id));
    if (!other || other.id === me.id || db.blocks.eitherBlocked(me.id, other.id)) {
      results.push({ userId: String(id), error: 'Unavailable' });
      continue;
    }
    const r = deliver(me.id, other.id, me, req.body?.text, req.body?.attachment);
    results.push('error' in r ? { userId: other.id, error: r.error } : { userId: other.id, conversationId: r.conversationId });
  }
  const sent = results.filter((r) => !r.error).length;
  if (!sent) return res.status(400).json({ success: false, error: results[0]?.error || 'Nothing was sent.', results });
  res.json({ success: true, sent, results });
});

router.post('/conversations/:id/read', (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const conv = messaging.get(req.params.id);
  if (!conv || !messaging.isMember(conv.id, me.id)) return res.status(404).json({ success: false, error: 'Conversation not found.' });
  const at = new Date().toISOString();
  messaging.markRead(conv.id, me.id, at);
  const otherId = conv.user_a === me.id ? conv.user_b : conv.user_a;
  realtime.sendToUser(otherId, { type: 'MESSAGE_READ', conversationId: conv.id, userId: me.id, readAt: at });
  res.json({ success: true });
});

/** Unsend your own message. */
router.delete('/messages/:messageId', (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const msg = messaging.getMessage(req.params.messageId);
  if (!msg || msg.senderId !== me.id) return res.status(404).json({ success: false, error: 'Message not found.' });
  messaging.softDelete(msg.id);
  const otherId = messaging.otherMember(msg.conversationId, me.id);
  const payload = { type: 'MESSAGE_DELETED', conversationId: msg.conversationId, messageId: msg.id };
  if (otherId) realtime.sendToUser(otherId, payload);
  realtime.sendToUser(me.id, payload);
  res.json({ success: true });
});

export default router;
