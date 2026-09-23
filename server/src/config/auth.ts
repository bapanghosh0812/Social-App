import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Authentication primitives: password hashing + signed session tokens.
 *
 * Security posture:
 *  - Passwords are hashed with bcrypt (cost 12) and never stored or logged in
 *    plaintext, never returned in any API response.
 *  - Sessions are JWTs signed with a strong secret. In production JWT_SECRET is
 *    mandatory (the process refuses to boot without it). In development a
 *    strong random secret is generated once into a git-ignored file.
 *  - Every token carries a `tv` (token version). Bumping the user's version
 *    (logout-all, password change) instantly revokes every older token.
 */

const BCRYPT_ROUNDS = 12;
const TOKEN_TTL_DAYS = 30;

function resolveSecret(): string {
  const fromEnv = env.jwtSecret;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (env.isProd) {
    throw new Error('FATAL: JWT_SECRET must be set to a strong value (>= 32 chars) in production.');
  }
  if (fromEnv) {
    logger.warn('JWT_SECRET is too short; generating a strong development secret instead.');
  }

  const dir = process.env.DB_DIR || path.join(process.cwd(), 'data');
  const secretFile = path.join(dir, '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    logger.info('Generated a new development JWT secret at data/.jwt_secret');
    return generated;
  } catch {
    logger.warn('Could not persist dev JWT secret; using an in-memory secret for this run.');
    return crypto.randomBytes(48).toString('hex');
  }
}

const JWT_SECRET = resolveSecret();

/** Separate key for signing short-lived private media links. */
export const MEDIA_SIGNING_KEY = crypto.createHmac('sha256', JWT_SECRET).update('private-media-v1').digest();

export interface SessionClaims {
  sub: string; // user id
  email: string;
  tv: number; // token version
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function issueToken(claims: SessionClaims): { token: string; expiresAt: number } {
  const expiresIn = TOKEN_TTL_DAYS * 24 * 60 * 60; // seconds
  const token = jwt.sign(claims, JWT_SECRET, { expiresIn, algorithm: 'HS256' });
  return { token, expiresAt: Date.now() + expiresIn * 1000 };
}

export function verifyToken(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded && 'sub' in decoded && 'email' in decoded) {
      const d = decoded as Record<string, unknown>;
      return { sub: String(d.sub), email: String(d.email), tv: Number(d.tv) || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

/** Random unusable password hash for accounts that sign in without a password. */
export async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// --- Validation helpers ---
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean) || clean.length > 254) return null;
  return clean;
}
