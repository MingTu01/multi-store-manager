import { localDate } from '../lib/utils.js';
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';
import { sendStoreNotification } from '../notify.js';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    let stores;
    if (user.role === 'admin' || user.role === 'ADMIN') {
      stores = db.prepare('SELECT * FROM stores ORDER BY id').all();
    } else if (user.store_id) {
      stores = db.prepare('SELECT * FROM stores WHERE id = ?').all(user.store_id);
    } else {
      stores = db.prepare('SELECT s.* FROM stores s JOIN shareholders sh ON s.id = sh.store_id WHERE sh.name = ?').all(user.username);
    }
    const enriched = (stores as any[]).map((store: any) => {
      const staffCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE store_id = ?').get(store.id) as any).count || 0;
      const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(store.id);
      return { ...store, staff_count: staffCount, shareholders };
    });
    res.json({ stores: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:storeId', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    const storeId = req.params.storeId;
    if (user.role !== 'admin' && user.role !== 'ADMIN' && user.role !== 'manager' && user.role !== 'MANAGER' && String(user.store_id) !== String(storeId)) {
      // 检查是否是股东
      const sh = db.prepare('SELECT id FROM shareholders WHERE store_id = ? AND name = ?').get(storeId, user.username) as any;
      if (!sh) return res.status(403).json({ error: '无权访问该门店' });
    }
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.storeId) as any;
    if (!store) return res.status(404).json({ error: '门店不存在' });
    const staffCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE store_id = ?').get(store.id) as any).count || 0;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(store.id);
    res.json({ ...store, staff_count: staffCount, shareholders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { id, name, address, initial_capital } = req.body;
    if (!name) return res.status(400).json({ error: '请输入门店名称' });
    const storeId = id || 'store_' + Date.now();
    const photos = JSON.stringify(req.body.photos || []);
    db.prepare('INSERT INTO stores (id, name, address, initial_capital, photos) VALUES (?,?,?,?,?)').run(storeId, name, address || '', initial_capital || 0, photos);
    const shBody = req.body.shareholders;
    if (Array.isArray(shBody) && shBody.length > 0) {
      const stmt = db.prepare('INSERT INTO shareholders (store_id, name, phone, ratio) VALUES (?,?,?,?)');
      for (const sh of shBody) { stmt.run(storeId, sh.name || '', sh.phone || '', sh.ratio || 0); }
    }
    opLog(req.user.id, 0, '创建门店', '创建门店: ' + name);

    triggerNotification({
      type: 'store',
      action: '创建门店',
      storeId,
      detail: '新门店已创建: ' + name
    , operatorName: req.user.name || req.user.username});

    res.json({ id: storeId, message: '门店创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:storeId', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN', 'store_admin', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const { name, address, initial_capital } = req.body;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE stores SET name = COALESCE(?, name), address = COALESCE(?, address), initial_capital = COALESCE(?, initial_capital), updated_at = ? WHERE id = ?').run(name, address, initial_capital, now, req.params.storeId);
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
    opLog(req.user.id, 0, '修改门店', '修改门店信息');

    triggerNotification({
      type: 'store',
      action: '修改门店',
      storeId: req.params.storeId,
      detail: '门店信息已更新' + (name ? ': ' + name : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '门店更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '请输入管理员密码' });
    const admin = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as any;
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: '密码错误' });
    }
    const store = db.prepare('SELECT name FROM stores WHERE id = ?').get(req.params.id) as any;
    if (!store) return res.status(404).json({ error: '门店不存在' });
    db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM entries WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM inventory_checks WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM store_opens WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dividends WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM payroll WHERE store_id = ?').run(req.params.id);
    db.prepare('DELETE FROM handovers WHERE store_id = ?').run(req.params.id);
    db.prepare("UPDATE users SET store_id = NULL WHERE store_id = ?").run(req.params.id);
    db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
    opLog(req.user.id, 0, '删除门店', '删除门店: ' + store.name);

    triggerNotification({
      type: 'store',
      action: '删除门店',
      storeId: req.params.id,
      detail: '门店已删除: ' + store.name
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '门店已删除' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:storeId/stats', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!['admin','ADMIN','store_admin','STORE_ADMIN','manager','MANAGER'].includes(user.role) && String(user.store_id) !== String(req.params.storeId)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const today = localDate();
    const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('收入','income') AND date=?").get(storeId, today) as any)?.total || 0;
    const expense = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('支出','expense') AND date=?").get(storeId, today) as any)?.total || 0;
    const staffCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE store_id = ?').get(storeId) as any).count || 0;
    res.json({ income, expense, profit: income - expense, staffCount });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:storeId/staff', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!['admin','ADMIN','store_admin','STORE_ADMIN','manager','MANAGER'].includes(user.role) && String(user.store_id) !== String(req.params.storeId)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const staff = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at, health_cert_url, health_cert_name, health_cert_expiry, health_cert_verified FROM users WHERE store_id = ?').all(storeId);
    res.json({ staff });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:storeId/staff', (req: AuthRequest, res: Response) => {
    if (!['admin', 'ADMIN', 'store_admin', 'STORE_ADMIN', 'manager', 'MANAGER'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
  try {
    const storeId = req.params.storeId;
    const { name, phone, position, address, monthly_salary, role, password, avatar, status } = req.body;
    if (!name || !phone) return res.status(400).json({ error: '请填写姓名和手机号' });
    const username = phone;
    if (password && password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    const pw = (password && password.length > 0) ? password : '123456';
    const passwordHash = bcrypt.hashSync(pw, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, name, phone, role, store_id, avatar, salary, status, job_title, address) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(username, passwordHash, name, phone, ((['MANAGER','STORE_ADMIN'].includes(req.user.role?.toUpperCase()) && ['STAFF'].includes((role||'').toUpperCase())) || ['admin','ADMIN','store_admin','STORE_ADMIN'].includes(req.user.role) ? (['STAFF','MANAGER'].includes((role||'').toUpperCase()) ? role.toUpperCase() : 'STAFF') : 'STAFF'), storeId, avatar || '', monthly_salary || 0, status || 'active', position || '', address || '');
    opLog(req.user.id, storeId, '添加员工', '添加员工: ' + name);

    triggerNotification({
      type: 'staff',
      action: '添加员工',
      storeId,
      detail: '新员工已添加: ' + name + (position ? ' (' + position + ')' : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ id: result.lastInsertRowid, message: '员工添加成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
    if (!['admin', 'ADMIN', 'store_admin', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
  try {
    const { name, phone, position, address, monthly_salary, role, password, avatar, status } = req.body;
    const fields = [];
    const vals = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(name); }
    if (phone !== undefined) { fields.push('phone=?'); vals.push(phone); }
    if (position !== undefined) { fields.push('job_title=?'); vals.push(position); }
    if (address !== undefined) { fields.push('address=?'); vals.push(address); }
    if (monthly_salary !== undefined) { fields.push('salary=?'); vals.push(monthly_salary); }
    if (role !== undefined) { fields.push('role=?'); vals.push(role); }
    if (avatar !== undefined) { fields.push('avatar=?'); vals.push(avatar); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (password) { fields.push('password_hash=?'); vals.push(bcrypt.hashSync(password, 10)); }
    if (fields.length > 0) {
      vals.push(req.params.id);
      db.prepare('UPDATE users SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    }
    opLog(req.user.id, req.params.storeId, '修改员工', '修改员工 #' + req.params.id);

    triggerNotification({
      type: 'staff',
      action: '修改员工',
      storeId: req.params.storeId,
      detail: '员工 #' + req.params.id + ' 信息已更新' + (name ? ': ' + name : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '员工信息已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN', 'store_admin', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    db.prepare('DELETE FROM users WHERE id = ? AND store_id = ?').run(req.params.id, req.params.storeId);
    opLog(req.user.id, req.params.storeId, '删除员工', '删除员工 #' + req.params.id);
    res.json({ message: '员工已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT role, store_id FROM users WHERE id = ?').get(req.user.id) as any;
    if (!['admin','ADMIN','store_admin','STORE_ADMIN','manager','MANAGER'].includes(user.role) && String(user.store_id) !== String(req.params.storeId)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId);
    res.json(shareholders);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const { shareholders } = req.body;
    if (!Array.isArray(shareholders)) return res.status(400).json({ error: '参数错误' });
    db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(storeId);
    const stmt = db.prepare('INSERT INTO shareholders (store_id, name, phone, ratio) VALUES (?,?,?,?)');
    for (const sh of shareholders) { stmt.run(storeId, sh.name || '', sh.phone || '', sh.ratio || 0); }
    opLog(req.user.id, 0, '更新股东', '更新股东配置');
    res.json({ message: '股东信息更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 店铺通知设置 - GET
router.get('/:storeId/notification-settings', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const settings = db.prepare('SELECT * FROM store_notification_settings WHERE store_id = ?').get(storeId);
    if (!settings) {
      db.prepare('INSERT INTO store_notification_settings (store_id) VALUES (?)').run(storeId);
      res.json(db.prepare('SELECT * FROM store_notification_settings WHERE store_id = ?').get(storeId));
    } else {
      res.json(settings);
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 店铺通知设置 - PUT
router.put('/:storeId/notification-settings', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const s = req.body;
    const exists = db.prepare('SELECT id FROM store_notification_settings WHERE store_id = ?').get(storeId);
    if (!exists) {
      db.prepare('INSERT INTO store_notification_settings (store_id) VALUES (?)').run(storeId);
    }
    db.prepare(`UPDATE store_notification_settings SET
      method=COALESCE(?, method), pushplus_token=COALESCE(?, pushplus_token),
      serverchan_key=COALESCE(?, serverchan_key), wecom_corpid=COALESCE(?, wecom_corpid),
      wecom_agentid=COALESCE(?, wecom_agentid), wecom_secret=COALESCE(?, wecom_secret),
      wecom_userid=COALESCE(?, wecom_userid), wecom_proxy_url=COALESCE(?, wecom_proxy_url),
      push_daily_report=COALESCE(?, push_daily_report), push_weekly_report=COALESCE(?, push_weekly_report),
      push_monthly_report=COALESCE(?, push_monthly_report), push_review_reminder=COALESCE(?, push_review_reminder),
      push_alert=COALESCE(?, push_alert), updated_at=datetime('now','localtime')
      WHERE store_id=?`).run(
      s.method, s.pushplus_token, s.serverchan_key, s.wecom_corpid, s.wecom_agentid,
      s.wecom_secret, s.wecom_userid, s.wecom_proxy_url,
      s.push_daily_report, s.push_weekly_report, s.push_monthly_report,
      s.push_review_reminder, s.push_alert, storeId
    );
    res.json({ message: '通知设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 店铺通知测试
router.post('/:storeId/notification-settings/test', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const settings = db.prepare('SELECT * FROM store_notification_settings WHERE store_id = ?').get(storeId) as any;
    if (!settings) return res.status(400).json({ error: '请先配置通知渠道' });
    // imported at top
    sendStoreNotification(storeId, '测试通知', '这是一条测试通知\n发送时间: ' + new Date().toLocaleString('zh-CN'), settings)
      .then(() => res.json({ message: '测试通知已发送' }))
      .catch((err: any) => res.status(500).json({ error: '发送失败: ' + err.message }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});



export default router;
