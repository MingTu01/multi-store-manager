import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import db from './db.js';
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
        throw new Error('[AUTH] 生产环境错误: JWT_SECRET 环境变量未设置且无法写入 secret 文件，请设置 JWT_SECRET 环境变量');
      }
    }
    return secret;
  } catch (err) {
    console.error('[AUTH] Failed to read/write JWT secret file:', err);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[AUTH] 生产环境错误: JWT_SECRET 环境变量未设置且 secret 文件不可用，请设置 JWT_SECRET 环境变量');
    }
    // 兜底：进程内随机 secret（重启后失效，但不会崩溃）
    return crypto.randomBytes(64).toString('hex');
  }
}

const SECRET = getJwtSecret();

export interface AuthRequest extends Request {
  user?: any;
}

// 从 Cookie 头手动解析指定 cookie 值（不引入 cookie-parser 依赖）
export function getCookie(req: Request, name: string): string | undefined {
  const cookies = req.headers.cookie;
  if (!cookies) return undefined;
  const match = cookies.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false' && (process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true'),
    sameSite: 'lax',
    maxAge: 4 * 60 * 60 * 1000, // 4h, matches TOKEN_EXPIRY
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie('auth_token', { path: '/' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    // 1. 优先读取 httpOnly cookie
    if (!token) {
      const cookieToken = getCookie(req, 'auth_token');
      if (cookieToken) {
        token = cookieToken;
      }
    }
    // 2. Authorization header（向后兼容）
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // 3. Cookie 已在第1步处理，移除 query token 回退以防止 URL 泄露
    //    SSE 连接使用 withCredentials: true 自动携带 cookie
    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }
    const decoded = jwt.verify(token, SECRET) as any;
    req.user = decoded;

    // 校验密码修改时间：JWT的iat必须晚于用户的updated_at
    const freshUser = db.prepare('SELECT updated_at, username, name FROM users WHERE id = ?').get(decoded.id) as any;
    if (!freshUser) {
      return res.status(401).json({ error: '用户不存在' });
    }
    if (freshUser.updated_at && decoded.iat < Math.floor(new Date(freshUser.updated_at).getTime() / 1000)) {
      return res.status(401).json({ error: '密码已修改，请重新登录' });
    }

    // Enrich req.user with username/name from DB (not stored in JWT for security)
    req.user.username = freshUser.username;
    req.user.name = freshUser.name;

    next();
  } catch (err) {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}

export function signToken(payload: any) {
  const tokenExpiry = process.env.TOKEN_EXPIRY || '4h';
  return jwt.sign(payload, SECRET, { expiresIn: tokenExpiry } as jwt.SignOptions);
}

