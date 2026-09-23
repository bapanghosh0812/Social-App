import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { storage, sniffFile, FOLDER_RULES, isUploadFolder, UploadFolder } from '../services/s3.service.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1, fields: 5 },
});

function handleMulter(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.maxUploadMb} MB).` : 'Upload failed.';
      return res.status(400).json({ success: false, error: msg });
    }
    if (err) return res.status(400).json({ success: false, error: 'Upload failed.' });
    next();
  });
}

/**
 * Direct multipart upload (local disk or S3). The real file type is detected
 * from its bytes and checked against what the destination folder accepts.
 */
router.post('/direct', uploadLimiter, requireAuth, handleMulter, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided.' });
    const requested: unknown = req.body?.folder;
    const folder: UploadFolder = isUploadFolder(requested) ? requested : 'posts';
    const rule = FOLDER_RULES[folder];

    const sniffed = sniffFile(req.file.buffer);
    if (!sniffed || !rule.kinds.includes(sniffed.kind)) {
      const allowed = rule.kinds.map((k) => (k === 'pdf' ? 'PDF' : k === 'image' ? 'photos (JPG, PNG, WebP)' : 'videos (MP4, WebM, MOV)'));
      return res.status(400).json({ success: false, error: `Unsupported file. Allowed here: ${allowed.join(', ')}.` });
    }
    if (req.file.size > rule.maxMb * 1024 * 1024) {
      return res.status(400).json({ success: false, error: `File is too large (max ${rule.maxMb} MB).` });
    }

    const url = await storage.store(req.file.buffer, folder, sniffed);
    res.json({ success: true, url, kind: sniffed.kind, mime: sniffed.mime });
  } catch (err) {
    logger.error('Direct upload failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Upload failed. Please try again.' });
  }
});

export default router;
