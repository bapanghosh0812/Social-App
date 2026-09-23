import { Router, Response } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/database.js';
import { meta, passwordResets } from '../db/sqlite.js';
import { User, Gender, UserRole } from '../types/index.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import {
  hashPassword,
  verifyPassword,
  issueToken,
  validatePassword,
  normalizeEmail,
  unusablePasswordHash,
  sha256,
} from '../config/auth.js';
import { selfUser, newId } from '../services/present.js';
import { mailer } from '../services/mailer.js';
import { realtime } from '../websocket/realtime.js';
import { isAdminConsoleEnabled } from '../config/adminSecrets.js';

const router = Router();
const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

const GENDERS: Gender[] = ['Male', 'Female', 'Other', 'Prefer not to say'];
const RESET_TTL_MS = 30 * 60 * 1000;

// --- Per-account brute-force protection (in addition to the per-IP limiter) ---
const failedLogins = new Map<string, { count: number; lockedUntil: number; first: number }>();
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;

function isLocked(email: string): number {
  const entry = failedLogins.get(email);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (Date.now() - entry.first > LOCK_MS) failedLogins.delete(email);
  return 0;
}
function recordFailure(email: string) {
  const entry = failedLogins.get(email) || { count: 0, lockedUntil: 0, first: Date.now() };
  entry.count += 1;
  if (entry.count >= MAX_FAILS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
    entry.first = Date.now();
    logger.warn(`Account temporarily locked after repeated failed sign-ins: ${email}`);
  }
  failedLogins.set(email, entry);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failedLogins) if (v.lockedUntil < now && now - v.first > LOCK_MS) failedLogins.delete(k);
}, 10 * 60 * 1000).unref();

function sessionResponse(res: Response, user: User, status = 200, extra: Record<string, unknown> = {}) {
  const { token, expiresAt } = issueToken({ sub: user.id, email: user.email, tv: user.tokenVersion || 0 });
  res.status(status).json({
    success: true,
    token,
    sessionExpiresAt: expiresAt,
    user: selfUser(user),
    requiresOnboarding: !user.isProfileComplete,
    ...extra,
  });
}

function newUser(fullName: string, email: string, provider: User['authProvider']): User {
  const now = new Date().toISOString();
  return {
    id: newId('usr'),
    fullName,
    email,
    phoneNumber: '',
    avatarUrl: '',
    isCollegeLocked: false,
    verificationStatus: 'Guest',
    authProvider: provider,
    isProfileComplete: false,
    isPrivate: false,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    collegeNotificationsEnabled: {},
    globalNotificationsEnabled: true,
    tokenVersion: 0,
  };
}

/** Public, non-sensitive feature flags for the sign-in screen. */
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    demoMode: env.demoMode,
    googleClientId: env.googleClientId || null,
    passwordReset: true,
    emailDelivery: mailer.isConfigured,
    adminConsole: isAdminConsoleEnabled(),
  });
});

/** Create a new account (email + password). */
router.post('/register', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
  const password = req.body?.password;

  if (!email) return res.status(400).json({ success: false, error: 'A valid email address is required.' });
  if (fullName.length < 2 || fullName.length > 80) {
    return res.status(400).json({ success: false, error: 'Please enter your full name.' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ success: false, error: pwError });

  if (db.credentials.exists(email)) {
    return res.status(409).json({ success: false, error: 'An account with this email already exists. Please sign in.' });
  }

  const user = newUser(fullName, email, 'password');
  const passwordHash = await hashPassword(password);
  db.users.set(user.id, user);
  db.credentials.create(email, user.id, passwordHash);
  logger.info(`New account registered: ${user.id}`);
  sessionResponse(res, user, 201, { isNewUser: true });
});

/** Sign in with email + password. */
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const invalid = () => res.status(401).json({ success: false, error: 'Invalid email or password.' });

  if (!email || typeof password !== 'string' || !password || password.length > 128) return invalid();

  const lockedFor = isLocked(email);
  if (lockedFor) {
    return res.status(429).json({
      success: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60000)} minute(s) or reset your password.`,
    });
  }

  const cred = db.credentials.findByEmail(email);
  if (!cred) {
    // Dummy comparison keeps response timing similar for unknown emails.
    await verifyPassword(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    recordFailure(email);
    return invalid();
  }

  const ok = await verifyPassword(password, cred.passwordHash);
  if (!ok) {
    recordFailure(email);
    return invalid();
  }
  failedLogins.delete(email);

  const user = db.users.get(cred.userId);
  if (!user) return invalid();
  user.lastActiveAt = new Date().toISOString();
  db.users.set(user.id, user);
  sessionResponse(res, user, 200, { isNewUser: false });
});

/** One-tap demo sign-in (only when DEMO_MODE=true). */
router.post('/demo', (_req, res) => {
  if (!env.demoMode) return res.status(404).json({ success: false, error: 'Demo mode is disabled.' });
  const demoId = meta.get('demo_primary_user');
  const user = demoId ? db.users.get(demoId) : undefined;
  if (!user) return res.status(503).json({ success: false, error: 'Demo data is still being prepared. Try again.' });
  user.lastActiveAt = new Date().toISOString();
  db.users.set(user.id, user);
  sessionResponse(res, user, 200, { isNewUser: false, isDemo: true });
});

/** Google sign-in (active when GOOGLE_CLIENT_ID is configured). */
router.post('/google', async (req, res) => {
  if (!googleClient) return res.status(404).json({ success: false, error: 'Google sign-in is not configured.' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length > 4096) {
    return res.status(400).json({ success: false, error: 'Missing Google credential.' });
  }
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    if (!payload || !email || !payload.email_verified) {
      return res.status(401).json({ success: false, error: 'Your Google email is not verified.' });
    }
    const existing = db.credentials.findByEmail(email);
    let user = existing ? db.users.get(existing.userId) : undefined;
    let isNewUser = false;
    if (!user) {
      user = newUser((payload.name || email.split('@')[0]).slice(0, 80), email, 'google');
      if (payload.picture && payload.picture.startsWith('https://')) user.avatarUrl = payload.picture;
      db.users.set(user.id, user);
      db.credentials.create(email, user.id, await unusablePasswordHash());
      isNewUser = true;
    }
    user.lastActiveAt = new Date().toISOString();
    db.users.set(user.id, user);
    sessionResponse(res, user, isNewUser ? 201 : 200, { isNewUser });
  } catch (err) {
    logger.warn('Google sign-in rejected', { error: String(err) });
    res.status(401).json({ success: false, error: 'Google sign-in failed. Please try again.' });
  }
});

/** Current session profile (also refreshes last-active, throttled). */
router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  if (Date.now() - last > 60 * 60 * 1000) {
    user.lastActiveAt = new Date().toISOString();
    db.users.set(user.id, user);
  }
  res.json({ success: true, user: selfUser(user) });
});

/** Stateless logout for this device (client discards its token). */
router.post('/logout', (_req, res) => {
  res.json({ success: true });
});

/** Revoke every session on every device. */
router.post('/logout-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  db.users.set(user.id, user);
  realtime.disconnectUser(user.id);
  res.json({ success: true, message: 'Signed out of all devices.' });
});

/** Change password (requires the current one) — revokes other sessions. */
router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const { currentPassword, newPassword } = req.body || {};
  const cred = db.credentials.findByEmail(user.email);
  if (!cred) return res.status(400).json({ success: false, error: 'No password is set for this account.' });

  if (user.authProvider !== 'google' || typeof currentPassword === 'string') {
    const ok = typeof currentPassword === 'string' && (await verifyPassword(currentPassword, cred.passwordHash));
    if (!ok) return res.status(403).json({ success: false, error: 'Current password is incorrect.' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ success: false, error: pwError });

  db.credentials.updatePassword(user.email, await hashPassword(newPassword));
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  if (user.authProvider === 'google') user.authProvider = 'password';
  db.users.set(user.id, user);
  realtime.disconnectUser(user.id);
  sessionResponse(res, user, 200, { message: 'Password updated. Other devices were signed out.' });
});

/** Start a password reset. Always answers the same way (no account enumeration). */
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const generic = {
    success: true,
    message: 'If an account exists for that email, a reset link has been sent. It expires in 30 minutes.',
  };
  if (!email) return res.json(generic);

  const cred = db.credentials.findByEmail(email);
  const user = cred ? db.users.get(cred.userId) : undefined;
  if (user && !user.isDemo) {
    const token = crypto.randomBytes(32).toString('base64url');
    passwordResets.create(sha256(token), user.id, RESET_TTL_MS);
    const link = `${env.appUrl}/?reset=${encodeURIComponent(token)}`;
    await mailer.send(
      email,
      'Reset your College Campus password',
      `Hi ${user.fullName},\n\nUse this link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
      `<p>Hi ${user.fullName.replace(/[<>&"]/g, '')},</p><p>Use the button below to set a new password. The link is valid for 30 minutes.</p><p><a href="${link}" style="background:#C9A45C;color:#111;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p><p>If you didn't ask for this, you can ignore this email.</p>`
    );
  }
  res.json(generic);
});

/** Complete a password reset with the emailed token. */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return res.status(400).json({ success: false, error: 'This reset link is invalid.' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ success: false, error: pwError });

  const userId = passwordResets.consume(sha256(token));
  const user = userId ? db.users.get(userId) : undefined;
  if (!user) return res.status(400).json({ success: false, error: 'This reset link is invalid or has expired.' });

  db.credentials.updatePassword(user.email, await hashPassword(newPassword));
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  db.users.set(user.id, user);
  failedLogins.delete(user.email);
  realtime.disconnectUser(user.id);
  sessionResponse(res, user, 200, { message: 'Password reset. You are now signed in.' });
});

/** Permanently delete the signed-in account (type your email to confirm). */
router.delete('/account', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.isDemo) {
    return res.status(403).json({ success: false, error: 'Demo accounts cannot be deleted.' });
  }
  const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation.trim().toLowerCase() : '';
  if (confirmation !== user.email.toLowerCase()) {
    return res.status(400).json({ success: false, error: 'Please type your exact email address to confirm deletion.' });
  }
  realtime.disconnectUser(user.id);
  db.deleteUser(user.id);
  res.json({ success: true, message: 'Your account and all associated data have been permanently deleted.' });
});

/** Complete progressive onboarding for the signed-in account only. */
router.post('/onboarding', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = db.users.get(req.user!.id)!;
  const { role, fullName, gender, phoneNumber, collegeId, academicYear, companyName, corporateEmail, corporateTaxId, designation, department, headline } =
    req.body || {};

  const userRole: UserRole = role === 'recruiter' ? 'recruiter' : role === 'faculty' ? 'faculty' : 'student';
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  if (typeof phoneNumber === 'string' && phoneNumber.trim()) {
    const cleanPhone = phoneNumber.trim().replace(/[^\d+ -]/g, '').slice(0, 20);
    if (cleanPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid phone number.' });
    }
    user.phoneNumber = cleanPhone;
  }
  if (typeof fullName === 'string' && fullName.trim().length >= 2) user.fullName = fullName.trim().slice(0, 80);

  if (userRole === 'recruiter') {
    if (typeof companyName !== 'string' || !companyName.trim() || typeof designation !== 'string' || !designation.trim()) {
      return res.status(400).json({ success: false, error: 'Company name and designation are required for recruiters.' });
    }
    const corpEmail = normalizeEmail(corporateEmail) || user.email;
    user.role = 'recruiter';
    user.companyName = companyName.trim().slice(0, 120);
    user.corporateEmail = corpEmail;
    user.designation = designation.trim().slice(0, 80);
    user.corporateTaxId = typeof corporateTaxId === 'string' ? corporateTaxId.trim().toUpperCase().slice(0, 25) : undefined;
    user.isCorporateVerified = false; // final corporate verification is a manual admin step
    user.mcaStatus = 'pending';
    user.isProfileComplete = true;
    user.updatedAt = new Date().toISOString();
    db.users.set(user.id, user);
    logger.info(`Recruiter onboarding complete: ${user.id}`);
    return res.json({ success: true, message: 'Recruiter profile completed.', user: selfUser(user) });
  }

  if (user.isCollegeLocked && user.collegeId && collegeId && user.collegeId !== collegeId) {
    return res.status(403).json({
      success: false,
      error: 'Your primary college is permanently locked and cannot be changed.',
      code: 'COLLEGE_IMMUTABLY_LOCKED',
    });
  }
  if (typeof collegeId !== 'string' || !collegeId) {
    return res.status(400).json({ success: false, error: 'Please select your college.' });
  }
  const college = db.colleges.get(collegeId);
  if (!college) return res.status(400).json({ success: false, error: 'Selected college was not found.' });

  if (userRole === 'faculty') {
    const dept = clean(department, 80);
    const title = clean(designation, 80);
    if (!dept || !title) {
      return res.status(400).json({ success: false, error: 'Please add your department and designation.' });
    }
    user.department = dept;
    user.designation = title;
    user.academicYear = undefined;
  } else {
    if (typeof academicYear === 'string' && /^\d{4}-\d{4}$/.test(academicYear)) user.academicYear = academicYear;
    const dept = clean(department, 80);
    if (dept) user.department = dept;
  }

  user.role = userRole;
  if (GENDERS.includes(gender)) user.gender = gender;
  user.collegeId = college.id;
  user.collegeName = college.name;
  user.isCollegeLocked = true;
  const hl = clean(headline, 120);
  if (hl) user.headline = hl;
  user.isProfileComplete = true;
  user.updatedAt = new Date().toISOString();
  db.users.set(user.id, user);
  logger.info(`${userRole === 'faculty' ? 'Faculty' : 'Student'} onboarding complete & college locked: ${user.id} -> ${college.id}`);

  res.json({ success: true, message: 'Profile completed and primary college secured.', user: selfUser(user) });
});

export default router;
