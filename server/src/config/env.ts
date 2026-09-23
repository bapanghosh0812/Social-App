import 'dotenv/config';
import crypto from 'crypto';

/**
 * Central, validated runtime configuration.
 *
 * This module is imported first by server.ts so `.env` is loaded before any
 * other module reads process.env. Every secret comes from the environment —
 * nothing sensitive is hardcoded in source control.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Fingerprints (truncated SHA-256) of credentials that were exposed in an
 * earlier public commit. They are permanently compromised, so the server
 * refuses to use them. Only hashes are stored here, never the values.
 */
const COMPROMISED_FINGERPRINTS = new Set([
  'a8e078307f76be882763e5a1de26d3ac',
  'dd99a69c30b7ff5e3fdf01b2f5c40e5c',
  '6e7e2d625b7658e9f8a1e46054dd933b',
  'f15e5cf4fefe6413ab12a117b7884142',
  'ce1df74d6833b4b795b0ab4d45512e00',
  '359846c122aaa15836b04ae868019bb1',
  '0494c8340ea322e4b15925b98da01d72',
  '80405444241a94a5b26f496ca7e46400',
]);

export function isCompromisedSecret(value: string | undefined): boolean {
  if (!value) return false;
  const fp = crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
  return COMPROMISED_FINGERPRINTS.has(fp);
}

/** Returns the env value unless it is a known-compromised credential. */
function safeSecret(name: string): string {
  const value = (process.env[name] || '').trim();
  if (value && isCompromisedSecret(value)) {
    const msg = `${name} is a known-leaked credential and has been rejected. Rotate it and set a new value.`;
    if (isProd) throw new Error(`FATAL: ${msg}`);
    // eslint-disable-next-line no-console
    console.error(`\n[SECURITY] ${msg}\n`);
    return '';
  }
  return value;
}

function list(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIceServers(): Array<{ urls: string | string[]; username?: string; credential?: string }> {
  const raw = process.env.ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // eslint-disable-next-line no-console
      console.error('[config] ICE_SERVERS is not valid JSON; falling back to public STUN.');
    }
  }
  return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
}

const adminPin = (process.env.ADMIN_PIN || '').trim();
const ownerSecret = safeSecret('OWNER_SECRET');

export const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  corsOrigins: list(
    process.env.CORS_ORIGINS ||
      'http://localhost:5173,http://localhost:4173,capacitor://localhost,https://localhost,http://localhost'
  ),

  jwtSecret: safeSecret('JWT_SECRET'),

  /** Demo mode seeds sample content and enables the one-tap demo sign-in. */
  demoMode: process.env.DEMO_MODE === 'true',

  /** Accounts allowed to open the admin console (still gated by ADMIN_PIN). */
  adminEmails: new Set(list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase())),
  adminPin: /^\d{6}$/.test(adminPin) ? adminPin : '',
  ownerSecret: ownerSecret.length >= 12 ? ownerSecret : '',

  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: safeSecret('AWS_ACCESS_KEY_ID'),
    secretAccessKey: safeSecret('AWS_SECRET_ACCESS_KEY'),
    bucket: (process.env.AWS_S3_BUCKET || '').trim(),
    cdnUrl: (process.env.AWS_CLOUDFRONT_URL || '').replace(/\/+$/, ''),
  },

  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),

  smtp: {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT) || 587,
    user: (process.env.SMTP_USER || '').trim(),
    pass: safeSecret('SMTP_PASS'),
    from: (process.env.SMTP_FROM || 'College Campus <no-reply@collegecampus.app>').trim(),
  },

  iceServers: parseIceServers(),
  liveMaxViewers: Number(process.env.LIVE_MAX_VIEWERS) || 20,
  maxUploadMb: Math.min(Number(process.env.MAX_UPLOAD_MB) || 100, 500),
  serveClient: process.env.SERVE_CLIENT === 'true',
};

if (process.env.ADMIN_PIN && !env.adminPin) {
  // eslint-disable-next-line no-console
  console.error('[config] ADMIN_PIN must be exactly 6 digits — admin console disabled.');
}
if (process.env.OWNER_SECRET && !env.ownerSecret) {
  // eslint-disable-next-line no-console
  console.error('[config] OWNER_SECRET must be at least 12 characters — PIN changes disabled.');
}

export function isAdminEmail(email: string | undefined): boolean {
  return Boolean(email && env.adminEmails.has(email.toLowerCase()));
}
