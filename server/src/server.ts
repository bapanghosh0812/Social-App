import { env } from './config/env.js'; // must be first: loads .env before anything reads it
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from './config/logger.js';
import { Sentry } from './config/sentry.js';
import { latencyMiddleware } from './middleware/latencyMiddleware.js';
import { realtime } from './websocket/realtime.js';
import { redis } from './services/redisCacheService.js';
import { db } from './db/database.js';
import { syncDemoContent } from './db/demoSeed.js';
import { LOCAL_UPLOAD_DIR, storage } from './services/s3.service.js';

// Route Imports
import authRoutes from './routes/auth.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import feedRoutes from './routes/feed.routes.js';
import commentRoutes from './routes/comments.routes.js';
import reelsRoutes from './routes/reels.routes.js';
import searchRoutes from './routes/search.routes.js';
import userRoutes from './routes/user.routes.js';
import messageRoutes from './routes/messages.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import liveRoutes from './routes/live.routes.js';
import reportRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';
import mediaRoutes from './routes/media.routes.js';
import supportRoutes from './routes/support.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import placementRoutes from './routes/placement.routes.js';

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');
Sentry.init();

// --- Security headers (CSP covers the web app when this server hosts it) ---
const EMBED_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://player.vimeo.com',
  'https://www.instagram.com',
  'https://www.tiktok.com',
];
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'https://accounts.google.com'],
        frameSrc: [...EMBED_HOSTS, 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(env.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // media in /uploads may be loaded by the native app
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  next();
});
app.use(compression());

// --- CORS (explicit allow-list; requests without Origin — native apps — are allowed) ---
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, env.corsOrigins.includes('*') || env.corsOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-pin'],
    maxAge: 600,
  })
);

// --- Body parsers (small; media goes through multipart uploads) ---
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(latencyMiddleware);

// --- Rate limiting (per IP; per-account limiters live on write routes) ---
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GENERAL) || 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again in a few minutes.' },
});
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/google'], authLimiter);
app.use('/api', generalLimiter);

// --- Realtime channel ---
realtime.initialize(server);

// --- Public media (local disk storage only; private files are never served here) ---
if (!storage.usingS3) {
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  // Verification documents are never public (legacy path from older builds).
  app.use('/uploads/documents', (_req, res) => res.status(404).json({ success: false, error: 'Not found.' }));
  app.use(
    '/uploads',
    express.static(LOCAL_UPLOAD_DIR, {
      maxAge: '30d',
      immutable: true,
      dotfiles: 'deny',
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    })
  );
}

// --- Health & readiness ---
app.get('/healthz', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});
app.get('/readyz', (_req, res) => {
  res.json({ status: 'ready', storage: storage.usingS3 ? 's3' : 'local', collegesSeeded: db.colleges.size });
});

app.get('/api/system-stats', (_req, res) => {
  res.json({
    success: true,
    stats: {
      uptimeSeconds: Math.round(process.uptime()),
      storage: storage.usingS3 ? 'AWS S3' : 'Local disk',
      cache: redis.getStats(),
      records: { users: db.users.size, colleges: db.colleges.size, posts: db.posts.size, reels: db.reels.size },
    },
  });
});

// --- Domain routes ---
app.use('/api/auth', authRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/reels', reelsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/placements', placementRoutes);

// --- API 404 ---
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// --- Optionally serve the built client (single-service deploy) ---
const clientDist = path.resolve(process.cwd(), '..', 'client', 'dist');
if (env.serveClient && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  logger.info(`Serving client build from ${clientDist}`);
}

// --- Global error handler (never leaks internals) ---
app.use((err: { status?: number; statusCode?: number; message?: string; stack?: string; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    Sentry.captureException(err);
    logger.error(`Unhandled exception: ${err.message}`, { stack: err.stack });
  }
  const message =
    status === 413 ? 'Request is too large.' : status < 500 ? 'Invalid request.' : env.isProd ? 'Internal server error' : err.message;
  res.status(status).json({ success: false, error: message });
});

// Inactivity policy (30 days) + story expiry, at boot and on a schedule.
const INACTIVITY_DAYS = Number(process.env.INACTIVITY_DELETE_DAYS) || 30;
function housekeeping() {
  try {
    db.pruneInactiveUsers(INACTIVITY_DAYS);
    db.pruneExpiredStories();
  } catch (err) {
    logger.error('Housekeeping failed', { error: String(err) });
  }
}

/** One-time move of publicly stored verification documents into private storage. */
function secureLegacyDocuments() {
  let moved = 0;
  for (const doc of db.verificationDocuments.values()) {
    if (!doc.documentUrl.startsWith('/uploads/documents/')) continue;
    const ref = storage.migrateLegacyDocument(doc.documentUrl);
    db.verificationDocuments.set(doc.id, { ...doc, documentUrl: ref || '' });
    moved++;
  }
  for (const u of db.users.values()) {
    if (u.verificationDocumentUrl) db.users.set(u.id, { ...u, verificationDocumentUrl: undefined });
  }
  if (moved) logger.warn(`Moved ${moved} verification document(s) from public to private storage.`);
}

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    secureLegacyDocuments();
    await syncDemoContent();
    housekeeping();
    setInterval(housekeeping, 60 * 60 * 1000).unref();
    server.listen(env.port, () => {
      logger.info('========================================================');
      logger.info(`🎓 College Campus API running on port ${env.port} (${env.nodeEnv})`);
      logger.info(`   Storage: ${storage.usingS3 ? 'AWS S3' : 'local disk'} | Demo mode: ${env.demoMode ? 'on' : 'off'}`);
      logger.info(`   Institutions in directory: ${db.colleges.size}`);
      logger.info('========================================================');
    });
  })();
}

export { app, server };
