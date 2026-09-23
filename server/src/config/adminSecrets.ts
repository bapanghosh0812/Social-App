import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { secrets } from '../db/sqlite.js';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Admin console step-up PIN.
 *
 *  - Only accounts listed in ADMIN_EMAILS can even attempt the PIN.
 *  - The initial PIN comes from ADMIN_PIN (6 digits). There is NO built-in
 *    default: without ADMIN_PIN the admin console is disabled.
 *  - The PIN can be rotated from the console, which requires the current PIN
 *    AND the OWNER_SECRET from the environment. Changing ADMIN_PIN in the
 *    environment re-seeds the stored hash on the next boot.
 *  - Only bcrypt hashes are stored; the plaintext never touches the database,
 *    logs, or any API response.
 */

const PIN_KEY = 'admin_pin_v2';
const PIN_ENV_FP_KEY = 'admin_pin_env_fp_v2';
const LEGACY_KEYS = ['admin_pin', 'owner_secret']; // held publicly-known 4-digit defaults
const ROUNDS = 12;

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(`admin-pin-env:${value}`).digest('hex');
}

function seed() {
  for (const key of LEGACY_KEYS) {
    if (secrets.has(key)) {
      secrets.remove(key);
      logger.warn(`Removed legacy admin secret "${key}" (it used a publicly-known default).`);
    }
  }

  if (!env.adminPin) {
    if (secrets.has(PIN_KEY)) secrets.remove(PIN_KEY);
    logger.info('Admin console disabled (set ADMIN_PIN and ADMIN_EMAILS to enable it).');
    return;
  }

  const envFp = fingerprint(env.adminPin);
  const stored = secrets.get(PIN_ENV_FP_KEY);
  if (!secrets.has(PIN_KEY) || !stored || stored.hash !== envFp) {
    secrets.set(PIN_KEY, bcrypt.hashSync(env.adminPin, ROUNDS));
    secrets.set(PIN_ENV_FP_KEY, envFp);
    logger.info('Admin PIN initialised from environment.');
  }
}
seed();

export function isAdminConsoleEnabled(): boolean {
  return secrets.has(PIN_KEY);
}

export function isSixDigitPin(v: unknown): v is string {
  return typeof v === 'string' && /^\d{6}$/.test(v);
}

export function verifyAdminPin(pin: unknown): boolean {
  if (!isSixDigitPin(pin)) return false;
  const row = secrets.get(PIN_KEY);
  return Boolean(row && bcrypt.compareSync(pin, row.hash));
}

// --- Wrong-PIN lockout (per account), shared by HTTP and WebSocket checks ---
const pinFailures = new Map<string, { count: number; lockedUntil: number }>();
const MAX_PIN_FAILS = 5;
const PIN_LOCK_MS = 30 * 60 * 1000;

export type PinCheck = 'ok' | 'bad' | 'locked';

export function checkAdminPin(accountId: string, pin: unknown): PinCheck {
  const entry = pinFailures.get(accountId);
  if (entry && entry.lockedUntil > Date.now()) return 'locked';
  if (verifyAdminPin(pin)) {
    pinFailures.delete(accountId);
    return 'ok';
  }
  const next = { count: (entry?.lockedUntil ?? 0) > 0 ? 1 : (entry?.count || 0) + 1, lockedUntil: 0 };
  if (next.count >= MAX_PIN_FAILS) {
    next.lockedUntil = Date.now() + PIN_LOCK_MS;
    logger.warn(`Admin console locked for 30 minutes after repeated wrong PINs (account ${accountId}).`);
  }
  pinFailures.set(accountId, next);
  return next.lockedUntil ? 'locked' : 'bad';
}

function verifyOwnerSecret(secret: unknown): boolean {
  if (!env.ownerSecret || typeof secret !== 'string' || secret.length !== env.ownerSecret.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(env.ownerSecret));
}

export interface ChangePinResult {
  ok: boolean;
  error?: string;
}

export function changeAdminPin(
  oldPin: unknown,
  ownerSecret: unknown,
  newPin: unknown,
  confirmNewPin: unknown
): ChangePinResult {
  if (!env.ownerSecret) {
    return { ok: false, error: 'PIN changes are disabled until OWNER_SECRET is configured on the server.' };
  }
  if (!isSixDigitPin(newPin)) return { ok: false, error: 'New PIN must be exactly 6 digits.' };
  if (newPin !== confirmNewPin) return { ok: false, error: 'New PIN and confirmation do not match.' };
  if (/^(\d)\1{5}$/.test(newPin) || newPin === '123456' || newPin === '654321') {
    return { ok: false, error: 'That PIN is too easy to guess. Choose another.' };
  }
  if (!verifyAdminPin(oldPin)) return { ok: false, error: 'Current admin PIN is incorrect.' };
  if (!verifyOwnerSecret(ownerSecret)) return { ok: false, error: 'Owner secret is incorrect.' };
  if (newPin === oldPin) return { ok: false, error: 'New PIN must be different from the current PIN.' };

  secrets.set(PIN_KEY, bcrypt.hashSync(newPin, ROUNDS));
  logger.info('Admin PIN changed successfully.');
  return { ok: true };
}
