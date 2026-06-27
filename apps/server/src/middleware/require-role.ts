// apps/server/src/middleware/require-role.ts
// Reusable role-based access control middleware

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../auth.js';
import { isAdmin, isReadonly, isManagerOrAbove, isStoreAdminOrAbove } from '../lib/roles.js';

/** Require ADMIN role */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).json({ error: '\u65e0\u6743\u9650\uff0c\u4ec5\u7ba1\u7406\u5458\u53ef\u64cd\u4f5c' });
  }
  next();
}

/** Require MANAGER or above (ADMIN, STORE_ADMIN, MANAGER) */
export function requireManagerOrAbove(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isManagerOrAbove(req.user?.role)) {
    return res.status(403).json({ error: '\u65e0\u6743\u9650\uff0c\u9700\u8981\u5e97\u957f\u4ee5\u4e0a\u6743\u9650' });
  }
  next();
}

/** Require STORE_ADMIN or above (ADMIN, STORE_ADMIN) */
export function requireStoreAdminOrAbove(req: AuthRequest, res: Response, next: NextFunction) {
  if (!isStoreAdminOrAbove(req.user?.role)) {
    return res.status(403).json({ error: '\u65e0\u6743\u9650\uff0c\u9700\u8981\u95e8\u5e97\u7ba1\u7406\u5458\u4ee5\u4e0a\u6743\u9650' });
  }
  next();
}

/** Deny readonly roles (SHAREHOLDER cannot write) */
export function requireNotReadonly(req: AuthRequest, res: Response, next: NextFunction) {
  if (isReadonly(req.user?.role)) {
    return res.status(403).json({ error: '\u53ea\u8bfb\u89d2\u8272\u65e0\u6743\u64cd\u4f5c' });
  }
  next();
}
