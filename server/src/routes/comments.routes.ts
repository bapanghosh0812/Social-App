import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireAuth,
  requireVerifiedMember,
  optionalAuth,
  AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { commentLimiter } from '../middleware/rateLimits.js';
import { Comment } from '../types/index.js';
import { notifications } from '../services/notify.js';
import { canSeeAuthor, isVideoUrl, newId, presentComment, viewerContext, ViewerContext } from '../services/present.js';

/**
 * Comments for posts and reels: /api/comments/:targetType/:targetId
 */
const router = Router();

interface Target {
  type: 'post' | 'reel';
  id: string;
  ownerId: string;
  thumb?: string;
  save: (commentsCount: number) => void;
}

function resolveTarget(type: string, id: string, ctx: ViewerContext): Target | null {
  if (type === 'post') {
    const post = db.posts.get(id);
    if (!post || !canSeeAuthor(ctx, post.authorId)) return null;
    return {
      type,
      id,
      ownerId: post.authorId,
      thumb: post.mediaUrls.find((u) => !isVideoUrl(u)),
      save: (n) => db.posts.set(id, { ...db.posts.get(id)!, commentsCount: n }),
    };
  }
  if (type === 'reel') {
    const reel = db.reels.get(id);
    if (!reel || !canSeeAuthor(ctx, reel.authorId)) return null;
    return {
      type,
      id,
      ownerId: reel.authorId,
      thumb: reel.thumbnailUrl || undefined,
      save: (n) => db.reels.set(id, { ...db.reels.get(id)!, commentsCount: n }),
    };
  }
  return null;
}

router.get('/:targetType/:targetId', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const target = resolveTarget(req.params.targetType, req.params.targetId, ctx);
  if (!target) return res.status(404).json({ success: false, error: 'Not found.' });
  const comments = (db.comments.get(target.id) || [])
    .filter((c) => !ctx.hidden.has(c.authorId) && db.users.has(c.authorId))
    .map((c) => presentComment(c, ctx, target.ownerId));
  res.json({ success: true, comments });
});

router.post('/:targetType/:targetId', commentLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ctx = viewerContext(user);
  const target = resolveTarget(req.params.targetType, req.params.targetId, ctx);
  if (!target) return res.status(404).json({ success: false, error: 'Not found.' });

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ success: false, error: 'Comment text is required.' });
  if (content.length > 2000) return res.status(400).json({ success: false, error: 'Comment is too long.' });

  const comment: Comment = {
    id: newId('cmt'),
    postId: target.id,
    targetType: target.type,
    authorId: user.id,
    authorName: user.fullName,
    authorAvatar: user.avatarUrl,
    authorVerificationStatus: user.verificationStatus,
    content,
    createdAt: new Date().toISOString(),
    likesCount: 0,
  };
  const list = db.comments.get(target.id) || [];
  list.push(comment);
  db.comments.set(target.id, list);
  target.save(list.length);

  notifications.create(target.ownerId, {
    type: 'comment',
    actorId: user.id,
    targetType: target.type,
    targetId: target.id,
    thumbUrl: target.thumb,
    title: 'New comment',
    message: `${user.fullName} commented: "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`,
  });

  res.status(201).json({
    success: true,
    comment: presentComment(comment, ctx, target.ownerId),
    commentsCount: list.filter((c) => !ctx.hidden.has(c.authorId)).length,
  });
});

router.delete('/:targetType/:targetId/:commentId', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ctx = viewerContext(user);
  const target = resolveTarget(req.params.targetType, req.params.targetId, ctx);
  if (!target) return res.status(404).json({ success: false, error: 'Not found.' });
  const list = db.comments.get(target.id) || [];
  const comment = list.find((c) => c.id === req.params.commentId);
  if (!comment) return res.status(404).json({ success: false, error: 'Comment not found.' });
  if (comment.authorId !== user.id && target.ownerId !== user.id && !user.isAdmin) {
    return res.status(403).json({ success: false, error: 'You cannot delete this comment.' });
  }
  const kept = list.filter((c) => c.id !== comment.id);
  db.comments.set(target.id, kept);
  db.commentLikes.removeAllForItem(comment.id);
  target.save(kept.length);
  res.json({ success: true, commentsCount: kept.length });
});

router.post('/:targetType/:targetId/:commentId/like', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ctx = viewerContext(user);
  const target = resolveTarget(req.params.targetType, req.params.targetId, ctx);
  if (!target) return res.status(404).json({ success: false, error: 'Not found.' });
  const comment = (db.comments.get(target.id) || []).find((c) => c.id === req.params.commentId);
  if (!comment) return res.status(404).json({ success: false, error: 'Comment not found.' });

  const liked = db.commentLikes.isLiked(user.id, comment.id);
  if (liked) {
    db.commentLikes.remove(user.id, comment.id);
    notifications.remove(comment.authorId, 'comment_like', user.id, target.id);
  } else {
    db.commentLikes.add(user.id, comment.id);
    notifications.create(comment.authorId, {
      type: 'comment_like',
      actorId: user.id,
      targetType: target.type,
      targetId: target.id,
      thumbUrl: target.thumb,
      title: 'Comment liked',
      message: `${user.fullName} liked your comment: "${comment.content.slice(0, 60)}"`,
    });
  }
  res.json({ success: true, isLiked: !liked, likesCount: db.commentLikes.count(comment.id) });
});

export default router;
