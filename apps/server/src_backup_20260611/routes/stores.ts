import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';

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
    db.prepare('INSERT INTO stores (id, name, address, initial_capital) VALUES (?,?,?,?)').run(storeId, name, address || '', initial_capital || 0);
    opLog(req.user.id, 0, '创建门店', '创建门店: ' + name);
    res.json({ id: storeId, message: '门店创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:storeId', (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { name, address, initial_capital } = req.body;
    db.prepare('UPDATE stores SET name = COALESCE(?, name), address = COALESCE(?, address), initial_capital = COALESCE(?, initial_capital), updated_at = datetime("now","localtime") WHERE id = ?').run(name, address, initial_capital, req.params.storeId);
    opLog(req.user.id, 0, '修改门店', '修改门店信息');
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
    const storeId = req.params.id;
    db.prepare('DELETE FROM shareholders WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM entries WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM inventory_items WHERE check_id IN (SELECT id FROM inventory_checks WHERE store_id = ?)').run(storeId);
    db.prepare('DELETE FROM inventory_checks WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM store_opens WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM dividend_details WHERE dividend_id IN (SELECT id FROM dividends WHERE store_id = ?)').run(storeId);
    db.prepare('DELETE FROM dividends WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM payroll_items WHERE payroll_id IN (SELECT id FROM payroll WHERE store_id = ?)').run(storeId);
    db.prepare('DELETE FROM payroll WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM handovers WHERE store_id = ?').run(storeId);
    db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);
    res.json({ message: '门店已删除' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:storeId/summary', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { date, dateFrom, dateTo, month, year } = req.query;
    let dateCondition = '';
    const params: any[] = [storeId];
    if (date) { dateCondition = 'AND date = ?'; params.push(date); }
    else if (dateFrom && dateTo) { dateCondition = 'AND date >= ? AND date <= ?'; params.push(dateFrom, dateTo); }
    else if (month) { dateCondition = 'AND date LIKE ?'; params.push(month + '%'); }
    else if (year) { dateCondition = 'AND date LIKE ?'; params.push(year + '%'); }
    const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '收入' " + dateCondition).get(...params) as any).total;
    const expense = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '支出' " + dateCondition).get(...params) as any).total;
    const today = new Date().toISOString().slice(0, 10);
    const todayIncome = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '收入' AND date = ?").get(storeId, today) as any).total;
    const todayExpense = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '支出' AND date = ?").get(storeId, today) as any).total;
    res.json({ income: income || 0, expense: expense || 0, profit: (income || 0) - (expense || 0) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:storeId/staff', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const staff = db.prepare('SELECT id, username, name, phone, role, store_id, avatar, salary, status, job_title, address, created_at FROM users WHERE store_id = ?').all(storeId);
    res.json({ staff });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/:storeId/staff', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { name, phone, position, address, monthly_salary, role, password, avatar, status } = req.body;
    if (!name || !phone) return res.status(400).json({ error: '请填写姓名和手机号' });
    const username = phone;
    const pw = (password && password.length > 0) ? password : '123456';
    const passwordHash = bcrypt.hashSync(pw, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, name, phone, role, store_id, avatar, salary, status, job_title, address) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(username, passwordHash, name, phone, role || 'STAFF', storeId, avatar || '', monthly_salary || 0, status || 'active', position || '', address || '');
    opLog(req.user.id, storeId, '添加员工', '添加员工: ' + name);
    res.json({ id: result.lastInsertRowid, message: '员工添加成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
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
    res.json({ message: '员工信息已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:storeId/staff/:id', (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    db.prepare('DELETE FROM users WHERE id = ? AND store_id = ?').run(req.params.id, req.params.storeId);
    opLog(req.user.id, req.params.storeId, '删除员工', '删除员工 #' + req.params.id);
    res.json({ message: '员工已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId);
    res.json(shareholders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:storeId/shareholders', (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
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

export default router;