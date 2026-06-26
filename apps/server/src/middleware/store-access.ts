import { Response, NextFunction } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';
import { resolve, relative, isAbsolute } from 'path';

// 门店访问控制中间件（S4）
export function requireStoreAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const storeId = req.params.storeId;
  if (!storeId) return next();
  const user = req.user;
  if (!user) return res.status(401).json({ error: '未认证' });
  if (isAdmin(user.role)) return next();
  if (user.store_id && String(user.store_id) === String(storeId)) return next();
  const sh = db.prepare('SELECT id FROM shareholders WHERE store_id = ? AND name = ?')
    .get(storeId, user.username) as any;
  if (sh) return next();
  return res.status(403).json({ error: '无权访问该门店' });
}

// 角色要求中间件（S5/S25）
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (!roles.map(r => r.toUpperCase()).includes(userRole)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

// 路径安全校验（S3）
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
