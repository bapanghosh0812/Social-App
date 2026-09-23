import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireVerifiedMember,
  requireAuth,
  optionalAuth,
  AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { publishLimiter } from '../middleware/rateLimits.js';
import { Post, PinnedCollegeFeed, Story } from '../types/index.js';
import { logger } from '../config/logger.js';
import { storage } from '../services/s3.service.js';
import { notifications } from '../services/notify.js';
import {
  canSeeAuthor,
  extractHashtags,
  isVideoUrl,
  miniUser,
  newId,
  presentPost,
  presentStory,
  viewerContext,
  ViewerContext,
} from '../services/present.js';

const router = Router();
const MAX_MEDIA = 10;

function visiblePosts(ctx: ViewerContext): Post[] {
  return Array.from(db.posts.values()).filter((p) => canSeeAuthor(ctx, p.authorId));
}

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

function paginate<T extends { id: string }>(items: T[], cursor: unknown, limit: number) {
  let start = 0;
  if (typeof cursor === 'string' && cursor) {
    const idx = items.findIndex((p) => p.id === cursor);
    if (idx !== -1) start = idx + 1;
  }
  const page = items.slice(start, start + limit);
  const nextCursor = start + limit < items.length && page.length ? page[page.length - 1].id : null;
  return { page, nextCursor };
}

function firstImage(post: Post): string | undefined {
  return post.mediaUrls.find((u) => !isVideoUrl(u)) || post.mediaUrls[0];
}

// ---------------------------------------------------------------------------
// Stories (24h)
// ---------------------------------------------------------------------------

router.get('/stories', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const now = Date.now();
  const stories = Array.from(db.stories.values())
    .filter((s) => new Date(s.expiresAt).getTime() > now && canSeeAuthor(ctx, s.userId))
    .sort((a, b) => a.createdAtISO.localeCompare(b.createdAtISO))
    .map((s) => presentStory(s, ctx));
  res.json({ success: true, stories });
});

router.post('/stories', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { mediaUrl, caption, ref } = req.body || {};
  let media = '';
  let storyRef: Story['ref'];

  if (ref && typeof ref === 'object' && (ref.type === 'reel' || ref.type === 'post') && typeof ref.id === 'string') {
    const ctx = viewerContext(user);
    if (ref.type === 'reel') {
      const reel = db.reels.get(ref.id);
      if (!reel || !canSeeAuthor(ctx, reel.authorId)) return res.status(404).json({ success: false, error: 'Reel not found.' });
      const provider = reel.provider || 'upload';
      media = provider === 'upload' || provider === 'direct' ? reel.videoUrl : reel.thumbnailUrl;
    } else {
      const post = db.posts.get(ref.id);
      if (!post || !canSeeAuthor(ctx, post.authorId)) return res.status(404).json({ success: false, error: 'Post not found.' });
      media = post.mediaUrls[0] || '';
    }
    storyRef = { type: ref.type, id: ref.id };
    if (!media) return res.status(400).json({ success: false, error: 'This item has no media to add to a story.' });
  } else {
    if (!storage.isOwnPublicUrl(mediaUrl, ['stories', 'posts'])) {
      return res.status(400).json({ success: false, error: 'Please upload a photo or video for your story.' });
    }
    media = mediaUrl;
  }

  const nowIso = new Date().toISOString();
  const story: Story = {
    id: newId('story'),
    userId: user.id,
    userName: user.fullName,
    userAvatar: user.avatarUrl,
    collegeName: user.collegeName || '',
    mediaUrl: media,
    mediaType: isVideoUrl(media) ? 'video' : 'image',
    caption: typeof caption === 'string' ? caption.trim().slice(0, 300) : '',
    ref: storyRef,
    createdAtISO: nowIso,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
  db.stories.set(story.id, story);
  res.status(201).json({ success: true, story: presentStory(story, viewerContext(user)) });
});

router.delete('/stories/:storyId', requireAuth, (req: AuthenticatedRequest, res) => {
  const story = db.stories.get(req.params.storyId);
  if (!story) return res.status(404).json({ success: false, error: 'Story not found.' });
  if (story.userId !== req.user!.id && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only delete your own story.' });
  }
  db.deleteStory(story.id);
  res.json({ success: true });
});

router.post('/stories/:storyId/view', requireAuth, (req: AuthenticatedRequest, res) => {
  const story = db.stories.get(req.params.storyId);
  if (!story) return res.status(404).json({ success: false, error: 'Story not found.' });
  if (story.userId !== req.user!.id) db.storyViews.add(req.user!.id, story.id);
  res.json({ success: true });
});

router.get('/stories/:storyId/viewers', requireAuth, (req: AuthenticatedRequest, res) => {
  const story = db.stories.get(req.params.storyId);
  if (!story || story.userId !== req.user!.id) {
    return res.status(404).json({ success: false, error: 'Story not found.' });
  }
  const viewers = db.storyViews
    .viewers(story.id)
    .map((v) => ({ user: miniUser(db.users.get(v.userId)), viewedAt: v.viewedAt }))
    .filter((v) => v.user.id);
  res.json({ success: true, viewers });
});

// ---------------------------------------------------------------------------
// Sticky primary-college hub
// ---------------------------------------------------------------------------

router.get('/primary-college-pinned', optionalAuth, (req: AuthenticatedRequest, res) => {
  const collegeId = (typeof req.query.collegeId === 'string' && req.query.collegeId) || req.user?.collegeId;
  if (!collegeId) return res.json({ success: true, data: null });

  const existing = db.pinnedFeeds.get(collegeId);
  if (existing) return res.json({ success: true, data: existing });

  const college = db.colleges.get(collegeId);
  const emptyFeed: PinnedCollegeFeed = {
    collegeId,
    collegeName: college?.name || 'Your College',
    shortCode: college?.shortCode || '',
    announcementsCount: 0,
    noticeBoard: [],
    todaysPlanning: [],
    clubHighlights: [],
  };
  res.json({ success: true, data: emptyFeed });
});

// ---------------------------------------------------------------------------
// Discovery: trending hashtags + post search
// ---------------------------------------------------------------------------

router.get('/trending-tags', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const counts = new Map<string, number>();
  const add = (text: string) => extractHashtags(text).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
  for (const p of visiblePosts(ctx)) if (new Date(p.createdAt).getTime() > since) add(p.content);
  for (const r of db.reels.values()) {
    if (new Date(r.createdAt).getTime() > since && canSeeAuthor(ctx, r.authorId)) add(r.caption);
  }
  const tags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));
  res.json({ success: true, tags });
});

router.get('/search', optionalAuth, (req: AuthenticatedRequest, res) => {
  const raw = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 80) : '';
  if (!raw) return res.json({ success: true, posts: [] });
  const ctx = viewerContext(req.user);
  const tag = raw.startsWith('#') ? raw.slice(1) : null;
  const posts = visiblePosts(ctx)
    .filter((p) => (tag ? extractHashtags(p.content).includes(tag) : p.content.toLowerCase().includes(raw)))
    .sort(byNewest)
    .slice(0, 40)
    .map((p) => presentPost(p, ctx));
  res.json({ success: true, posts });
});

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * Cursor-paginated feed.
 *  mode=forYou    — everything visible (muted colleges hidden)
 *  mode=following — people you follow + you
 *  mode=campus    — your college (or ?collegeId=)
 */
router.get('/', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const me = req.user;
  const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 30);
  const mode = String(req.query.mode || 'forYou');
  const collegeId = typeof req.query.collegeId === 'string' ? req.query.collegeId : undefined;

  let posts = visiblePosts(ctx);
  if (collegeId) {
    posts = posts.filter((p) => p.collegeId === collegeId);
  } else if (mode === 'following' && me) {
    const following = new Set(db.follows.followingIds(me.id));
    posts = posts.filter((p) => p.authorId === me.id || following.has(p.authorId));
  } else if (mode === 'campus' && me?.collegeId) {
    posts = posts.filter((p) => p.collegeId === me.collegeId);
  } else if (me?.mutedCollegeIds?.length) {
    const muted = new Set(me.mutedCollegeIds);
    posts = posts.filter((p) => !p.collegeId || !muted.has(p.collegeId) || p.authorId === me.id);
  }

  posts.sort(byNewest);
  const { page, nextCursor } = paginate(posts, req.query.cursor, limit);
  res.json({
    success: true,
    posts: page.map((p) => presentPost(p, ctx)).filter(Boolean),
    nextCursor,
    hasMore: nextCursor !== null,
    totalCount: posts.length,
  });
});

/** Create a post (verified members only). */
router.post('/', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { content, mediaUrls } = req.body || {};

  const cleanContent = typeof content === 'string' ? content.trim() : '';
  const media: string[] = Array.isArray(mediaUrls) ? mediaUrls.slice(0, MAX_MEDIA + 1) : [];
  if (media.length > MAX_MEDIA) {
    return res.status(400).json({ success: false, error: `You can attach up to ${MAX_MEDIA} photos or videos.` });
  }
  if (!media.every((u) => storage.isOwnPublicUrl(u, ['posts']))) {
    return res.status(400).json({ success: false, error: 'Media must be uploaded through the app.' });
  }
  if (!cleanContent && media.length === 0) {
    return res.status(400).json({ success: false, error: 'Post must contain text or media.' });
  }
  if (cleanContent.length > 5000) {
    return res.status(400).json({ success: false, error: 'Post is too long (max 5000 characters).' });
  }

  const hasVideo = media.some(isVideoUrl);
  const hasImage = media.some((u) => !isVideoUrl(u));
  const post: Post = {
    id: newId('post'),
    authorId: user.id,
    authorName: user.fullName,
    authorAvatar: user.avatarUrl,
    authorRole: user.role,
    authorVerificationStatus: user.verificationStatus,
    collegeId: user.collegeId,
    collegeName: user.collegeName,
    content: cleanContent,
    mediaUrls: media,
    mediaType: hasVideo && hasImage ? 'mixed' : hasVideo ? 'video' : hasImage ? 'image' : 'text',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    repostsCount: 0,
    createdAt: new Date().toISOString(),
  };

  db.posts.set(post.id, post);
  logger.info(`New post ${post.id} by ${user.id}`);
  res.status(201).json({ success: true, message: 'Post published.', post: presentPost(post, viewerContext(user)) });
});

/** Single post (deep links / post detail). */
router.get('/:postId', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const post = db.posts.get(req.params.postId);
  if (!post || !canSeeAuthor(ctx, post.authorId)) {
    return res.status(404).json({ success: false, error: 'This post is unavailable.' });
  }
  res.json({ success: true, post: presentPost(post, ctx) });
});

/** Edit your own post's caption. */
router.patch('/:postId', requireAuth, (req: AuthenticatedRequest, res) => {
  const post = db.posts.get(req.params.postId);
  if (!post || post.authorId !== req.user!.id) return res.status(404).json({ success: false, error: 'Post not found.' });
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (content.length > 5000) return res.status(400).json({ success: false, error: 'Post is too long.' });
  if (!content && post.mediaUrls.length === 0 && !post.repostOf) {
    return res.status(400).json({ success: false, error: 'Post must contain text or media.' });
  }
  const updated = { ...post, content, editedAt: new Date().toISOString() };
  db.posts.set(post.id, updated);
  res.json({ success: true, post: presentPost(updated, viewerContext(req.user)) });
});

/** Delete your own post (admins may delete any). */
router.delete('/:postId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const post = db.posts.get(req.params.postId);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  if (post.authorId !== req.user!.id && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only delete your own posts.' });
  }
  if (post.repostOf) {
    const original = post.repostOf.type === 'post' ? db.posts.get(post.repostOf.id) : db.reels.get(post.repostOf.id);
    if (original) {
      const next = { ...original, repostsCount: Math.max(0, (original.repostsCount || 1) - 1) };
      if (post.repostOf.type === 'post') db.posts.set(original.id, next as Post);
      else db.reels.set(original.id, next as any);
    }
  }
  const urls = [...post.mediaUrls];
  db.deletePost(post.id);
  // Remove reposts of this post as well.
  for (const p of Array.from(db.posts.values())) {
    if (p.repostOf?.type === 'post' && p.repostOf.id === post.id) db.deletePost(p.id);
  }
  await Promise.all(urls.map((u) => storage.removePublic(u)));
  res.json({ success: true });
});

/** Toggle like. */
router.post('/:postId/like', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const post = db.posts.get(req.params.postId);
  if (!post || !canSeeAuthor(viewerContext(user), post.authorId)) {
    return res.status(404).json({ success: false, error: 'Post not found.' });
  }
  const liked = db.postLikes.isLiked(user.id, post.id);
  if (liked) {
    db.postLikes.remove(user.id, post.id);
    notifications.remove(post.authorId, 'like', user.id, post.id);
  } else {
    db.postLikes.add(user.id, post.id);
    notifications.create(post.authorId, {
      type: 'like',
      actorId: user.id,
      targetType: 'post',
      targetId: post.id,
      thumbUrl: firstImage(post),
      title: 'New like',
      message: `${user.fullName} liked your post.`,
    });
  }
  const likesCount = db.postLikes.count(post.id);
  res.json({ success: true, isLiked: !liked, isLikedByMe: !liked, likesCount });
});

/** People who liked a post. */
router.get('/:postId/likes', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const post = db.posts.get(req.params.postId);
  if (!post || !canSeeAuthor(ctx, post.authorId)) return res.status(404).json({ success: false, error: 'Post not found.' });
  const users = db.postLikes
    .likerIds(post.id, 100)
    .filter((id) => !ctx.hidden.has(id))
    .map((id) => miniUser(db.users.get(id)))
    .filter((u) => u.id);
  res.json({ success: true, users });
});

/** Toggle bookmark. */
router.post('/:postId/save', requireAuth, (req: AuthenticatedRequest, res) => {
  const post = db.posts.get(req.params.postId);
  if (!post || !canSeeAuthor(viewerContext(req.user), post.authorId)) {
    return res.status(404).json({ success: false, error: 'Post not found.' });
  }
  const saved = db.bookmarks.toggle(req.user!.id, 'post', post.id);
  res.json({ success: true, isSaved: saved });
});

// Share counter (de-duplicated per person per item for 10 minutes).
const recentShares = new Map<string, number>();
router.post('/:postId/share', optionalAuth, (req: AuthenticatedRequest, res) => {
  const post = db.posts.get(req.params.postId);
  if (!post) return res.status(404).json({ success: false, error: 'Post not found.' });
  const key = `${req.user?.id || req.ip}:${post.id}`;
  const last = recentShares.get(key) || 0;
  if (Date.now() - last > 10 * 60 * 1000) {
    recentShares.set(key, Date.now());
    post.sharesCount = (post.sharesCount || 0) + 1;
    db.posts.set(post.id, post);
  }
  if (recentShares.size > 50_000) recentShares.clear();
  res.json({ success: true, sharesCount: post.sharesCount });
});

/** Reshare a post to your own feed. Calling again undoes the reshare. */
router.post('/:postId/repost', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const ctx = viewerContext(user);
  let target = db.posts.get(req.params.postId);
  if (target?.repostOf?.type === 'post') target = db.posts.get(target.repostOf.id);
  if (target?.repostOf?.type === 'reel') {
    return res.status(400).json({ success: false, error: 'Reshare the original reel instead.' });
  }
  if (!target || !canSeeAuthor(ctx, target.authorId)) {
    return res.status(404).json({ success: false, error: 'Post not found.' });
  }
  if (target.authorId === user.id) {
    return res.status(400).json({ success: false, error: "You can't reshare your own post." });
  }

  const existing = Array.from(db.posts.values()).find(
    (p) => p.authorId === user.id && p.repostOf?.type === 'post' && p.repostOf.id === target!.id
  );
  if (existing) {
    db.deletePost(existing.id);
    target.repostsCount = Math.max(0, (target.repostsCount || 1) - 1);
    db.posts.set(target.id, target);
    return res.json({ success: true, reposted: false, repostsCount: target.repostsCount });
  }

  const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 1000) : '';
  const repost: Post = {
    id: newId('post'),
    authorId: user.id,
    authorName: user.fullName,
    authorAvatar: user.avatarUrl,
    authorRole: user.role,
    authorVerificationStatus: user.verificationStatus,
    collegeId: user.collegeId,
    collegeName: user.collegeName,
    content: caption,
    mediaUrls: [],
    mediaType: 'text',
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    repostOf: { type: 'post', id: target.id },
    createdAt: new Date().toISOString(),
  };
  db.posts.set(repost.id, repost);
  target.repostsCount = (target.repostsCount || 0) + 1;
  db.posts.set(target.id, target);
  notifications.create(target.authorId, {
    type: 'repost',
    actorId: user.id,
    targetType: 'post',
    targetId: target.id,
    thumbUrl: firstImage(target),
    title: 'Reshared',
    message: `${user.fullName} reshared your post.`,
  });
  res.status(201).json({ success: true, reposted: true, repostsCount: target.repostsCount, post: presentPost(repost, ctx) });
});

export default router;
