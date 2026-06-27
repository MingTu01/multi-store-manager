import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, authMiddleware, AuthRequest, getCookie } from '../auth.js';
import { blacklistToken, hashToken } from '../token-blacklist.js';
import { opLog } from '../oplog.js';

const router = Router();

// 登录速率限制：同一IP每分钟最多10次登录尝试
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '登录尝试过于频繁，请1分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});


router.post('/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: '用户名或密码错误' });
    const token = signToken({ id: user.id, username: user.username, name: user.name, role: user.role, store_id: user.store_id });
    setAuthCookie(res, token);
    const { password_hash, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err: any) { res.status(500).json({ error: '登录失败，请稍后重试' }); }
});

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at, updated_at FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const store = user.store_id ? db.prepare('SELECT name FROM stores WHERE id = ?').get(user.store_id) as any : null;
    res.json({ user: { ...user, store_name: store?.name || '' } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { phone, address, avatar, oldPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const updates: string[] = [];
    const vals: any[] = [];
    // username update removed for security}
    if (phone !== undefined) {
      if (user.role !== 'ADMIN') {
        if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
          return res.status(400).json({ error: '手机号格式不正确，必须是11位有效手机号' });
        }
        updates.push('phone=?'); vals.push(phone);
        updates.push('username=?'); vals.push(phone);
      }
    }
    if (address !== undefined) { updates.push('address=?'); vals.push(address); }
    if (avatar !== undefined) { updates.push('avatar=?'); vals.push(avatar); }
    if (oldPassword && newPassword) {
      if (!bcrypt.compareSync(oldPassword, user.password_hash)) return res.status(401).json({ error: '旧密码错误' });
      updates.push('password_hash=?'); vals.push(bcrypt.hashSync(newPassword, 10));
    }
    if (updates.length === 0) return res.status(400).json({ error: '没有需要更新的内容' });
    updates.push("updated_at=datetime('now','localtime')");
    vals.push(req.user.id);
    db.prepare('UPDATE users SET ' + updates.join(',') + ' WHERE id=?').run(...vals);
    if (oldPassword && newPassword) { opLog(req.user.id, 0, '修改密码', '用户修改了自己的密码', req.ip); }
    const updated = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address FROM users WHERE id = ?').get(req.user.id) as any;
    res.json({ user: updated, message: '信息已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/password', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入旧密码和新密码' });
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) return res.status(401).json({ error: '旧密码错误' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, req.user.id);
    opLog(req.user.id, 0, '修改密码', '用户修改了自己的密码', req.ip);
    res.json({ message: '密码修改成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;