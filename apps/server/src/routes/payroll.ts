import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;
    const total = (db.prepare('SELECT COUNT(*) as count FROM payroll WHERE store_id = ?').get(storeId) as any).count;
    const payrolls = db.prepare('SELECT * FROM payroll WHERE store_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(storeId, ps, offset);
    const enriched = payrolls.map((pr: any) => {
      const items = db.prepare('SELECT * FROM payroll_items WHERE payroll_id = ?').all(pr.id);
      return { ...pr, items };
    });
    res.json({ payrolls: enriched, total, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { period, items } = req.body;
    if (!period) return res.status(400).json({ error: '请输入工资周期' });
    let totalAmount = 0;
    if (Array.isArray(items)) {
      for (const item of items) { totalAmount += (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0); }
    }
    const result = db.prepare('INSERT INTO payroll (store_id, period, total_amount, created_by) VALUES (?,?,?,?)').run(storeId, period, totalAmount, req.user.id);
    const payrollId = result.lastInsertRowid;
    if (Array.isArray(items)) {
      const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
      for (const item of items) {
        const actual = (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0);
        stmt.run(payrollId, item.user_id, item.user_name || item.username || '', item.base_amount || item.base_salary || 0, item.bonus || 0, item.deduction || 0, actual, item.job_title || '');
      }
    }
    db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)').run(storeId, '支出', '工资', totalAmount, '工资支出 ' + period + ' #' + payrollId, new Date().toISOString().slice(0, 10), req.user.id);
    opLog(req.user.id, 0, '创建工资单', '创建工资单 #' + payrollId + ' 周期: ' + period);
    res.json({ id: payrollId, message: '工资单创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { period, items } = req.body;
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '工资单不存在' });
    if (payroll.status === 'confirmed') return res.status(400).json({ error: '已确认的工资单不能修改' });
    let totalAmount = 0;
    if (Array.isArray(items)) {
      for (const item of items) { totalAmount += (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0); }
    }
    db.prepare('UPDATE payroll SET period = COALESCE(?, period), total_amount = ? WHERE id = ?').run(period, totalAmount, req.params.id);
    if (Array.isArray(items)) {
      db.prepare('DELETE FROM payroll_items WHERE payroll_id = ?').run(req.params.id);
      const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
      for (const item of items) {
        const actual = (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0);
        stmt.run(req.params.id, item.user_id, item.user_name || item.username || '', item.base_amount || item.base_salary || 0, item.bonus || 0, item.deduction || 0, actual, item.job_title || '');
      }
    }
    opLog(req.user.id, 0, '修改工资单', '修改工资单 #' + req.params.id);
    res.json({ message: '工资单更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/confirm', (req: AuthRequest, res: Response) => {
  try {
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '工资单不存在' });
    db.prepare("UPDATE payroll SET status = 'confirmed' WHERE id = ?").run(req.params.id);
    opLog(req.user.id, 0, '确认工资单', '确认工资单 #' + req.params.id);
    res.json({ message: '工资单已确认' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// POST /generate - auto-generate payroll from staff
router.post('/generate', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { period, month } = req.body;
    const payrollPeriod = period || month;
    if (!payrollPeriod) return res.status(400).json({ error: '请输入工资周期' });
    const staff = db.prepare('SELECT id, name, salary, job_title FROM users WHERE store_id = ? AND role IN (\'STAFF\',\'MANAGER\') AND status = \'active\'').all(storeId) as any[];
    if (staff.length === 0) return res.status(400).json({ error: '该门店没有在职员工' });
    let totalAmount = 0;
    const items = staff.map((s: any) => {
      const base = s.salary || 0;
      totalAmount += base;
      return { user_id: s.id, user_name: s.name, base_amount: base, bonus: 0, deduction: 0, total_amount: base, job_title: s.job_title || '' };
    });
    const result = db.prepare('INSERT INTO payroll (store_id, period, total_amount, created_by) VALUES (?,?,?,?)').run(storeId, payrollPeriod, totalAmount, req.user.id);
    const payrollId = result.lastInsertRowid;
    const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
    for (const item of items) {
      stmt.run(payrollId, item.user_id, item.user_name, item.base_amount, item.bonus, item.deduction, item.total_amount, item.job_title);
    }
    opLog(req.user.id, storeId, '创建工资单', '创建工资单 #' + payrollId + ' 周期: ' + payrollPeriod);
    res.json({ id: payrollId, message: '工资单生成成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/confirm - confirm payroll
router.put('/:id/confirm', (req: AuthRequest, res: Response) => {
  try {
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '工资单不存在' });
    db.prepare("UPDATE payroll SET status = 'confirmed' WHERE id = ?").run(req.params.id);
    // Create expense entry for payroll
    db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run(req.params.storeId, '支出', '工资', payroll.total_amount, '工资支出 ' + payroll.period + ' #' + req.params.id, new Date().toISOString().slice(0, 10), req.user.id);
    opLog(req.user.id, req.params.storeId, '确认工资单', '确认工资单 #' + req.params.id);
    res.json({ message: '工资单已确认' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
