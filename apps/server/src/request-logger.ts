// apps/server/src/request-logger.ts
// HTTP request logging middleware

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from './logger.js';

// Static file extensions to skip logging
const STATIC_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Skip logging for static files
  const path = req.path.toLowerCase();
  if (STATIC_EXTS.some(ext => path.endsWith(ext))) {
    return next();
  }

  const requestId = crypto.randomUUID();
  const start = Date.now();

  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: duration + 'ms',
      userId: (req as any).user?.id,
      ip: req.ip,
    };

    if (res.statusCode >= 500) {
      logger.error(logData, 'request error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'request client error');
    } else if (duration > 3000) {
      logger.warn(logData, 'slow request');
    } else {
      logger.info(logData, 'request completed');
    }
  });

  next();
}
