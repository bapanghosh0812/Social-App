import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireVerifiedMember,
  requireAuth,
  optionalAuth,
  AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { publishLimiter } from '../middleware/rateLimits.js';
import { Post, Reel } from '../types/index.js';
import { storage } from '../services/s3.service.js';
import { parseExternalVideo } from '../services/externalMedia.js';
import { notifications } from '../services/notify.js';
import { canSeeAuthor, miniUser, newId, presentPost, presentReel, viewerContext } from '../services/present.js';

const router = Router();

/**
 * Vertical short-video stream (public, privacy-aware). `?startId=` moves a
 * specific reel to the front (deep links / profile grid).
 */
router.get('/', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const limit = Math.min(parseInt(String(req.query.limit || '30'), 10) || 30, 60);
  let reels = Array.from(db.reels.values())
    .filter((r) => r.isPublic !== false && canSeeAuthor(ctx, r.authorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : '';
  if (authorId) reels = reels.filter((r) => r.authorId === authorId);

  const startId = typeof req.query.startId === 'string' ? req.query.startId : '';
  if (startId) {
    const idx = reels.findIndex((r) => r.id === startId);
    if (idx > 0) reels = [reels[idx], ...reels.slice(0, idx), ...reels.slice(idx + 1)];
  }

  let start = 0;
  if (typeof req.query.cursor === 'string') {
    const idx = reels.findIndex((r) => r.id === req.query.cursor);
    if (idx !== -1) start = idx + 1;
  }
  const page = reels.slice(start, start + limit);
  const nextCursor = start + limit < reels.length && page.length ? page[page.length - 1].id : null;
  res.json({ success: true, reels: page.map((r) => presentReel(r, ctx)), nextCursor, total: reels.length });
});

router.get('/:reelId', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const reel = db.reels.get(req.params.reelId);
  if (!reel || !canSeeAuthor(ctx, reel.authorId)) return res.status(404).json({ success: false, error: 'Reel unavailable.' });
  res.json({ success: true, reel: presentReel(reel, ctx) });
});

/**
 * Publish a reel from an uploaded video (`videoUrl`) or an external link
 * (`externalUrl`: YouTube / Shorts, Instagram, TikTok, Vimeo, or a direct
 * .mp4/.webm link). Verified members only.
 */
router.post('/', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { videoUrl, externalUrl, caption, musicTrack, thumbnailUrl } = req.body || {};

  let source: Pick<Reel, 'videoUrl' | 'thumbnailUrl' | 'provider' | 'sourceUrl'>;
  if (typeof externalUrl === 'string' && externalUrl.trim()) {
    const ext = parseExternalVideo(externalUrl);
    if (!ext) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported link. Paste a YouTube/Shorts, Instagram, TikTok, Vimeo or direct .mp4 link.',
      });
    }
    source = { videoUrl: ext.videoUrl, thumbnailUrl: ext.thumbnailUrl, provider: ext.provider, sourceUrl: ext.sourceUrl };
  } else if (storage.isOwnPublicUrl(videoUrl, ['reels'])) {
    source = {
      videoUrl,
      thumbnailUrl: storage.isOwnPublicUrl(thumbnailUrl, ['reels', 'posts']) ? thumbnailUrl : '',
      provider: 'upload',
    };
  } else {
    return res.status(400).json({ success: false, error: 'Upload a video or paste a video link.' });
  }

  const reel: Reel = {
    id: newId('reel'),
    authorId: user.id,
    authorName: user.fullName,
    authorAvatar: user.avatarUrl,
    authorCollege: user.collegeName || '',
    ...source,
    caption: typeof caption === 'string' ? caption.trim().slice(0, 1000) : '',
    musicTrack: typeof musicTrack === 'string' && musicTrack.trim() ? musicTrack.trim().slice(0, 80) : 'Original audio',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    repostsCount: 0,
    createdAt: new Date().toISOString(),
    isPublic: true,
  };
  db.reels.set(reel.id, reel);
  res.status(201).json({ success: true, message: 'Reel published.', reel: presentReel(reel, viewerContext(user)) });
});

router.delete('/:reelId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const reel = db.reels.get(req.params.reelId);
  if (!reel) return res.status(404).json({ success: false, error: 'Reel not found.' });
  if (reel.authorId !== req.user!.id && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only delete your own reels.' });
  }
  const url = reel.provider === 'upload' || !reel.provider ? reel.videoUrl : '';
  db.deleteReel(reel.id);
  if (url) await storage.removePublic(url);
  res.json({ success: true });
});

router.post('/:reelId/like', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const reel = db.reels.get(req.params.reelId);
  if (!reel || !canSeeAuthor(viewerContext(user), reel.authorId)) {
    return res.status(404).json({ success: false, error: 'Reel not found.' });
  }
  const liked = db.reelLikes.isLiked(user.id, reel.id);
  if (liked) {
    db.reelLikes.remove(user.id, reel.id);
    notifications.remove(reel.authorId, 'like', user.id, reel.id);
  } else {
    db.reelLikes.add(user.id, reel.id);
    notifications.create(reel.authorId, {
      type: 'like',
      actorId: user.id,
      targetType: 'reel',
      targetId: reel.id,
      thumbUrl: reel.thumbnailUrl || undefined,
      title: 'New like',
      message: `${user.fullName} liked your reel.`,
    });
  }
  res.json({ success: true, isLiked: !liked, isLikedByMe: !liked, likesCount: db.reelLikes.count(reel.id) });
});

/** Count a unique view (signed-in viewers). */
router.post('/:reelId/view', optionalAuth, (req: AuthenticatedRequest, res) => {
  const reel = db.reels.get(req.params.reelId);
  if (!reel) return res.status(404).json({ success: false, error: 'Reel not found.' });
  if (req.user && req.user.id !== reel.authorId) db.reelViews.add(req.user.id, reel.id);
  res.json({ success: true, viewsCount: Math.max(db.reelViews.count(reel.id), reel.viewsCount || 0) });
});

router.post('/:reelId/save', requireAuth, (req: AuthenticatedRequest, res) => {
  const reel = db.reels.get(req.params.reelId);
  if (!reel || !canSeeAuthor(viewerContext(req.user), reel.authorId)) {
    return res.status(404).json({ success: false, error: 'Reel not found.' });
  }
  res.json({ success: true, isSaved: db.bookmarks.toggle(req.user!.id, 'reel', reel.id) });
});

const recentShares = new Map<string, number>();
router.post('/:reelId/share', optionalAuth, (req: AuthenticatedRequest, res) => {
  const reel = db.reels.get(req.params.reelId);
  if (!reel) return res.status(404).json({ success: false, error: 'Reel not found.' });
  const key = `${req.user?.id || req.ip}:${reel.id}`;
  if (Date.now() - (recentShares.get(key) || 0) > 10 * 60 * 1000) {
    recentShares.set(key, Date.now());
    reel.sharesCount = (reel.sharesCount || 0) + 1;
    db.reels.set(reel.id, reel);
  }
  if (recentShares.size > 50_000) recentShares.clear();
  res.json({ success: true, sharesCount: reel.sharesCount });
});

/** Reshare a reel to your feed; calling again undoes it. */
router.post('/:reelId/repost', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ctx = viewerContext(user);
  const reel = db.reels.get(req.params.reelId);
  if (!reel || !canSeeAuthor(ctx, reel.authorId)) return res.status(404).json({ success: false, error: 'Reel not found.' });
  if (reel.authorId === user.id) return res.status(400).json({ success: false, error: "You can't reshare your own reel." });

  const existing = Array.from(db.posts.values()).find(
    (p) => p.authorId === user.id && p.repostOf?.type === 'reel' && p.repostOf.id === reel.id
  );
  if (existing) {
    db.deletePost(existing.id);
    reel.repostsCount = Math.max(0, (reel.repostsCount || 1) - 1);
    db.reels.set(reel.id, reel);
    return res.json({ success: true, reposted: false, repostsCount: reel.repostsCount });
  }

  const post: Post = {
    id: newId('post'),
    authorId: user.id,
    authorName: user.fullName,
    authorAvatar: user.avatarUrl,
    authorRole: user.role,
    authorVerificationStatus: user.verificationStatus,
    collegeId: user.collegeId,
    collegeName: user.collegeName,
    content: typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 1000) : '',
    mediaUrls: [],
    mediaType: 'text',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    repostOf: { type: 'reel', id: reel.id },
    createdAt: new Date().toISOString(),
  };
  db.posts.set(post.id, post);
  reel.repostsCount = (reel.repostsCount || 0) + 1;
  db.reels.set(reel.id, reel);
  notifications.create(reel.authorId, {
    type: 'repost',
    actorId: user.id,
    targetType: 'reel',
    targetId: reel.id,
    thumbUrl: reel.thumbnailUrl || undefined,
    title: 'Reshared',
    message: `${user.fullName} reshared your reel.`,
  });
  res.status(201).json({ success: true, reposted: true, repostsCount: reel.repostsCount, post: presentPost(post, ctx) });
});

router.get('/:reelId/likes', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const reel = db.reels.get(req.params.reelId);
  if (!reel || !canSeeAuthor(ctx, reel.authorId)) return res.status(404).json({ success: false, error: 'Reel not found.' });
  const users = db.reelLikes
    .likerIds(reel.id, 100)
    .filter((id) => !ctx.hidden.has(id))
    .map((id) => miniUser(db.users.get(id)))
    .filter((u) => u.id);
  res.json({ success: true, users });
});

export default router;
