import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export function latencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();

  // Override res.end or track before headers are written
  const originalEnd = res.end;
  // @ts-ignore
  res.end = function (chunk?: any, encoding?: any, callback?: any) {
    if (!res.headersSent) {
      const diff = process.hrtime(start);
      const timeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      res.setHeader('X-Response-Time', `${timeMs}ms`);

      const numericMs = parseFloat(timeMs);
      if (numericMs > 100) {
        logger.warn(`⚠️ [Slow Query Alert]: ${req.method} ${req.originalUrl} took ${timeMs}ms (>100ms target)`);
      } else {
        logger.debug(`⚡ [Sub-100ms Performance]: ${req.method} ${req.originalUrl} took ${timeMs}ms`);
      }
    }
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
}
