import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';
import { isAdmin, isManagerOrAbove } from '../lib/roles.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;
    const canSeeAll = req.user.role !== 'STAFF';
    const total = (db.prepare('SELECT COUNT(*) as count FROM payroll WHERE store_id = ?').get(storeId) as any).count;
    const payrolls = db.prepare('SELECT * FROM payroll WHERE store_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(storeId, ps, offset);
    const enriched = payrolls.map((pr: any) => {
      let items;
      if (canSeeAll) {
        items = db.prepare('SELECT pi.*, u.name as user_display_name, u.username, u.avatar, u.job_title as user_job_title FROM payroll_items pi LEFT JOIN users u ON pi.user_id=u.id WHERE pi.payroll_id = ?').all(pr.id);
      } else {
        items = db.prepare('SELECT pi.*, u.name as user_display_name, u.username, u.avatar, u.job_title as user_job_title FROM payroll_items pi LEFT JOIN users u ON pi.user_id=u.id WHERE pi.payroll_id = ? AND pi.user_id = ?').all(pr.id, req.user.id);
      }
      return { ...pr, items };
    }).filter((pr: any) => canSeeAll || pr.items.length > 0);
    res.json({ payrolls: enriched, total, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const storeId = req.params.storeId;
    const { period, items } = req.body;
    if (items && Array.isArray(items)) { for (const item of items) { if (item.base_amount < 0 || item.bonus < 0 || item.deduction < 0) return res.status(400).json({ error: '宸ヨ祫閲戦涓嶈兘涓鸿礋鏁? }); } }
    if (!period) return res.status(400).json({ error: '璇疯緭鍏ュ伐璧勫懆鏈? });
    let totalAmount = 0;
    if (Array.isArray(items)) {
      for (const item of items) { totalAmount += (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0); }
    }
    let payrollId: any;
    const tx = db.transaction(() => {
      const result = db.prepare('INSERT INTO payroll (store_id, period, total_amount, created_by) VALUES (?,?,?,?)').run(storeId, period, totalAmount, req.user.id);
      payrollId = result.lastInsertRowid;
      if (Array.isArray(items)) {
        const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
        for (const item of items) {
          const actual = (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0);
          stmt.run(payrollId, item.user_id, item.user_name || '', item.base_amount || item.base_salary || 0, item.bonus || 0, item.deduction || 0, actual, item.job_title || '');
        }
      }
    });
    tx();
    res.json({ id: payrollId, message: '宸ヨ祫鍗曞垱寤烘垚鍔? });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const { period, items } = req.body;
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '宸ヨ祫鍗曚笉瀛樺湪' });
    if (payroll.status === 'confirmed') return res.status(400).json({ error: '宸茬‘璁ょ殑宸ヨ祫鍗曚笉鑳戒慨鏀? });
    let totalAmount = 0;
    if (Array.isArray(items)) {
      for (const item of items) { totalAmount += (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0); }
    }
    const tx = db.transaction(() => {
      db.prepare('UPDATE payroll SET period = COALESCE(?, period), total_amount = ? WHERE id = ?').run(period, totalAmount, req.params.id);
      if (Array.isArray(items)) {
        db.prepare('DELETE FROM payroll_items WHERE payroll_id = ?').run(req.params.id);
        const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
        for (const item of items) {
          const actual = (item.base_amount || item.base_salary || 0) + (item.bonus || 0) - (item.deduction || 0);
          stmt.run(req.params.id, item.user_id, item.user_name || '', item.base_amount || item.base_salary || 0, item.bonus || 0, item.deduction || 0, actual, item.job_title || '');
        }
      }
    });
    tx();
    res.json({ message: '宸ヨ祫鍗曟洿鏂版垚鍔? });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /generate
router.post('/generate', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const storeId = req.params.storeId;
    const { period, month, staff } = req.body;
    const payrollPeriod = period || month;
    if (!payrollPeriod) return res.status(400).json({ error: '璇疯緭鍏ュ伐璧勫懆鏈? });
    let items: any[] = [];
    if (Array.isArray(staff) && staff.length > 0) {
      items = staff.map((s: any) => {
        const base = s.base_salary || s.monthly_salary || 0;
        const bonus = s.bonus || 0;
        const deduction = s.deduction || 0;
        let userName = s.user_name || s.name || '';
        if (!userName) {
          const uid = s.staff_id || s.user_id;
          const u = db.prepare("SELECT name FROM users WHERE id = ?").get(uid) as any;
          if (u) userName = u.name || '';
        }
        return { user_id: s.staff_id || s.user_id, user_name: userName, base_amount: base, bonus, deduction, total_amount: base + bonus - deduction, job_title: s.job_title || s.position || '' };
      });
    } else {
      const dbStaff = db.prepare("SELECT id, name, salary, job_title FROM users WHERE store_id = ? AND role IN ('STAFF','MANAGER') AND status = 'active'").all(storeId) as any[];
      if (dbStaff.length === 0) return res.status(400).json({ error: '璇ラ棬搴楁病鏈夊湪鑱屽憳宸? });
      items = dbStaff.map((s: any) => ({ user_id: s.id, user_name: s.name, base_amount: s.salary || 0, bonus: 0, deduction: 0, total_amount: s.salary || 0, job_title: s.job_title || '' }));
    }
    let totalAmount = 0;
    for (const item of items) totalAmount += item.total_amount;
    let payrollId: any;
    const tx = db.transaction(() => {
      const result = db.prepare('INSERT INTO payroll (store_id, period, total_amount, created_by) VALUES (?,?,?,?)').run(storeId, payrollPeriod, totalAmount, req.user.id);
      payrollId = result.lastInsertRowid;
      const stmt = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?,?,?,?,?,?,?,?)');
      for (const item of items) {
        stmt.run(payrollId, item.user_id, item.user_name, item.base_amount, item.bonus, item.deduction, item.total_amount, item.job_title);
      }
    });
    tx();

    triggerNotification({
      type: 'payroll',
      action: '鐢熸垚宸ヨ祫鍗?,
      storeId,
      detail: '宸ヨ祫鍗曞凡鐢熸垚: ' + payrollPeriod + ', 鎬婚噾棰?楼' + totalAmount.toFixed(2)
    , operatorName: req.user.name || req.user.username});

    res.json({ id: payrollId, message: '宸ヨ祫鍗曠敓鎴愭垚鍔? });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/confirm
router.put('/:id/confirm', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '宸ヨ祫鍗曚笉瀛樺湪' });
    if (payroll.status === 'confirmed') return res.status(400).json({ error: '宸ヨ祫鍗曞凡纭' });
    const confirmPayroll = db.transaction((payrollId: number, storeId: string, userId: number) => {
      db.prepare("UPDATE payroll SET status = 'confirmed', confirmed_at = datetime('now','localtime') WHERE id = ?").run(payrollId);
      const dateStr = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
      db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run(storeId, '鏀嚭', '宸ヨ祫', payroll.total_amount, '宸ヨ祫鏀嚭 ' + payroll.period + ' #' + payrollId, dateStr, userId);
    });
    confirmPayroll(Number(req.params.id), req.params.storeId, req.user.id);
    opLog(req.user.id, req.params.storeId, '纭宸ヨ祫鍗?, '纭宸ヨ祫鍗?#' + req.params.id);

    triggerNotification({
      type: 'payroll',
      action: '纭宸ヨ祫鍗?,
      storeId: req.params.storeId,
      detail: '宸ヨ祫鍗?#' + req.params.id + ' 宸茬‘璁? 鍛ㄦ湡: ' + payroll.period + ', 鎬婚噾棰?楼' + payroll.total_amount.toFixed(2)
    , operatorName: req.user.name || req.user.username});

    // 閫氱煡鐩稿叧鍛樺伐
    const payrollItems = db.prepare('SELECT user_id FROM payroll_items WHERE payroll_id = ?').all(req.params.id) as any[];
    for (const item of payrollItems) {
      if (item.user_id) {
        triggerNotification({
          type: 'payroll',
          action: '宸ヨ祫宸茬‘璁?,
          storeId: req.params.storeId,
          detail: '鎮ㄧ殑宸ヨ祫鍗?#' + req.params.id + ' (' + payroll.period + ') 宸茬‘璁?,
          targetUserId: item.user_id
        , operatorName: req.user.name || req.user.username});
      }
    }

    res.json({ message: '宸ヨ祫鍗曞凡纭' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const payroll = db.prepare('SELECT * FROM payroll WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!payroll) return res.status(404).json({ error: '宸ヨ祫鍗曚笉瀛樺湪' });
    if (payroll.status === 'confirmed') return res.status(400).json({ error: '宸茬‘璁ょ殑宸ヨ祫鍗曚笉鑳藉垹闄? });
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM payroll_items WHERE payroll_id = ?').run(req.params.id);
      db.prepare('DELETE FROM payroll WHERE id = ?').run(req.params.id);
    });
    tx();
    res.json({ message: '宸ヨ祫鍗曞凡鍒犻櫎' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

