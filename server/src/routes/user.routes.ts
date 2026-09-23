import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { Gender } from '../types/index.js';
import { storage } from '../services/s3.service.js';
import { notifications } from '../services/notify.js';
import { realtime } from '../websocket/realtime.js';
import {
  canSeeAuthor,
  miniUser,
  presentPost,
  presentReel,
  selfUser,
  viewerContext,
} from '../services/present.js';

const router = Router();
const GENDERS: Gender[] = ['Male', 'Female', 'Other', 'Prefer not to say'];

/** Update own profile settings. College affiliation is immutable. */
router.patch('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const { bio, isPrivate, gender, avatarUrl, fullName, globalNotificationsEnabled, headline, department, designation, skills } = req.body || {};

  if (bio !== undefined) user.bio = String(bio).trim().slice(0, 1000);
  if (headline !== undefined) user.headline = String(headline).trim().slice(0, 120);
  if (department !== undefined) user.department = String(department).trim().slice(0, 80);
  if (designation !== undefined && user.role !== 'student') user.designation = String(designation).trim().slice(0, 80);
  if (skills !== undefined) {
    if (!Array.isArray(skills)) return res.status(400).json({ success: false, error: 'Skills must be a list.' });
    const cleaned = skills
      .filter((s: unknown) => typeof s === 'string')
      .map((s: string) => s.trim().slice(0, 32))
      .filter(Boolean);
    user.skills = Array.from(new Set<string>(cleaned)).slice(0, 20);
  }
  if (gender !== undefined) {
    if (!GENDERS.includes(gender)) return res.status(400).json({ success: false, error: 'Invalid gender option.' });
    user.gender = gender;
  }
  if (avatarUrl !== undefined) {
    if (avatarUrl !== '' && !storage.isOwnPublicUrl(avatarUrl, ['avatars'])) {
      return res.status(400).json({ success: false, error: 'Please upload a profile photo through the app.' });
    }
    user.avatarUrl = avatarUrl;
  }
  if (fullName !== undefined) {
    const name = String(fullName).trim();
    if (name.length < 2 || name.length > 80) return res.status(400).json({ success: false, error: 'Name must be 2–80 characters.' });
    user.fullName = name;
  }
  if (globalNotificationsEnabled !== undefined) user.globalNotificationsEnabled = Boolean(globalNotificationsEnabled);
  if (isPrivate !== undefined) {
    const next = Boolean(isPrivate);
    // Going public approves everyone who was waiting.
    if (user.isPrivate && !next) db.follows.acceptAllPending(user.id);
    user.isPrivate = next;
  }
  user.updatedAt = new Date().toISOString();
  db.users.set(user.id, user);
  res.json({ success: true, message: 'Profile updated.', user: selfUser(user) });
});

/**
 * Follow / unfollow a user (private accounts receive a request), or follow a
 * college hub with a notification preference.
 */
router.post('/follow', requireAuth, (req: AuthenticatedRequest, res) => {
  const me = db.users.get(req.user!.id)!;
  const { targetUserId, targetCollegeId, follow, notificationPreference } = req.body || {};
  const pref = ['all', 'highlights', 'muted'].includes(notificationPreference) ? notificationPreference : 'all';
  const shouldFollow = follow !== undefined ? Boolean(follow) : true;

  if (targetCollegeId) {
    const college = db.colleges.get(String(targetCollegeId));
    if (!college) return res.status(404).json({ success: false, error: 'College not found.' });
    me.collegeNotificationsEnabled = me.collegeNotificationsEnabled || {};
    if (shouldFollow) me.collegeNotificationsEnabled[college.id] = pref !== 'muted';
    else delete me.collegeNotificationsEnabled[college.id];
    me.updatedAt = new Date().toISOString();
    db.users.set(me.id, me);
    return res.json({
      success: true,
      isFollowing: shouldFollow,
      targetCollegeId: college.id,
      notificationPreference: pref,
      message: shouldFollow ? `Following ${college.name}` : `Unfollowed ${college.name}`,
    });
  }

  if (typeof targetUserId !== 'string' || targetUserId === me.id) {
    return res.status(400).json({ success: false, error: 'Invalid target user.' });
  }
  const target = db.users.get(targetUserId);
  if (!target || db.blocks.eitherBlocked(me.id, target.id)) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  let status: 'none' | 'pending' | 'following' = 'none';
  if (shouldFollow) {
    const existing = db.follows.status(me.id, target.id);
    if (existing === 'accepted') status = 'following';
    else if (target.isPrivate) {
      db.follows.add(me.id, target.id, 'pending');
      status = 'pending';
      if (existing !== 'pending') {
        notifications.create(target.id, {
          type: 'follow_request',
          actorId: me.id,
          targetType: 'user',
          targetId: me.id,
          title: 'Follow request',
          message: `${me.fullName} wants to follow you.`,
        });
      }
    } else {
      db.follows.add(me.id, target.id, 'accepted');
      status = 'following';
      notifications.create(target.id, {
        type: 'follow',
        actorId: me.id,
        targetType: 'user',
        targetId: me.id,
        title: 'New follower',
        message: `${me.fullName} started following you.`,
      });
    }
  } else {
    db.follows.remove(me.id, target.id);
    notifications.remove(target.id, 'follow', me.id, me.id);
    notifications.remove(target.id, 'follow_request', me.id, me.id);
  }

  res.json({
    success: true,
    isFollowing: status === 'following',
    followStatus: status,
    followersCount: db.follows.followersCount(target.id),
    followingCount: db.follows.followingCount(me.id),
    message:
      status === 'pending'
        ? `Follow request sent to ${target.fullName}`
        : status === 'following'
          ? `Following ${target.fullName}`
          : `Unfollowed ${target.fullName}`,
  });
});

/** Pending follow requests for my private account. */
router.get('/me/requests', requireAuth, (req: AuthenticatedRequest, res) => {
  const users = db.follows
    .pendingRequestIds(req.user!.id)
    .map((id) => db.users.get(id))
    .filter(Boolean)
    .map((u) => miniUser(u));
  res.json({ success: true, requests: users });
});

router.post('/requests/:followerId/:action', requireAuth, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const { followerId, action } = req.params;
  if (db.follows.status(followerId, me.id) !== 'pending') {
    return res.status(404).json({ success: false, error: 'No pending request from this person.' });
  }
  notifications.remove(me.id, 'follow_request', followerId, followerId);
  if (action === 'accept') {
    db.follows.add(followerId, me.id, 'accepted');
    notifications.create(followerId, {
      type: 'follow_accept',
      actorId: me.id,
      targetType: 'user',
      targetId: me.id,
      title: 'Request accepted',
      message: `${me.fullName} accepted your follow request.`,
    });
    return res.json({ success: true, accepted: true, followersCount: db.follows.followersCount(me.id) });
  }
  if (action === 'decline') {
    db.follows.remove(followerId, me.id);
    return res.json({ success: true, accepted: false });
  }
  res.status(400).json({ success: false, error: 'Unknown action.' });
});

/** Remove one of my followers. */
router.delete('/me/followers/:followerId', requireAuth, (req: AuthenticatedRequest, res) => {
  db.follows.remove(req.params.followerId, req.user!.id);
  res.json({ success: true, followersCount: db.follows.followersCount(req.user!.id) });
});

/** Block / unblock. Blocking also removes follows in both directions. */
router.post('/:userId/block', requireAuth, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const target = db.users.get(req.params.userId);
  if (!target || target.id === me.id) return res.status(400).json({ success: false, error: 'Invalid user.' });
  db.blocks.add(me.id, target.id);
  db.follows.remove(me.id, target.id);
  db.follows.remove(target.id, me.id);
  realtime.sendToUser(me.id, { type: 'BLOCKS_CHANGED' });
  res.json({ success: true, blocked: true, message: `Blocked ${target.fullName}.` });
});

router.delete('/:userId/block', requireAuth, (req: AuthenticatedRequest, res) => {
  db.blocks.remove(req.user!.id, req.params.userId);
  res.json({ success: true, blocked: false });
});

router.get('/me/blocked', requireAuth, (req: AuthenticatedRequest, res) => {
  const users = db.blocks
    .blockedBy(req.user!.id)
    .map((id) => db.users.get(id))
    .filter(Boolean)
    .map((u) => miniUser(u));
  res.json({ success: true, users });
});

/** Hide (or show again) posts from a college in the For You feed. */
router.post('/mute-college', requireAuth, (req: AuthenticatedRequest, res) => {
  const me = db.users.get(req.user!.id)!;
  const { collegeId, mute } = req.body || {};
  const college = db.colleges.get(String(collegeId || ''));
  if (!college) return res.status(404).json({ success: false, error: 'College not found.' });
  const set = new Set(me.mutedCollegeIds || []);
  if (mute === false) set.delete(college.id);
  else set.add(college.id);
  me.mutedCollegeIds = Array.from(set);
  db.users.set(me.id, me);
  res.json({ success: true, mutedCollegeIds: me.mutedCollegeIds, message: mute === false ? `Unmuted ${college.name}` : `Muted ${college.name}` });
});

/** Toggle granular notification preferences. */
router.post('/notifications/toggle', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const { collegeId, enabled, isGlobal } = req.body || {};
  if (isGlobal !== undefined) {
    user.globalNotificationsEnabled = Boolean(enabled);
  } else if (typeof collegeId === 'string' && db.colleges.has(collegeId)) {
    user.collegeNotificationsEnabled = user.collegeNotificationsEnabled || {};
    user.collegeNotificationsEnabled[collegeId] = Boolean(enabled);
  }
  user.updatedAt = new Date().toISOString();
  db.users.set(user.id, user);
  res.json({
    success: true,
    message: 'Notification preferences updated.',
    preferences: { global: user.globalNotificationsEnabled, perCollege: user.collegeNotificationsEnabled },
  });
});

/** Suggested people: verified, visible, not yet followed (same college first). */
router.get('/suggestions', requireAuth, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const ctx = viewerContext(me);
  const candidates = Array.from(db.users.values())
    .filter(
      (u) =>
        u.id !== me.id &&
        u.isProfileComplete &&
        u.verificationStatus === 'Verified Member' &&
        !ctx.hidden.has(u.id) &&
        !db.follows.status(me.id, u.id)
    )
    .sort((a, b) => {
      const aSame = a.collegeId === me.collegeId ? 1 : 0;
      const bSame = b.collegeId === me.collegeId ? 1 : 0;
      if (aSame !== bSame) return bSame - aSame;
      return (b.lastActiveAt || b.createdAt).localeCompare(a.lastActiveAt || a.createdAt);
    })
    .slice(0, 12)
    .map((u) => ({ ...miniUser(u), followersCount: db.follows.followersCount(u.id) }));
  res.json({ success: true, suggestions: candidates });
});

/** People search by name, college or company. */
router.get('/search', optionalAuth, (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 80) : '';
  if (q.length < 1) return res.json({ success: true, users: [] });
  const ctx = viewerContext(req.user);
  const users = Array.from(db.users.values())
    .filter((u) => u.isProfileComplete && !ctx.hidden.has(u.id))
    .map((u) => {
      const name = u.fullName.toLowerCase();
      const score = name.startsWith(q)
        ? 3
        : name.includes(q)
          ? 2
          : [u.collegeName, u.companyName, u.department, u.designation, u.headline, ...(u.skills || [])].some((f) =>
                (f || '').toLowerCase().includes(q)
              )
            ? 1
            : 0;
      return { u, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.u.fullName.localeCompare(b.u.fullName))
    .slice(0, 25)
    .map(({ u }) => ({
      ...miniUser(u),
      followStatus: req.user ? followStatusOf(req.user.id, u.id) : 'none',
    }));
  res.json({ success: true, users });
});

function followStatusOf(viewerId: string, targetId: string): 'none' | 'pending' | 'following' | 'self' {
  if (viewerId === targetId) return 'self';
  const s = db.follows.status(viewerId, targetId);
  return s === 'accepted' ? 'following' : s === 'pending' ? 'pending' : 'none';
}

/** My saved posts & reels. */
router.get('/me/saved', requireAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const posts = db.bookmarks
    .list(req.user!.id, 'post')
    .map((id) => db.posts.get(id))
    .filter((p) => p && canSeeAuthor(ctx, p.authorId))
    .map((p) => presentPost(p!, ctx));
  const reels = db.bookmarks
    .list(req.user!.id, 'reel')
    .map((id) => db.reels.get(id))
    .filter((r) => r && canSeeAuthor(ctx, r.authorId))
    .map((r) => presentReel(r!, ctx));
  res.json({ success: true, posts, reels });
});

/** Followers / following lists (respecting privacy). */
router.get('/:userId/:list(followers|following)', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const target = db.users.get(req.params.userId);
  if (!target || ctx.hidden.has(target.id)) return res.status(404).json({ success: false, error: 'User not found.' });
  if (!canSeeAuthor(ctx, target.id)) {
    return res.status(403).json({ success: false, error: 'This account is private.' });
  }
  const ids = req.params.list === 'followers' ? db.follows.followerIds(target.id) : db.follows.followingIds(target.id);
  const users = ids
    .filter((id) => !ctx.hidden.has(id))
    .map((id) => db.users.get(id))
    .filter(Boolean)
    .map((u) => ({ ...miniUser(u), followStatus: req.user ? followStatusOf(req.user.id, u!.id) : 'none' }));
  res.json({ success: true, users });
});

/** Profile with privacy controls applied. */
router.get('/:userId', optionalAuth, (req: AuthenticatedRequest, res) => {
  const viewer = req.user;
  const ctx = viewerContext(viewer);
  const user = db.users.get(req.params.userId);
  if (!user || ctx.hidden.has(user.id)) return res.status(404).json({ success: false, error: 'User not found.' });

  const isOwner = viewer?.id === user.id;
  const canSee = canSeeAuthor(ctx, user.id);

  const posts = Array.from(db.posts.values())
    .filter((p) => p.authorId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reels = Array.from(db.reels.values())
    .filter((r) => r.authorId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    success: true,
    profile: {
      ...miniUser(user),
      email: isOwner ? user.email : undefined,
      phoneNumber: isOwner ? user.phoneNumber : undefined,
      gender: user.gender,
      designation: user.designation,
      customHeadline: isOwner ? user.headline || '' : undefined,
      skills: user.skills || [],
      isCollegeLocked: user.isCollegeLocked,
      bio: user.bio,
      followersCount: db.follows.followersCount(user.id),
      followingCount: db.follows.followingCount(user.id),
      postsCount: posts.length,
      reelsCount: reels.length,
      createdAt: user.createdAt,
      isOwner,
      followStatus: viewer ? followStatusOf(viewer.id, user.id) : 'none',
      isFollowedByMe: viewer ? db.follows.isFollowing(viewer.id, user.id) : false,
      followsMe: viewer ? db.follows.isFollowing(user.id, viewer.id) : false,
      isOnline: canSee ? realtime.isOnline(user.id) : false,
      isLockedForViewer: !canSee,
    },
    posts: canSee ? posts.map((p) => presentPost(p, ctx)) : [],
    reels: canSee ? reels.map((r) => presentReel(r, ctx)) : [],
  });
});

export default router;
