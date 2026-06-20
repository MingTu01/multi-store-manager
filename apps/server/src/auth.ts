import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// 安全的 JWT Secret 管理：优先使用环境变量，否则从文件读取或生成随机 secret
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  const dataDir = join(__dirname, '..', 'data');
  const secretFile = join(dataDir, 'jwt-secret');
  try {
    if (existsSync(secretFile)) {
      const secret = readFileSync(secretFile, 'utf-8').trim();
      if (secret) return secret;
    }
    // 生成 64 字节随机 secret
    const secret = crypto.randomBytes(64).toString('hex');
    mkdirSync(dataDir, { recursive: true });
    try {
      writeFileSync(secretFile, secret, 'utf-8');
      console.log('[AUTH] Generated new JWT secret and saved to', secretFile);
    } catch (writeErr) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('[AUTH] ⚠️ 生产环境警告: JWT_SECRET 环境变量未设置且无法写入 secret 文件，使用进程内随机 secret（重启后失效）');
      }
    }
    return secret;
  } catch (err) {
    console.error('[AUTH] Failed to read/write JWT secret file:', err);
    if (process.env.NODE_ENV === 'production') {
      console.warn('[AUTH] ⚠️ 生产环境警告: JWT_SECRET 环境变量未设置且 secret 文件不可用，使用进程内随机 secret（重启后失效）。建议设置 JWT_SECRET 环境变量以确保令牌持久化。');
    }
    // 兜底：进程内随机 secret（重启后失效，但不会崩溃）
    return crypto.randomBytes(64).toString('hex');
  }
}

const SECRET = getJwtSecret();

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

