import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, authMiddleware, AuthRequest, getCookie } from '../auth.js';
import { blacklistToken, hashToken } from '../token-blacklist.js';
import { opLog } from '../oplog.js';
import { AppError, ErrorCode } from '../error-handler.js';

const router = Router();

// 密码复杂度校验：至少6位且包含字母和数字
function validatePasswordStrength(pwd: string): string | null {
  if (pwd.length < 6) return '密码至少6位';
  if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) return '密码必须包含字母和数字';
  return null;
}

// 登录速率限制：同一IP每分钟最多10次登录尝试
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '登录尝试过于频繁，请1分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.socket?.remoteAddress || 'unknown',
});


router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw new AppError(ErrorCode.INPUT_REQUIRED, '请输入用户名和密码', 400);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user) throw new AppError(ErrorCode.AUTH_PASSWORD_WRONG, '用户名或密码错误', 401);
    if (user.status !== 'active') throw new AppError(ErrorCode.AUTH_USER_DISABLED, '用户名或密码错误', 401);
    if (!await bcrypt.compare(password, user.password_hash)) throw new AppError(ErrorCode.AUTH_PASSWORD_WRONG, '用户名或密码错误', 401);
    const token = signToken({ id: user.id, username: user.username, name: user.name, role: user.role, store_id: user.store_id });
    setAuthCookie(res, token);
    const userData = { id: user.id, username: user.username, name: user.name, role: user.role, store_id: user.store_id, phone: user.phone, avatar: user.avatar, must_change_password: user.must_change_password || 0 };
    res.json({ user: userData });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at, updated_at, must_change_password FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) throw new AppError(ErrorCode.AUTH_USER_NOT_FOUND, '用户不存在', 404);
    const store = user.store_id ? db.prepare('SELECT name FROM stores WHERE id = ?').get(user.store_id) as any : null;
    res.json({ user: { ...user, store_name: store?.name || '' } });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.put('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { username, phone, address, avatar, oldPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) throw new AppError(ErrorCode.AUTH_USER_NOT_FOUND, '用户不存在', 404);
    const updates: string[] = [];
    const vals: any[] = [];
    // ADMIN 可修改账号（username），非 ADMIN 通过 phone 同步
    if (username !== undefined && user.role === 'ADMIN') {
      if (username && username.length < 3) throw new AppError(ErrorCode.INPUT_LENGTH, '账号至少3个字符', 400);
      if (username && username.length > 30) throw new AppError(ErrorCode.INPUT_LENGTH, '账号最多30个字符', 400);
      if (username) {
        const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id) as any;
        if (existing) throw new AppError(ErrorCode.INPUT_FORMAT, '该账号已被使用', 400);
      }
      updates.push('username=?'); vals.push(username);
    }
    if (phone !== undefined) {
      if (user.role !== 'ADMIN') {
        if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
          throw new AppError(ErrorCode.INPUT_FORMAT, '手机号格式不正确，必须是11位有效手机号', 400);
        }
        // 查重：非管理员手机号同步为 username，必须唯一
        if (phone) {
          const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(phone, req.user.id) as any;
          if (existing) throw new AppError(ErrorCode.INPUT_FORMAT, '该手机号已被其他用户使用', 400);
        }
        updates.push('phone=?'); vals.push(phone);
        updates.push('username=?'); vals.push(phone);
      }
    }
    if (address !== undefined) { updates.push('address=?'); vals.push(address); }
    if (avatar !== undefined) { updates.push('avatar=?'); vals.push(avatar); }
    if (oldPassword && newPassword) {
      const pwdErr = validatePasswordStrength(newPassword);
      if (pwdErr) throw new AppError(ErrorCode.INPUT_FORMAT, pwdErr, 400);
      if (!await bcrypt.compare(oldPassword, user.password_hash)) throw new AppError(ErrorCode.AUTH_PASSWORD_WRONG, '旧密码错误', 401);
      updates.push('password_hash=?'); vals.push(await bcrypt.hash(newPassword, 10));
      updates.push('must_change_password=0');
    }
    if (updates.length === 0) throw new AppError(ErrorCode.INPUT_REQUIRED, '没有需要更新的内容', 400);
    updates.push("updated_at=datetime('now','localtime')");
    vals.push(req.user.id);
    db.prepare('UPDATE users SET ' + updates.join(',') + ' WHERE id=?').run(...vals);
    if (oldPassword && newPassword) { opLog(req.user.id, 0, '修改密码', '用户修改了自己的密码', req.ip); }
    const updated = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, must_change_password FROM users WHERE id = ?').get(req.user.id) as any;
    res.json({ user: updated, message: '信息已更新' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.put('/password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) throw new AppError(ErrorCode.INPUT_REQUIRED, '请输入旧密码和新密码', 400);
    const pwdErr = validatePasswordStrength(newPassword);
    if (pwdErr) throw new AppError(ErrorCode.INPUT_FORMAT, pwdErr, 400);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) throw new AppError(ErrorCode.AUTH_USER_NOT_FOUND, '用户不存在', 404);
    if (!await bcrypt.compare(oldPassword, user.password_hash)) throw new AppError(ErrorCode.AUTH_PASSWORD_WRONG, '旧密码错误', 401);
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, req.user.id);
    db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(req.user.id);
    opLog(req.user.id, 0, '修改密码', '用户修改了自己的密码', req.ip);
    res.json({ message: '密码修改成功' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});


router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    // Blacklist current token
    const token = getCookie(req, 'auth_token') || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : '');
    if (token) {
      const tokenHash = hashToken(token);
      const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4h
      blacklistToken(tokenHash, expiresAt);
    }
    clearAuthCookie(res);
    res.json({ message: '\u5df2\u9000\u51fa\u767b\u5f55' });
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

export default router;
