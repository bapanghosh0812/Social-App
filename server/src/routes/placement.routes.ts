import { Router, Request, Response } from 'express';
import { JobPosting } from '../types/index.js';
import { db } from '../db/database.js';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { publishLimiter } from '../middleware/rateLimits.js';
import { normalizeEmail } from '../config/auth.js';
import { logger } from '../config/logger.js';
import { notifications } from '../services/notify.js';
import { newId } from '../services/present.js';

const router = Router();

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.in', 'hotmail.com', 'outlook.com', 'live.com', 'rediffmail.com',
  'aol.com', 'mail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'zoho.com', 'yandex.com', 'gmx.com',
]);
const JOB_TYPES: JobPosting['jobType'][] = ['Full-Time', 'Internship', 'Non-Profit'];

/** List placements & internships (public), with the viewer's applied state. */
router.get('/jobs', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const typeFilter = typeof req.query.type === 'string' ? req.query.type : '';
  const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().slice(0, 80) : '';
  const mine = req.query.mine === 'true' && req.user;

  let jobs = Array.from(db.jobs.values());
  if (mine) jobs = jobs.filter((j) => j.recruiterId === req.user!.id);
  if (typeFilter && typeFilter !== 'All') jobs = jobs.filter((j) => j.jobType.toLowerCase() === typeFilter.toLowerCase());
  if (search) {
    jobs = jobs.filter(
      (j) =>
        j.jobTitle.toLowerCase().includes(search) ||
        j.companyName.toLowerCase().includes(search) ||
        (j.tags || []).some((t) => t.toLowerCase().includes(search))
    );
  }
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    success: true,
    count: jobs.length,
    jobs: jobs.map((j) => ({
      ...j,
      applicationCount: db.jobApplications.count(j.id),
      hasApplied: req.user ? db.jobApplications.has(req.user.id, j.id) : false,
      isMine: req.user?.id === j.recruiterId,
    })),
  });
});

/** Validate the FORMAT of an Indian GSTIN / CIN (not a registry lookup). */
router.post('/verify-corporate', requireAuth, (req: Request, res: Response) => {
  const { corporateTaxId, companyName } = req.body || {};
  if (typeof corporateTaxId !== 'string' || typeof companyName !== 'string' || !corporateTaxId || !companyName) {
    return res.status(400).json({ success: false, error: 'Corporate Tax ID (GSTIN / CIN) and company name are required.' });
  }
  const clean = corporateTaxId.trim().toUpperCase();
  const isGstin = GSTIN_RE.test(clean);
  if (!isGstin && !CIN_RE.test(clean)) {
    return res.status(400).json({ success: false, error: 'Invalid format. Provide a valid 15-character GSTIN or 21-character CIN.' });
  }
  res.json({
    success: true,
    validFormat: true,
    data: { taxId: clean, idType: isGstin ? 'GSTIN' : 'CIN' },
    message: 'Tax ID format is valid. Final verification is completed by the campus team before your badge appears.',
  });
});

/** Publish a placement (recruiters only; official company email required). */
router.post('/jobs', publishLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const canPost = user.role === 'recruiter' || (user.role === 'faculty' && user.verificationStatus === 'Verified Member') || user.isAdmin;
  if (!canPost) {
    return res.status(403).json({ success: false, error: 'Only verified faculty (e.g. placement officers) can publish opportunities.' });
  }
  const b = req.body || {};
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const officialEmail = normalizeEmail(b.officialCompanyEmail);
  if (!officialEmail) return res.status(400).json({ success: false, error: 'A valid official company email is required.' });
  const domain = officialEmail.split('@')[1];
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return res.status(400).json({
      success: false,
      error: `Fraud guard: free email domains (@${domain}) can't be used for job postings. Use your company domain.`,
    });
  }
  // Company recruiters must use their own domain; faculty post on behalf of hiring companies.
  const recruiterDomain = (user.corporateEmail || user.email).split('@')[1];
  if (user.role === 'recruiter' && recruiterDomain && domain !== recruiterDomain && !domain.endsWith(`.${recruiterDomain}`)) {
    return res.status(400).json({ success: false, error: `The application email must be on your company domain (@${recruiterDomain}).` });
  }

  const job: JobPosting = {
    id: newId('job'),
    recruiterId: user.id,
    recruiterName: user.fullName,
    recruiterAvatar: user.avatarUrl,
    companyName: str(b.companyName, 120) || user.companyName || '',
    companyLogo: '',
    corporateTaxId: str(b.corporateTaxId, 25).toUpperCase() || user.corporateTaxId || '',
    isCorporateVerified: Boolean(user.isCorporateVerified),
    jobTitle: str(b.jobTitle, 120),
    jobType: JOB_TYPES.includes(b.jobType) ? b.jobType : 'Full-Time',
    location: str(b.location, 80) || 'Hybrid / Remote',
    salaryBracket: str(b.salaryBracket, 60),
    detailedRequirements: str(b.detailedRequirements, 4000),
    officialCompanyEmail: officialEmail,
    eligibleBatches: str(b.eligibleBatches, 80) || 'All verified batches',
    tags: Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10).map((t: string) => t.trim().slice(0, 30)) : [],
    applicationCount: 0,
    deadline: str(b.deadline, 20),
    createdAt: new Date().toISOString(),
  };

  if (!job.companyName || !job.jobTitle || !job.salaryBracket || !job.detailedRequirements) {
    return res.status(400).json({ success: false, error: 'Company, job title, salary and requirements are required.' });
  }
  if (/unpaid/i.test(job.salaryBracket) && job.jobType !== 'Non-Profit') {
    return res.status(400).json({
      success: false,
      error: 'Student protection: unpaid commercial internships are not allowed. Offer a stipend or mark the role Non-Profit.',
    });
  }

  db.jobs.set(job.id, job);
  logger.info(`New placement published: ${job.id} by ${user.id}`);
  res.status(201).json({ success: true, message: 'Placement published.', job });
});

/** Record an application and hand back the recruiter's mail link. */
router.post('/jobs/:jobId/apply', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const job = db.jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'This opening is no longer available.' });
  if (job.recruiterId === user.id) return res.status(400).json({ success: false, error: "You can't apply to your own opening." });

  const isNew = db.jobApplications.add(user.id, job.id);
  if (isNew) {
    notifications.create(job.recruiterId, {
      type: 'job',
      actorId: user.id,
      targetType: 'job',
      targetId: job.id,
      title: 'New applicant',
      message: `${user.fullName} (${user.collegeName || 'student'}) applied for ${job.jobTitle}.`,
    });
  }
  const subject = encodeURIComponent(`Application: ${job.jobTitle} — ${user.fullName}`);
  const body = encodeURIComponent(
    `Hello ${job.companyName} team,\n\nI'd like to apply for the ${job.jobTitle} role.\n\nName: ${user.fullName}\nCollege: ${user.collegeName || '-'}\nBatch: ${user.academicYear || '-'}\nEmail: ${user.email}\n\nThank you!`
  );
  res.json({
    success: true,
    applied: true,
    applicationCount: db.jobApplications.count(job.id),
    mailto: `mailto:${job.officialCompanyEmail}?subject=${subject}&body=${body}`,
  });
});

router.delete('/jobs/:jobId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const job = db.jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found.' });
  if (job.recruiterId !== req.user!.id && !req.user!.isAdmin) {
    return res.status(403).json({ success: false, error: 'You can only remove your own postings.' });
  }
  db.jobs.delete(job.id);
  res.json({ success: true });
});

export default router;
