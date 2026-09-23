import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database.js';
import { User } from '../types/index.js';
import { verifyToken } from '../config/auth.js';
import { isAdminEmail } from '../config/env.js';
import { checkAdminPin } from '../config/adminSecrets.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/** Resolve the account behind a raw session token (used by HTTP and WebSocket). */
export function userFromToken(token: string | undefined | null): User | undefined {
  if (!token) return undefined;
  const claims = verifyToken(token);
  if (!claims) return undefined;

  const user = db.users.get(claims.sub);
  // Token subject must still resolve to a real account with the same email and
  // an unrevoked token version.
  if (!user || user.email.toLowerCase() !== claims.email.toLowerCase()) return undefined;
  if ((user.tokenVersion || 0) !== claims.tv) return undefined;

  // Admin rights are derived from server configuration on every request.
  return { ...user, isAdmin: isAdminEmail(user.email) };
}

function extractUser(req: Request): User | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return undefined;
  return userFromToken(header.slice('Bearer '.length).trim());
}

/** Attaches req.user when a valid session is present, but never rejects. */
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  req.user = extractUser(req);
  next();
}

/** Rejects the request with 401 unless a valid session token is present. */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      message: 'Please sign in to continue.',
    });
  }
  req.user = user;
  next();
}

/**
 * Strict permission lock: only Verified Members may publish. Guests and
 * Pending accounts can browse but not publish.
 */
export function requireVerifiedMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.user || extractUser(req);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      message: 'You must be signed in to perform this action.',
    });
  }
  req.user = user;

  if (user.verificationStatus !== 'Verified Member') {
    return res.status(403).json({
      success: false,
      error: 'Verification required',
      code: 'VERIFICATION_LOCKED',
      userStatus: user.verificationStatus,
      message:
        'Only verified members can publish. Submit your fee receipt, marksheet or admission letter to get verified.',
    });
  }
  next();
}

/** Restricts a route to accounts listed in ADMIN_EMAILS. */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = req.user || extractUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }
  if (!user.isAdmin) {
    return res.status(403).json({ success: false, error: 'Administrator access required.' });
  }
  req.user = user;
  next();
}

/** Step-up check: the admin must also present the 6-digit console PIN. */
export function requireAdminPin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const provided = req.headers['x-admin-pin'];
  const result = checkAdminPin(req.user?.id || req.ip || 'unknown', typeof provided === 'string' ? provided : undefined);
  if (result === 'locked') {
    return res.status(429).json({ success: false, error: 'Admin console locked after too many wrong PINs. Try again in 30 minutes.' });
  }
  if (result === 'bad') {
    return res.status(403).json({ success: false, error: 'Incorrect admin PIN.' });
  }
  next();
}
