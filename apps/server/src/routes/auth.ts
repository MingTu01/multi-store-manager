import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, authMiddleware, AuthRequest } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: '用户名或密码错误' });
    const token = signToken({ id: user.id, username: user.username, name: user.name, role: user.role, store_id: user.store_id });
    const { password_hash, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
    if (phone !== undefined) { updates.push('phone=?'); vals.push(phone); }
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
    const updated = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address FROM users WHERE id = ?').get(req.user.id) as any;
    res.json({ user: updated, message: '信息已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/password', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入旧密码和新密码' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) return res.status(401).json({ error: '旧密码错误' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, req.user.id);
    res.json({ message: '密码修改成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;