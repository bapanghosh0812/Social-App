import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { notifications } from '../services/notify.js';
import { messaging } from '../services/messaging.js';
import { db } from '../db/database.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  res.json({
    success: true,
    notifications: notifications.list(userId),
    unreadCount: notifications.unreadCount(userId),
    pendingRequests: db.follows.pendingRequestIds(userId).length,
  });
});

/** Badge counts for the header (notifications + unread chats). */
router.get('/counts', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  res.json({
    success: true,
    notifications: notifications.unreadCount(userId),
    messages: messaging.totalUnread(userId),
  });
});

router.post('/read-all', (req: AuthenticatedRequest, res) => {
  notifications.markAllRead(req.user!.id);
  res.json({ success: true });
});

router.post('/:id/read', (req: AuthenticatedRequest, res) => {
  notifications.markRead(req.user!.id, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  notifications.delete(req.user!.id, req.params.id);
  res.json({ success: true });
});

export default router;
