import crypto from 'crypto';
import { db } from '../db/database.js';
import { Comment, Post, Reel, Story, User } from '../types/index.js';
import { isAdminEmail } from '../config/env.js';

/**
 * Presentation + visibility rules shared by every route.
 *
 * Author identity is resolved live from the users table so renamed accounts
 * and new avatars show up everywhere immediately, and all privacy rules
 * (blocks, private accounts, muted colleges) are enforced in one place.
 */

export interface MiniUser {
  id: string;
  fullName: string;
  avatarUrl: string;
  collegeId?: string;
  collegeName?: string;
  verificationStatus: User['verificationStatus'];
  role?: User['role'];
  isPrivate: boolean;
  academicYear?: string;
  companyName?: string;
  headline?: string;
  department?: string;
  designation?: string;
}

/** A LinkedIn-style one-liner: the user's own headline, or one built from their profile. */
export function headlineFor(u: User): string {
  if (u.headline) return u.headline;
  const college = (u.collegeName || '').split('(')[0].trim();
  if (u.role === 'faculty') {
    const title = [u.designation, u.department].filter(Boolean).join(', ');
    return [title || 'Faculty', college].filter(Boolean).join(' · ');
  }
  if (u.role === 'recruiter') return [u.designation, u.companyName].filter(Boolean).join(' at ');
  const batch = u.academicYear ? `Batch of ${u.academicYear.split('-')[1]}` : '';
  return ['Student', u.department, college, batch].filter(Boolean).join(' · ');
}

export function miniUser(u: User | undefined, fallback?: Partial<MiniUser>): MiniUser {
  if (!u) {
    return {
      id: fallback?.id || '',
      fullName: fallback?.fullName || 'Deleted account',
      avatarUrl: fallback?.avatarUrl || '',
      verificationStatus: 'Guest',
      isPrivate: false,
    };
  }
  return {
    id: u.id,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl,
    collegeId: u.collegeId,
    collegeName: u.collegeName,
    verificationStatus: u.verificationStatus,
    role: u.role,
    isPrivate: u.isPrivate,
    academicYear: u.academicYear,
    companyName: u.companyName,
    headline: headlineFor(u),
    department: u.department,
    designation: u.designation,
  };
}

/** Safe representation of the signed-in user's own account. */
export function selfUser(u: User): User {
  const { tokenVersion: _tv, verificationDocumentUrl: _doc, ...rest } = u;
  return { ...rest, isAdmin: isAdminEmail(u.email) } as User;
}

export interface ViewerContext {
  viewer?: User;
  hidden: Set<string>; // blocked either way
}

export function viewerContext(viewer?: User): ViewerContext {
  return { viewer, hidden: viewer ? db.blocks.hiddenFor(viewer.id) : new Set() };
}

/** Can the viewer see content authored by `authorId`? */
export function canSeeAuthor(ctx: ViewerContext, authorId: string): boolean {
  if (ctx.hidden.has(authorId)) return false;
  const author = db.users.get(authorId);
  if (!author) return false;
  if (!author.isPrivate) return true;
  if (!ctx.viewer) return false;
  return ctx.viewer.id === authorId || db.follows.isFollowing(ctx.viewer.id, authorId);
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
export const isVideoUrl = (url: string) => VIDEO_EXT_RE.test(url);

export function presentPost(post: Post, ctx: ViewerContext, depth = 0): Record<string, unknown> | null {
  const author = db.users.get(post.authorId);
  const viewerId = ctx.viewer?.id;
  let repost: Record<string, unknown> | null | undefined;
  if (post.repostOf && depth === 0) {
    if (post.repostOf.type === 'post') {
      const original = db.posts.get(post.repostOf.id);
      repost = original && canSeeAuthor(ctx, original.authorId) ? presentPost(original, ctx, 1) : null;
    } else {
      const reel = db.reels.get(post.repostOf.id);
      repost = reel && canSeeAuthor(ctx, reel.authorId) ? presentReel(reel, ctx) : null;
    }
  }
  return {
    ...post,
    authorName: author?.fullName ?? post.authorName,
    authorAvatar: author?.avatarUrl ?? post.authorAvatar,
    authorVerificationStatus: author?.verificationStatus ?? post.authorVerificationStatus,
    authorRole: author?.role ?? post.authorRole,
    authorHeadline: author ? headlineFor(author) : '',
    collegeName: post.collegeName || author?.collegeName,
    mediaItems: (post.mediaUrls || []).map((url) => ({ url, type: isVideoUrl(url) ? 'video' : 'image' })),
    likesCount: db.postLikes.count(post.id),
    commentsCount: (db.comments.get(post.id) || []).filter((c) => !ctx.hidden.has(c.authorId)).length,
    isLikedByMe: viewerId ? db.postLikes.isLiked(viewerId, post.id) : false,
    isSavedByMe: viewerId ? db.bookmarks.has(viewerId, 'post', post.id) : false,
    isOwner: viewerId === post.authorId,
    repost: post.repostOf ? repost ?? null : undefined,
    comments: undefined,
  };
}

export function presentReel(reel: Reel, ctx: ViewerContext): Record<string, unknown> {
  const author = db.users.get(reel.authorId);
  const viewerId = ctx.viewer?.id;
  const followStatus =
    viewerId && viewerId !== reel.authorId ? db.follows.status(viewerId, reel.authorId) : null;
  return {
    ...reel,
    provider: reel.provider || 'upload',
    authorName: author?.fullName ?? reel.authorName,
    authorAvatar: author?.avatarUrl ?? reel.authorAvatar,
    authorCollege: author?.collegeName ?? reel.authorCollege,
    authorVerificationStatus: author?.verificationStatus ?? 'Guest',
    audioTrack: reel.musicTrack || reel.audioTrack || 'Original audio',
    likesCount: db.reelLikes.count(reel.id),
    commentsCount: (db.comments.get(reel.id) || []).filter((c) => !ctx.hidden.has(c.authorId)).length,
    viewsCount: Math.max(db.reelViews.count(reel.id), reel.viewsCount || 0),
    isLikedByMe: viewerId ? db.reelLikes.isLiked(viewerId, reel.id) : false,
    isSavedByMe: viewerId ? db.bookmarks.has(viewerId, 'reel', reel.id) : false,
    isOwner: viewerId === reel.authorId,
    authorFollowStatus: followStatus,
  };
}

export function presentComment(c: Comment, ctx: ViewerContext, targetOwnerId?: string) {
  const author = db.users.get(c.authorId);
  const viewerId = ctx.viewer?.id;
  return {
    ...c,
    authorName: author?.fullName ?? c.authorName,
    authorAvatar: author?.avatarUrl ?? c.authorAvatar,
    authorVerificationStatus: author?.verificationStatus ?? c.authorVerificationStatus,
    authorCollege: author?.collegeName,
    authorHeadline: author ? headlineFor(author) : '',
    authorRole: author?.role,
    likesCount: db.commentLikes.count(c.id),
    isLikedByMe: viewerId ? db.commentLikes.isLiked(viewerId, c.id) : false,
    canDelete: Boolean(viewerId && (viewerId === c.authorId || viewerId === targetOwnerId)),
  };
}

export function presentStory(s: Story, ctx: ViewerContext) {
  const author = db.users.get(s.userId);
  const viewerId = ctx.viewer?.id;
  const isOwner = viewerId === s.userId;
  return {
    ...s,
    userName: author?.fullName ?? s.userName,
    userAvatar: author?.avatarUrl ?? s.userAvatar,
    collegeName: author?.collegeName ?? s.collegeName,
    createdAt: s.createdAtISO,
    seenByMe: viewerId ? db.storyViews.has(viewerId, s.id) : false,
    viewsCount: isOwner ? db.storyViews.count(s.id) : undefined,
    isOwner,
  };
}

/** Pull `#hashtags` out of free text (lower-cased, de-duplicated). */
export function extractHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)) tags.add(m[1].toLowerCase());
  return Array.from(tags);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
