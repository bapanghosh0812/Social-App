import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';
import { verifyToken } from '../config/auth.js';

/**
 * Per-account rate limiters for write-heavy actions. Keys on the signed-in
 * user (so campus NATs don't punish everyone behind one IP), falling back to
 * the client IP for anonymous requests.
 */
function accountKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const claims = verifyToken(header.slice(7).trim());
    if (claims) return `u:${claims.sub}`;
  }
  return `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
}

export function accountLimiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: accountKey,
    message: { success: false, error: message },
  });
}

export const publishLimiter = accountLimiter(15 * 60 * 1000, 40, 'You are posting too fast. Please wait a few minutes.');
export const commentLimiter = accountLimiter(5 * 60 * 1000, 60, 'You are commenting too fast. Please slow down.');
export const messageLimiter = accountLimiter(60 * 1000, 40, 'You are sending messages too fast.');
export const uploadLimiter = accountLimiter(15 * 60 * 1000, 60, 'Upload limit reached. Please try again later.');
export const reportLimiter = accountLimiter(60 * 60 * 1000, 30, 'Too many reports. Please try again later.');
export const adminLimiter = accountLimiter(15 * 60 * 1000, 600, 'Too many admin requests. Try again later.');
