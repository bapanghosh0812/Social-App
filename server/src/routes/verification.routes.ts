import { Router } from 'express';
import { db } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { accountLimiter } from '../middleware/rateLimits.js';
import { VerificationDocument } from '../types/index.js';
import { storage } from '../services/s3.service.js';
import { realtime } from '../websocket/realtime.js';
import { newId } from '../services/present.js';
import { logger } from '../config/logger.js';

const router = Router();

const STUDENT_DOCS = ['fees_receipt', 'marksheet', 'admission_letter', 'id_card'];
const FACULTY_DOCS = ['faculty_id', 'appointment_letter', 'id_card'];
const ALLOWED_DOC_TYPES = [...STUDENT_DOCS, ...FACULTY_DOCS];
const submitLimiter = accountLimiter(60 * 60 * 1000, 10, 'Too many submissions. Please try again later.');

/**
 * Submit a verification document for human review. The document must be a
 * private upload (never publicly reachable). Accounts stay "Pending" until an
 * admin approves.
 */
router.post('/upload-and-verify', submitLimiter, requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const { documentType, documentUrl, academicYear } = req.body || {};

  const allowed = user.role === 'faculty' ? FACULTY_DOCS : STUDENT_DOCS;
  if (!ALLOWED_DOC_TYPES.includes(documentType) || !allowed.includes(documentType)) {
    return res.status(400).json({ success: false, error: 'Please choose a valid document type.' });
  }
  if (!storage.privateKeyFrom(documentUrl)) {
    return res.status(400).json({ success: false, error: 'Please upload your document first.' });
  }
  if (!user.collegeId) {
    return res.status(400).json({ success: false, error: 'Complete your college selection before verifying.' });
  }
  if (user.verificationStatus === 'Verified Member') {
    return res.status(400).json({ success: false, error: 'Your account is already verified.' });
  }
  if (typeof academicYear === 'string' && /^\d{4}-\d{4}$/.test(academicYear)) user.academicYear = academicYear;

  // Only one pending submission per person — replace any older one.
  for (const d of db.verificationDocuments.values()) {
    if (d.userId === user.id && d.status === 'Pending') db.verificationDocuments.delete(d.id);
  }

  const doc: VerificationDocument = {
    id: newId('vdoc'),
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    userPhone: user.phoneNumber,
    collegeName: user.collegeName || '',
    documentType,
    documentUrl,
    fuzzyScore: 0,
    status: 'Pending',
    submittedAt: new Date().toISOString(),
  };
  db.verificationDocuments.set(doc.id, doc);

  user.verificationStatus = 'Pending';
  user.verificationDocumentType = documentType;
  user.updatedAt = new Date().toISOString();
  db.users.set(user.id, user);

  realtime.broadcastAdmins({ type: 'NEW_PENDING_DOCUMENT', payload: { id: doc.id, userName: doc.userName } });
  realtime.refreshAdmins();
  logger.info(`Verification submitted for review: ${user.id} (${doc.id})`);

  res.json({
    success: true,
    message: 'Document submitted for review. Your account is marked Pending — a reviewer will verify it shortly.',
    data: { documentId: doc.id, status: 'Pending' },
  });
});

/** Current verification status for the signed-in user. */
router.get('/status', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const latest = Array.from(db.verificationDocuments.values())
    .filter((d) => d.userId === user.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];

  res.json({
    success: true,
    verificationStatus: user.verificationStatus,
    document: latest
      ? {
          id: latest.id,
          documentType: latest.documentType,
          status: latest.status,
          submittedAt: latest.submittedAt,
          reviewedAt: latest.reviewedAt,
          rejectionReason: latest.rejectionReason,
        }
      : null,
    isPostingAllowed: user.verificationStatus === 'Verified Member',
  });
});

export default router;
