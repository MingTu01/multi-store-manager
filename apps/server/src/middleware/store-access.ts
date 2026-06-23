import { Response, NextFunction } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';
import { resolve, relative, isAbsolute } from 'path';

// Store access control middleware
export function requireStoreAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const storeId = req.params.storeId;
  if (!storeId) return next();
  const user = req.user;
  if (!user) return res.status(401).json({ error: '未认证' });
  if (isAdmin(user.role)) return next();
  if (user.store_id && String(user.store_id) === String(storeId)) return next();
  // Shareholder access via user.store_id only (name matching removed to prevent username spoofing)
  return res.status(403).json({ error: '无权访问该门店' });
}

// Role requirement middleware
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (!roles.map(r => r.toUpperCase()).includes(userRole)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

// Path security validation
export function safePath(baseDir: string, filename: string): string | null {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const fullPath = resolve(baseDir, filename);
  const rel = relative(baseDir, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return fullPath;
}
