import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { accountLimiter } from '../middleware/rateLimits.js';
import { SupportTicket } from '../types/index.js';
import { storage } from '../services/s3.service.js';
import { realtime } from '../websocket/realtime.js';
import { logger } from '../config/logger.js';

const router = Router();
const ticketLimiter = accountLimiter(60 * 60 * 1000, 15, 'Too many tickets. Please try again later.');

const CATEGORIES = ['Bug', 'Account', 'Verification', 'Harassment', 'Feature', 'Fraud / Scam Report', 'General Query'];
const PRIORITIES: SupportTicket['priority'][] = ['Low', 'Medium', 'High', 'Critical'];

/** Submit a support ticket / bug report / safety report. */
router.post('/tickets', ticketLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { category, subject, description, screenshotUrl, priority } = req.body || {};

  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanDescription = typeof description === 'string' ? description.trim() : '';
  if (!cleanSubject || !cleanDescription) {
    return res.status(400).json({ success: false, error: 'Subject and description are required.' });
  }
  if (cleanSubject.length > 200 || cleanDescription.length > 5000) {
    return res.status(400).json({ success: false, error: 'Subject or description is too long.' });
  }

  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: `TCK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    category: CATEGORIES.includes(category) ? category : 'General Query',
    subject: cleanSubject,
    description: cleanDescription,
    screenshotUrl: storage.isOwnPublicUrl(screenshotUrl, ['posts']) ? screenshotUrl : undefined,
    priority: PRIORITIES.includes(priority) ? priority : 'Medium',
    status: 'Open',
    createdAt: now,
    updatedAt: now,
  };
  db.supportTickets.set(ticket.id, ticket);
  realtime.refreshAdmins();
  logger.info(`Support ticket ${ticket.id} [${ticket.category}] by ${user.id}`);

  res.status(201).json({ success: true, message: 'Support ticket submitted. Our team will respond soon.', ticket });
});

/** The current user's tickets. */
router.get('/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
  const tickets = Array.from(db.supportTickets.values())
    .filter((t) => t.userId === req.user!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, tickets });
});

export default router;
