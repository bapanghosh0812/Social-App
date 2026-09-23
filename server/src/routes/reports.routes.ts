import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { reportLimiter } from '../middleware/rateLimits.js';
import { Report, ReportTarget } from '../types/index.js';
import { newId } from '../services/present.js';
import { realtime } from '../websocket/realtime.js';

/**
 * User safety reports (Play Store / App Store UGC requirement). Reports land
 * in the admin console where moderators can remove content or dismiss.
 */
const router = Router();

const REASONS = ['Spam', 'Harassment or bullying', 'Ragging', 'Hate speech', 'Nudity or sexual content', 'Violence', 'Fake account', 'Scam or fraud', 'Misinformation', 'Other'];
const TARGETS: ReportTarget[] = ['post', 'reel', 'comment', 'user', 'story'];

function describe(type: ReportTarget, id: string, parentId?: string): { ownerId?: string; snapshot: string } | null {
  switch (type) {
    case 'post': {
      const p = db.posts.get(id);
      return p ? { ownerId: p.authorId, snapshot: p.content.slice(0, 500) || '[media post]' } : null;
    }
    case 'reel': {
      const r = db.reels.get(id);
      return r ? { ownerId: r.authorId, snapshot: r.caption.slice(0, 500) || '[reel]' } : null;
    }
    case 'story': {
      const s = db.stories.get(id);
      return s ? { ownerId: s.userId, snapshot: s.caption || '[story]' } : null;
    }
    case 'user': {
      const u = db.users.get(id);
      return u ? { ownerId: u.id, snapshot: `${u.fullName} — ${u.bio || ''}`.slice(0, 500) } : null;
    }
    case 'comment': {
      if (!parentId) return null;
      const c = (db.comments.get(parentId) || []).find((x) => x.id === id);
      return c ? { ownerId: c.authorId, snapshot: c.content.slice(0, 500) } : null;
    }
  }
}

router.post('/', reportLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
  const me = req.user!;
  const { targetType, targetId, parentId, reason, details } = req.body || {};
  if (!TARGETS.includes(targetType) || typeof targetId !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid report target.' });
  }
  if (!REASONS.includes(reason)) return res.status(400).json({ success: false, error: 'Please choose a reason.' });

  const info = describe(targetType, targetId, typeof parentId === 'string' ? parentId : undefined);
  if (!info) return res.status(404).json({ success: false, error: 'That content no longer exists.' });
  if (info.ownerId === me.id) return res.status(400).json({ success: false, error: "You can't report your own content." });

  const duplicate = Array.from(db.reports.values()).find(
    (r) => r.reporterId === me.id && r.targetId === targetId && r.status === 'open'
  );
  if (duplicate) return res.json({ success: true, message: 'You already reported this. Our team is reviewing it.' });

  const report: Report = {
    id: newId('rpt'),
    reporterId: me.id,
    reporterName: me.fullName,
    targetType,
    targetId,
    parentId: typeof parentId === 'string' ? parentId : undefined,
    targetOwnerId: info.ownerId,
    reason,
    details: typeof details === 'string' ? details.trim().slice(0, 1000) : '',
    snapshot: info.snapshot,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  db.reports.set(report.id, report);
  realtime.broadcastAdmins({ type: 'NEW_REPORT', payload: { id: report.id, reason, targetType } });
  realtime.refreshAdmins();
  res.status(201).json({ success: true, message: 'Thanks for reporting. Our safety team will review it within 24 hours.' });
});

router.get('/reasons', (_req, res) => res.json({ success: true, reasons: REASONS }));

export default router;
