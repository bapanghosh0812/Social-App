import { Router } from 'express';
import { db } from '../db/database.js';
import {
  requireAuth,
  requireAdmin,
  requireAdminPin,
  AuthenticatedRequest,
} from '../middleware/authMiddleware.js';
import { adminLimiter } from '../middleware/rateLimits.js';
import { changeAdminPin } from '../config/adminSecrets.js';
import { logger } from '../config/logger.js';
import { storage } from '../services/s3.service.js';
import { notifications } from '../services/notify.js';
import { realtime } from '../websocket/realtime.js';
import { miniUser, newId } from '../services/present.js';
import { ClubHighlight, NoticeItem, PinnedCollegeFeed, PlanningItem } from '../types/index.js';

/**
 * Admin console API. Every route requires: a signed-in account listed in
 * ADMIN_EMAILS + the 6-digit admin PIN (x-admin-pin), and is rate-limited.
 */
const router = Router();
router.use(adminLimiter, requireAuth, requireAdmin);

/** Verify the PIN (used by the console unlock screen). Wrong PINs lock out. */
router.post('/unlock', requireAdminPin, (_req, res) => {
  res.json({ success: true });
});

router.use(requireAdminPin);

router.get('/stats', (_req, res) => {
  res.json({
    success: true,
    stats: {
      users: db.users.size,
      verifiedMembers: Array.from(db.users.values()).filter((u) => u.verificationStatus === 'Verified Member').length,
      posts: db.posts.size,
      reels: db.reels.size,
      pendingVerifications: Array.from(db.verificationDocuments.values()).filter((d) => d.status === 'Pending').length,
      openReports: Array.from(db.reports.values()).filter((r) => r.status === 'open').length,
      openTickets: Array.from(db.supportTickets.values()).filter((t) => t.status !== 'Resolved').length,
    },
  });
});

// --- Verification review ---
router.get('/verifications', async (_req, res) => {
  const pending = Array.from(db.verificationDocuments.values())
    .filter((d) => d.status === 'Pending')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const documents = await Promise.all(
    pending.map(async (d) => {
      const key = storage.privateKeyFrom(d.documentUrl);
      return {
        ...d,
        documentUrl: undefined,
        documentViewUrl: key ? await storage.privateViewUrl(key) : null,
        isPdf: Boolean(key?.endsWith('.pdf')),
      };
    })
  );
  res.json({ success: true, count: documents.length, documents });
});

function setVerification(documentId: string, approve: boolean, reason: string, reviewer: string): boolean {
  const doc = db.verificationDocuments.get(documentId);
  if (!doc || doc.status !== 'Pending') return false;
  doc.status = approve ? 'Verified Member' : 'Rejected';
  doc.reviewedAt = new Date().toISOString();
  doc.reviewedBy = reviewer;
  if (!approve) doc.rejectionReason = reason;
  db.verificationDocuments.set(doc.id, doc);

  const user = db.users.get(doc.userId);
  if (user) {
    user.verificationStatus = approve ? 'Verified Member' : 'Rejected';
    user.updatedAt = new Date().toISOString();
    db.users.set(user.id, user);
    const message = approve
      ? 'Your student verification was approved. You can now post, comment, go live and more!'
      : `Verification could not be approved: ${reason}. Please upload a clearer document.`;
    realtime.sendToUser(user.id, {
      type: 'VERIFICATION_STATUS_UPDATED',
      payload: { status: user.verificationStatus, reason: approve ? undefined : reason, message },
    });
    notifications.create(user.id, {
      type: 'verification',
      title: approve ? 'You are verified' : 'Verification rejected',
      message,
    });
  }
  realtime.refreshAdmins();
  return true;
}

router.post('/verifications/:id/approve', (req: AuthenticatedRequest, res) => {
  if (!setVerification(req.params.id, true, '', req.user!.fullName)) {
    return res.status(404).json({ success: false, error: 'Document not found or already processed.' });
  }
  res.json({ success: true, message: 'Approved — member is now Verified.' });
});

router.post('/verifications/:id/reject', (req: AuthenticatedRequest, res) => {
  const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
    ? req.body.reason.trim().slice(0, 300)
    : 'Document could not be verified';
  if (!setVerification(req.params.id, false, reason, req.user!.fullName)) {
    return res.status(404).json({ success: false, error: 'Document not found or already processed.' });
  }
  res.json({ success: true, message: 'Rejected and the applicant has been notified.' });
});

// --- Reports moderation ---
router.get('/reports', (req, res) => {
  const status = req.query.status === 'all' ? null : 'open';
  const reports = Array.from(db.reports.values())
    .filter((r) => !status || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...r, owner: r.targetOwnerId ? miniUser(db.users.get(r.targetOwnerId)) : null }));
  res.json({ success: true, reports });
});

router.post('/reports/:id/:action(remove|dismiss)', (req: AuthenticatedRequest, res) => {
  const report = db.reports.get(req.params.id);
  if (!report || report.status !== 'open') return res.status(404).json({ success: false, error: 'Report not found.' });

  if (req.params.action === 'remove') {
    const { targetType, targetId, parentId } = report;
    if (targetType === 'post') db.deletePost(targetId);
    else if (targetType === 'reel') db.deleteReel(targetId);
    else if (targetType === 'story') db.deleteStory(targetId);
    else if (targetType === 'comment' && parentId) {
      const list = db.comments.get(parentId) || [];
      db.comments.set(parentId, list.filter((c) => c.id !== targetId));
    } else if (targetType === 'user') {
      realtime.disconnectUser(targetId);
      const u = db.users.get(targetId);
      if (u && !u.isDemo) db.deleteUser(targetId);
    }
    if (report.targetOwnerId && targetType !== 'user') {
      notifications.create(report.targetOwnerId, {
        type: 'system',
        title: 'Content removed',
        message: `Your ${targetType} was removed for violating community guidelines (${report.reason}).`,
      });
    }
  }
  // Close every open report about the same target.
  for (const r of db.reports.values()) {
    if (r.targetId === report.targetId && r.status === 'open') {
      db.reports.set(r.id, {
        ...r,
        status: req.params.action === 'remove' ? 'actioned' : 'dismissed',
        resolvedAt: new Date().toISOString(),
      });
    }
  }
  logger.info(`Report ${report.id} ${req.params.action} by admin ${req.user!.id}`);
  realtime.refreshAdmins();
  res.json({ success: true });
});

// --- Support tickets ---
router.get('/tickets', (_req, res) => {
  const tickets = Array.from(db.supportTickets.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, tickets });
});

router.patch('/tickets/:id', (req, res) => {
  const t = db.supportTickets.get(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Ticket not found.' });
  const { status, adminNote } = req.body || {};
  if (['Open', 'Investigating', 'Resolved'].includes(status)) t.status = status;
  if (typeof adminNote === 'string') t.adminNote = adminNote.trim().slice(0, 1000);
  t.updatedAt = new Date().toISOString();
  db.supportTickets.set(t.id, t);
  notifications.create(t.userId, {
    type: 'system',
    title: `Ticket ${t.id}: ${t.status}`,
    message: t.adminNote ? `Support replied: ${t.adminNote.slice(0, 140)}` : `Your ticket "${t.subject}" is now ${t.status}.`,
  });
  res.json({ success: true, ticket: t });
});

// --- Campus hub content (notices, events, clubs) ---
function pinnedFor(collegeId: string): PinnedCollegeFeed | null {
  const college = db.colleges.get(collegeId);
  if (!college) return null;
  return (
    db.pinnedFeeds.get(collegeId) || {
      collegeId,
      collegeName: college.name,
      shortCode: college.shortCode,
      announcementsCount: 0,
      noticeBoard: [],
      todaysPlanning: [],
      clubHighlights: [],
    }
  );
}

router.post('/colleges/:collegeId/pinned', (req, res) => {
  const feed = pinnedFor(req.params.collegeId);
  if (!feed) return res.status(404).json({ success: false, error: 'College not found.' });
  const { section, item } = req.body || {};
  const str = (v: unknown, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (!item || typeof item !== 'object') return res.status(400).json({ success: false, error: 'Missing item.' });

  if (section === 'noticeBoard') {
    const categories: NoticeItem['category'][] = ['Exam', 'Fest', 'Holiday', 'Placement', 'Urgent'];
    const notice: NoticeItem = {
      id: newId('ntc'),
      title: str(item.title),
      category: categories.includes(item.category) ? item.category : 'Urgent',
      publishedAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      attachmentUrl: str(item.attachmentUrl, 500).startsWith('https://') ? str(item.attachmentUrl, 500) : undefined,
      isPinned: true,
    };
    if (!notice.title) return res.status(400).json({ success: false, error: 'Title is required.' });
    feed.noticeBoard.unshift(notice);
  } else if (section === 'todaysPlanning') {
    const plan: PlanningItem = {
      id: newId('evt'),
      title: str(item.title),
      time: str(item.time, 40),
      location: str(item.location, 80),
      organizer: str(item.organizer, 80),
      badge: str(item.badge, 24) || 'Event',
    };
    if (!plan.title) return res.status(400).json({ success: false, error: 'Title is required.' });
    feed.todaysPlanning.unshift(plan);
  } else if (section === 'clubHighlights') {
    const club: ClubHighlight = {
      id: newId('club'),
      clubName: str(item.clubName, 80),
      eventTitle: str(item.eventTitle),
      imageUrl: storage.isOwnPublicUrl(item.imageUrl, ['posts']) ? item.imageUrl : '',
      timeAgo: 'Just now',
    };
    if (!club.clubName) return res.status(400).json({ success: false, error: 'Club name is required.' });
    feed.clubHighlights.unshift(club);
  } else {
    return res.status(400).json({ success: false, error: 'Unknown section.' });
  }
  feed.announcementsCount = feed.noticeBoard.length;
  db.pinnedFeeds.set(feed.collegeId, feed);
  res.status(201).json({ success: true, data: feed });
});

router.delete('/colleges/:collegeId/pinned/:section/:itemId', (req, res) => {
  const feed = pinnedFor(req.params.collegeId);
  const section = req.params.section as 'noticeBoard' | 'todaysPlanning' | 'clubHighlights';
  if (!feed || !['noticeBoard', 'todaysPlanning', 'clubHighlights'].includes(section)) {
    return res.status(404).json({ success: false, error: 'Not found.' });
  }
  const keep = (i: { id: string }) => i.id !== req.params.itemId;
  if (section === 'noticeBoard') feed.noticeBoard = feed.noticeBoard.filter(keep);
  else if (section === 'todaysPlanning') feed.todaysPlanning = feed.todaysPlanning.filter(keep);
  else feed.clubHighlights = feed.clubHighlights.filter(keep);
  feed.announcementsCount = feed.noticeBoard.length;
  db.pinnedFeeds.set(feed.collegeId, feed);
  res.json({ success: true, data: feed });
});

// --- Recruiter approval ---
router.post('/recruiters/:userId/verify', (req, res) => {
  const u = db.users.get(req.params.userId);
  if (!u || u.role !== 'recruiter') return res.status(404).json({ success: false, error: 'Recruiter not found.' });
  u.isCorporateVerified = true;
  u.mcaStatus = 'verified';
  db.users.set(u.id, u);
  for (const j of db.jobs.values()) if (j.recruiterId === u.id) db.jobs.set(j.id, { ...j, isCorporateVerified: true });
  notifications.create(u.id, { type: 'system', title: 'Company verified', message: 'Your recruiter account is now verified.' });
  res.json({ success: true });
});

/** Rotate the admin PIN (needs current PIN + OWNER_SECRET). */
router.post('/change-pin', (req: AuthenticatedRequest, res) => {
  const { oldPin, ownerSecret, newPin, confirmNewPin } = req.body || {};
  const result = changeAdminPin(oldPin, ownerSecret, newPin, confirmNewPin);
  if (!result.ok) return res.status(403).json({ success: false, error: result.error });
  logger.info(`Admin PIN updated by ${req.user!.id}`);
  res.json({ success: true, message: 'Admin PIN updated successfully.' });
});

export default router;
