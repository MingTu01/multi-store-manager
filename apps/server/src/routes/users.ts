import { requireManagerOrAbove, requireAdmin } from '../middleware/require-role.js';
﻿import { Router, Response } from 'express';
import db from '../db.js';
import { isAdmin, isManagerOrAbove } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import bcrypt from 'bcryptjs';
import { sanitizeText } from '../sanitize.js';

import { AuthRequest } from '../auth.js';
import { userCache } from '../cache.js';

const router = Router();

// GET all users — S5: 仅 ADMIN/MANAGER
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    const { storeId } = req.query;
    let sql = 'SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at FROM users';
    const params: any[] = [];
    if (storeId) {
      sql += ' WHERE store_id = ?';
      params.push(storeId);
    }
    sql += ' ORDER BY created_at DESC';
    const users = db.prepare(sql).all(...params);
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

// GET single user — S5: 仅自己或 ADMIN/MANAGER
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)
        && parseInt(req.params.id) !== req.user.id) {
      return res.status(403).json({ error: '无权限' });
    }
    const u = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at FROM users WHERE id = ?').get(req.params.id) as any;
    if (!u) return res.status(404).json({ error: '用户不存在' });
    res.json(u);
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

// POST create user — S5: 仅 ADMIN
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    const { username, password, name, phone, role, store_id, avatar, salary, status, job_title, address } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    // 角色大小写统一为大写（S19）
    const safeRole = (role || 'STAFF').toUpperCase();
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, name, phone, role, store_id, avatar, salary, status, job_title, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(username, hash, sanitizeText(name || ''), phone || '', safeRole, store_id || null, avatar || '', salary || 0, status || 'active', sanitizeText(job_title || ''), sanitizeText(address || ''));
    opLog(req.user?.id || 0, store_id || 0, '员工', '创建员工 ' + (name || username));
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

// PUT update user — S5: 禁止非管理员修改 role
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!targetUser) return res.status(404).json({ error: '用户不存在' });
    if (!isAdmin(req.user.role) && parseInt(req.params.id) !== req.user.id) {
      return res.status(403).json({ error: '无权限' });
    }
    // 非管理员只能修改自己的基本信息（字段白名单）
    let body = req.body;
    if (!isAdmin(req.user.role)) {
      const allowedFields = ['name', 'phone', 'address', 'avatar', 'password'];
      const safeBody: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) safeBody[key] = req.body[key];
      }
      body = safeBody;
    }
    const { username, password, name, phone, role, store_id, avatar, salary, status, job_title, address } = body;
    // S5: 非管理员不能修改角色
    if (role !== undefined && !isAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权修改角色' });
    }
    let sql = 'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), role = COALESCE(?, role), store_id = COALESCE(?, store_id), avatar = COALESCE(?, avatar), salary = COALESCE(?, salary), status = COALESCE(?, status), job_title = COALESCE(?, job_title), address = COALESCE(?, address), updated_at = datetime(?,?)';
    const params: any[] = [sanitizeText(name), phone, role ? role.toUpperCase() : role, store_id, avatar, salary, status, sanitizeText(job_title), sanitizeText(address), 'now', 'localtime'];
    if (username) { sql += ', username = ?'; params.push(username); }
    if (password) {
      // Non-ADMIN must provide old password to change password
      if (!isAdmin(req.user.role)) {
        const { oldPassword } = body;
        if (!oldPassword) return res.status(400).json({ error: '非管理员修改密码需提供旧密码' });
        if (!await bcrypt.compare(oldPassword, targetUser.password_hash)) return res.status(401).json({ error: '旧密码错误' });
      }
      sql += ', password_hash = ?'; params.push(await bcrypt.hash(password, 10));
    }
    sql += ' WHERE id = ?';
    params.push(req.params.id);
    db.prepare(sql).run(...params);
    opLog(req.user?.id || 0, store_id || 0, '员工', '更新员工 ' + (name || username));
    userCache.invalidate('user_' + req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

// DELETE user — S5: 仅 ADMIN
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) return res.status(404).json({ error: '用户不存在' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    opLog(req.user?.id || 0, 0, '员工', '删除员工 ' + (user.name || user.username));
    userCache.invalidate('user_' + req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

export default router;
