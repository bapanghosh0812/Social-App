import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../services/s3.service.js';

/**
 * Serves private files (verification documents) through short-lived HMAC
 * signed links issued by the admin API. No signature, no file.
 */
const router = Router();

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

router.get('/private', (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const exp = Number(req.query.exp);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  if (!storage.verifySignature(key, exp, sig)) {
    return res.status(403).json({ success: false, error: 'This link has expired.' });
  }
  const file = storage.privateFilePath(key);
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, error: 'File not found.' });

  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(file).pipe(res);
});

export default router;
