import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'multi-shop-link-secret-key-2024';

export interface AuthRequest extends Request {
  user?: any;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // SSE 等无法设置 Header 的场景支持 query token
    if (!token && req.query.token) {
      token = req.query.token as string;
    }
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}

export function signToken(payload: any) {
  const tokenExpiry = process.env.TOKEN_EXPIRY || '24h';
  return jwt.sign(payload, SECRET, { expiresIn: tokenExpiry } as jwt.SignOptions);
}

// 关键操作时重新校验用户状态（S18）
// DEPRECATED: 此函数当前未被任何路由调用，保留供未来使用
export function requireFreshUser(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) return res.status(401).json({ error: '未认证' });
  const freshUser = (globalThis as any).__db?.prepare('SELECT id, role, store_id, status FROM users WHERE id = ?')
    .get(req.user.id) as any;
  if (!freshUser) return res.status(401).json({ error: '用户不存在' });
  if (freshUser.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
  req.user.role = freshUser.role;
  req.user.store_id = freshUser.store_id;
  next();
}

export { SECRET };
