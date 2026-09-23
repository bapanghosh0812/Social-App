import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireAuth,
  requireVerifiedMember,
  optionalAuth,
  AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { publishLimiter } from '../middleware/rateLimits.js';
import { env } from '../config/env.js';
import { live, LiveSession } from '../services/live.js';
import { notifications } from '../services/notify.js';
import { realtime } from '../websocket/realtime.js';
import { canSeeAuthor, miniUser, viewerContext } from '../services/present.js';

/**
 * Live broadcasts. Video is peer-to-peer WebRTC (host → viewers) with
 * signaling over the realtime channel; ICE/TURN servers come from ICE_SERVERS.
 */
const router = Router();

function present(s: LiveSession) {
  return {
    id: s.id,
    title: s.title,
    startedAt: s.startedAt,
    likes: s.likes,
    viewerCount: s.viewers.size,
    host: miniUser(db.users.get(s.hostId)),
  };
}

router.get('/', optionalAuth, (req: AuthenticatedRequest, res) => {
  const ctx = viewerContext(req.user);
  const sessions = live
    .list()
    .filter((s) => canSeeAuthor(ctx, s.hostId))
    .map(present);
  res.json({ success: true, sessions });
});

router.get('/ice-config', requireAuth, (_req, res) => {
  res.json({ success: true, iceServers: env.iceServers, maxViewers: env.liveMaxViewers });
});

router.get('/:id', optionalAuth, (req: AuthenticatedRequest, res) => {
  const s = live.get(req.params.id);
  if (!s || !canSeeAuthor(viewerContext(req.user), s.hostId)) {
    return res.status(404).json({ success: false, error: 'This live has ended.' });
  }
  res.json({ success: true, session: present(s) });
});

/** Go live (verified members). Followers are notified. */
router.post('/', publishLimiter, requireVerifiedMember, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const session = live.start(user.id, title);

  for (const followerId of db.follows.followerIds(user.id).slice(0, 500)) {
    notifications.create(followerId, {
      type: 'live',
      actorId: user.id,
      targetType: 'live',
      targetId: session.id,
      title: 'Live now',
      message: `${user.fullName} started a live video: ${session.title}`,
    });
  }
  res.status(201).json({ success: true, session: present(session), iceServers: env.iceServers });
});

router.post('/:id/end', requireAuth, (req: AuthenticatedRequest, res) => {
  const s = live.get(req.params.id);
  if (!s) return res.json({ success: true });
  if (s.hostId !== req.user!.id && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: 'Only the host can end this live.' });
  }
  realtime.endLive(s.id);
  res.json({ success: true, likes: s.likes });
});

export default router;
