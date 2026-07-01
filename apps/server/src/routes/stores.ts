import { requireAdmin, requireStoreAdminOrAbove } from '../middleware/require-role.js';
import { localDate, localDateTime } from '../lib/utils.js';
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isStoreAdmin, isManagerOrAbove, entryFilterClause } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import { sanitizeText } from '../sanitize.js';
import { triggerNotification } from '../notify-trigger.js';
import { AppError, ErrorCode } from '../error-handler.js';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    let stores;
    if (isAdmin(user.role)) {
      stores = db.prepare('SELECT * FROM stores ORDER BY id').all();
    } else if (user.store_id) {
      stores = db.prepare('SELECT * FROM stores WHERE id = ?').all(user.store_id);
    } else {
      stores = db.prepare('SELECT s.* FROM stores s JOIN shareholders sh ON s.id = sh.store_id WHERE sh.name = ?').all(user.username);
    }
    // 批量获取所有门店的 staff_count
    const staffCounts = db.prepare('SELECT store_id, COUNT(*) as count FROM users GROUP BY store_id').all() as any[];
    const staffMap = new Map(staffCounts.map((s: any) => [s.store_id, s.count]));

    // 批量获取所有门店的 shareholders
    const allShareholders = db.prepare('SELECT * FROM shareholders ORDER BY store_id, id').all() as any[];
    const shMap = new Map<string, any[]>();
    for (const sh of allShareholders) {
      if (!shMap.has(sh.store_id)) shMap.set(sh.store_id, []);
      shMap.get(sh.store_id)!.push(sh);
    }

    const enriched = (stores as any[]).map((store: any) => ({
      ...store,
      staff_count: staffMap.get(store.id) || 0,
      shareholders: shMap.get(store.id) || [],
    }));
    res.json({ stores: enriched });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.get('/:storeId', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    const storeId = req.params.storeId;
    if (!isManagerOrAbove(user.role) && String(user.store_id) !== String(storeId)) {
      // 检查是否是股东
      const sh = db.prepare('SELECT id FROM shareholders WHERE store_id = ? AND name = ?').get(storeId, user.username) as any;
      if (!sh) throw new AppError(ErrorCode.PERM_STORE_DENIED, '无权访问该门店', 403);
    }
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.storeId) as any;
    if (!store) throw new AppError(ErrorCode.RES_NOT_FOUND, '门店不存在', 404);
    const staffCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE store_id = ?').get(store.id) as any).count || 0;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(store.id);
    res.json({ ...store, staff_count: staffCount, shareholders });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const { id, name, address, initial_capital } = req.body;
    if (!name) throw new AppError(ErrorCode.INPUT_REQUIRED, '请输入门店名称', 400);
    const storeId = id || 'store_' + Date.now();
    const photos = JSON.stringify(req.body.photos || []);
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO stores (id, name, address, initial_capital, photos) VALUES (?,?,?,?,?)').run(storeId, sanitizeText(name), sanitizeText(address || ''), initial_capital || 0, photos);
      const shBody = req.body.shareholders;
      if (Array.isArray(shBody) && shBody.length > 0) {
        const stmt = db.prepare('INSERT INTO shareholders (store_id, name, phone, ratio) VALUES (?,?,?,?)');
        for (const sh of shBody) { stmt.run(storeId, sh.name || '', sh.phone || '', sh.ratio || 0); }
      }
    });
    tx();
    opLog(req.user.id, 0, '创建门店', '创建门店: ' + name);

    triggerNotification({
      type: 'store',
      action: '创建门店',
      storeId,
      storeName: name,
      detail: '新门店已创建'
    , operatorName: req.user.name || req.user.username});

    res.json({ id: storeId, message: '门店创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.put('/:storeId', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const { name, address, initial_capital } = req.body;
    const now = localDateTime();
    const tx = db.transaction(() => {
      db.prepare('UPDATE stores SET name = COALESCE(?, name), address = COALESCE(?, address), initial_capital = COALESCE(?, initial_capital), updated_at = ? WHERE id = ?').run(sanitizeText(name), sanitizeText(address), initial_capital, now, req.params.storeId);
      const photos = req.body.photos;
      if (Array.isArray(photos)) {
        db.prepare('UPDATE stores SET photos = ? WHERE id = ?').run(JSON.stringify(photos), req.params.storeId);
      }
      const shBody = req.body.shareholders;
      if (Array.isArray(shBody)) {
        db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(req.params.storeId);
        const stmt = db.prepare('INSERT INTO shareholders (store_id, name, phone, ratio) VALUES (?,?,?,?)');
        for (const sh of shBody) { stmt.run(req.params.storeId, sh.name || '', sh.phone || '', sh.ratio || 0); }
      }
    });
    tx();
    opLog(req.user.id, 0, '修改门店', '修改门店信息');

    triggerNotification({
      type: 'store',
      action: '修改门店',
      storeId: req.params.storeId,
      detail: '门店信息已更新'
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '门店更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const { password } = req.body;
    if (!password) throw new AppError(ErrorCode.INPUT_REQUIRED, '请输入管理员密码', 400);
    const admin = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as any;
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
      throw new AppError(ErrorCode.AUTH_PASSWORD_WRONG, '密码错误', 401);
    }
    const store = db.prepare('SELECT name FROM stores WHERE id = ?').get(req.params.id) as any;
    if (!store) throw new AppError(ErrorCode.RES_NOT_FOUND, '门店不存在', 404);
    const deleteStore = db.transaction((storeId: string) => {
      db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM entries WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM payroll_items WHERE payroll_id IN (SELECT id FROM payroll WHERE store_id = ?)').run(storeId);
      db.prepare('DELETE FROM payroll WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM dividend_details WHERE dividend_id IN (SELECT id FROM dividends WHERE store_id = ?)').run(storeId);
      db.prepare('DELETE FROM dividends WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM inventory_check_items WHERE check_id IN (SELECT id FROM inventory_checks WHERE store_id = ?)').run(storeId);
      db.prepare('DELETE FROM inventory_checks WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM inventory_master WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM handovers WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM store_opens WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM notifications WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM op_logs WHERE target = ?').run(storeId);
      db.prepare('DELETE FROM purchase_records WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM purchase_items WHERE store_id = ?').run(storeId);
      db.prepare('DELETE FROM store_notification_settings WHERE store_id = ?').run(storeId);
      db.prepare("DELETE FROM users WHERE store_id = ? AND role != 'ADMIN'").run(storeId);
      db.prepare('UPDATE users SET store_id = NULL WHERE store_id = ? AND role = ?').run(storeId, 'ADMIN');
      db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);
    });
    deleteStore(req.params.id);
    opLog(req.user.id, 0, '删除门店', '删除门店: ' + store.name);

    triggerNotification({
      type: 'store',
      action: '删除门店',
      storeId: req.params.id,
      storeName: store.name,
      detail: '门店已删除'
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '门店已删除' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

router.get('/:storeId/stats', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!isManagerOrAbove(user.role) && String(user.store_id) !== String(req.params.storeId)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const storeId = req.params.storeId;
    const today = localDate();
    const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('收入','income') AND date=?" + entryFilterClause(req.user.role)).get(storeId, today) as any)?.total || 0;
    const expense = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('支出','expense') AND date=?" + entryFilterClause(req.user.role)).get(storeId, today) as any)?.total || 0;
    const staffCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE store_id = ?').get(storeId) as any).count || 0;
    res.json({ income, expense, profit: income - expense, staffCount });
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.get('/:storeId/staff', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!isManagerOrAbove(user.role) && String(user.store_id) !== String(req.params.storeId)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const storeId = req.params.storeId;
    const staff = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at, health_cert_url, health_cert_name, health_cert_expiry, health_cert_verified FROM users WHERE store_id = ?').all(storeId);
    res.json({ staff });
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.post('/:storeId/staff', (req: AuthRequest, res: Response) => {
    if (!isManagerOrAbove(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
  try {
    const storeId = req.params.storeId;
    const { name, phone, position, address, monthly_salary, role, password, avatar, status } = req.body;
    if (!name || !phone) throw new AppError(ErrorCode.INPUT_REQUIRED, '请填写姓名和手机号', 400);
    const username = phone;
    if (password && password.length < 6) throw new AppError(ErrorCode.INPUT_LENGTH, '密码至少6位', 400);
    // 改回固定默认密码 123456
    const pw = (password && password.length > 0) ? password : '123456';
    const mustChangePwd = (password && password.length > 0) ? 0 : 1;
    const passwordHash = bcrypt.hashSync(pw, 10);
    // Determine allowed role based on creator's role
    const creatorRole = req.user.role?.toUpperCase();
    let finalRole = 'STAFF';
    if (role) {
      const r = role.toUpperCase();
      if (creatorRole === 'ADMIN') {
        finalRole = ['ADMIN','STORE_ADMIN','MANAGER','STAFF','SHAREHOLDER'].includes(r) ? r : 'STAFF';
      } else if (creatorRole === 'STORE_ADMIN') {
        finalRole = ['STORE_ADMIN','MANAGER','STAFF','SHAREHOLDER'].includes(r) ? r : 'STAFF';
      } else if (creatorRole === 'MANAGER') {
        finalRole = ['STAFF'].includes(r) ? r : 'STAFF';
      }
    }
    const result = db.prepare('INSERT INTO users (username, password_hash, name, phone, role, store_id, avatar, salary, status, job_title, address, must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(username, passwordHash, name, phone, finalRole, storeId, avatar || '', monthly_salary || 0, status || 'active', position || '', address || '', mustChangePwd);
    opLog(req.user.id, storeId, '添加员工', '添加员工: ' + name);

    triggerNotification({
      type: 'staff',
      action: '添加员工',
      storeId,
      detail: '新员工已添加，' + name + (position ? '，' + position : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ id: result.lastInsertRowid, message: '员工添加成功，默认密码: 123456，首次登录需修改密码' });
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
  if (!isManagerOrAbove(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
  try {
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!targetUser) throw new AppError(ErrorCode.RES_NOT_FOUND, '员工不存在', 404);
    if (targetUser.role === 'ADMIN') throw new AppError(ErrorCode.PERM_ROLE_DENIED, '不允许修改管理员账户，请联系管理员', 403);
    if (targetUser.store_id && String(targetUser.store_id) !== String(req.params.storeId)) {
      throw new AppError(ErrorCode.PERM_STORE_DENIED, '该员工不属于此门店', 403);
    }
    const { name, phone, position, address, monthly_salary, role, password, avatar, status } = req.body;
    const fields = [];
    const vals = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(name); }
    if (phone !== undefined) {
      fields.push('phone=?'); vals.push(phone);
      // Sync username to phone (except ADMIN role)
      if (targetUser.role !== 'ADMIN') { fields.push('username=?'); vals.push(phone); }
    }
    if (position !== undefined) { fields.push('job_title=?'); vals.push(position); }
    if (address !== undefined) { fields.push('address=?'); vals.push(address); }
    if (monthly_salary !== undefined) { fields.push('salary=?'); vals.push(monthly_salary); }
    if (role !== undefined) {
      const allowedRoles = ['STAFF', 'MANAGER', 'SHAREHOLDER', 'STORE_ADMIN'];
      if (!allowedRoles.includes(role)) throw new AppError(ErrorCode.INPUT_FORMAT, '无效的角色', 400);
      if (!isStoreAdmin(req.user.role) && role && role !== 'STAFF') {
        return res.status(403).json({ error: '无权设置该角色' });
      }
      fields.push('role=?'); vals.push(role);
    }
    if (avatar !== undefined) { fields.push('avatar=?'); vals.push(avatar); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (password) { fields.push('password_hash=?'); vals.push(bcrypt.hashSync(password, 10)); }
    if (fields.length > 0) {
      fields.push("updated_at=datetime('now','localtime')");
      vals.push(req.params.id);
      db.prepare('UPDATE users SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    }
    const opDetail = password ? '修改员工 #' + req.params.id + ' (含密码修改)' : '修改员工 #' + req.params.id;
    opLog(req.user.id, req.params.storeId, '修改员工', opDetail, req.ip);

    triggerNotification({
      type: 'staff',
      action: '修改员工',
      storeId: req.params.storeId,
      detail: '员工 #' + req.params.id + ' 信息已更新' + (name ? '，' + name : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '员工信息已更新' });
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.delete('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    // 先查询员工信息用于通知
    const staff = db.prepare('SELECT name, job_title FROM users WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    db.prepare('DELETE FROM users WHERE id = ? AND store_id = ? AND role != ?').run(req.params.id, req.params.storeId, 'ADMIN');
    opLog(req.user.id, req.params.storeId, '删除员工', '删除员工 #' + req.params.id);
    // 触发员工通知（ADMIN + 店铺管理员 + 店长），统一用 staff 类型
    triggerNotification({
      type: 'staff',
      action: '删除员工',
      storeId: req.params.storeId,
      detail: '员工 #' + req.params.id + (staff ? '，' + (staff.name || '') + (staff.job_title ? '，' + staff.job_title : '') : '') + ' 已删除',
      operatorName: req.user.name || req.user.username
    });
    res.json({ message: '员工已删除' });
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.get('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!isManagerOrAbove(user.role) && String(user.store_id) !== String(req.params.storeId)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const storeId = req.params.storeId;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId);
    res.json(shareholders);
  } catch (err: any) { if (err instanceof AppError) throw err; res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) throw new AppError(ErrorCode.PERM_DENIED, '无权限', 403);
    const storeId = req.params.storeId;
    const { shareholders } = req.body;
    if (!Array.isArray(shareholders)) throw new AppError(ErrorCode.INPUT_REQUIRED, '参数错误', 400);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(storeId);
      const stmt = db.prepare('INSERT INTO shareholders (store_id, name, phone, ratio) VALUES (?,?,?,?)');
      for (const sh of shareholders) { stmt.run(storeId, sh.name || '', sh.phone || '', sh.ratio || 0); }
    });
    tx();
    opLog(req.user.id, 0, '更新股东', '更新股东配置');
    res.json({ message: '股东信息更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

export default router;
