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
    const total = (db.prepare('SELECT COUNT(*) as count FROM dividends WHERE store_id = ?').get(storeId) as any).count;
    const dividends = db.prepare('SELECT * FROM dividends WHERE store_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(storeId, ps, offset);
    const enriched = dividends.map((d: any) => {
      const details = db.prepare('SELECT * FROM dividend_details WHERE dividend_id = ?').all(d.id);
      return { ...d, items: details };
    });
    res.json({ dividends: enriched, total, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/balance', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
    if (!store) return res.status(404).json({ error: '门店不存在' });
    const income = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '收入'").get(storeId) as any;
    const expense = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '支出'").get(storeId) as any;
    const paidDividends = db.prepare("SELECT COALESCE(SUM(total_amount),0) as total FROM dividends WHERE store_id = ? AND status = 'archived'").get(storeId) as any;
    const balance = (store.initial_capital || 0) + (income?.total || 0) - (expense?.total || 0);
    res.json({ initial_capital: store.initial_capital || 0, income: income?.total || 0, expense: expense?.total || 0, paid_dividends: paidDividends?.total || 0, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { total_amount, note, details } = req.body;
    if (!total_amount) return res.status(400).json({ error: '请输入总金额' });
    const result = db.prepare('INSERT INTO dividends (store_id, total_amount, note) VALUES (?,?,?)').run(storeId, total_amount, note || '');
    const dividendId = result.lastInsertRowid;
    if (Array.isArray(details)) {
      const stmt = db.prepare('INSERT INTO dividend_details (dividend_id, shareholder_name, ratio, amount) VALUES (?,?,?,?)');
      for (const d of details) {
        stmt.run(dividendId, d.name || '', d.ratio || 0, d.amount || 0);
      }
    }
    db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)').run(storeId, '支出', '分红', total_amount, '分红支出 #' + dividendId, new Date().toISOString().slice(0, 10), req.user.id);
    opLog(req.user.id, storeId, '创建分红', '创建分红 #' + dividendId + ' ¥' + total_amount);
    res.json({ id: dividendId, message: '分红创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { total_amount, note, details } = req.body;
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '分红记录不存在' });
    if (dividend.status === 'archived') return res.status(400).json({ error: '已归档的分红不能修改' });
    if (total_amount !== undefined || note) {
      db.prepare('UPDATE dividends SET total_amount = COALESCE(?, total_amount), note = COALESCE(?, note) WHERE id = ?').run(total_amount, note, req.params.id);
    }
    if (Array.isArray(details)) {
      db.prepare('DELETE FROM dividend_details WHERE dividend_id = ?').run(req.params.id);
      const stmt = db.prepare('INSERT INTO dividend_details (dividend_id, shareholder_name, ratio, amount) VALUES (?,?,?,?)');
      for (const d of details) { stmt.run(req.params.id, d.name || '', d.ratio || 0, d.amount || 0); }
    }
    opLog(req.user.id, req.params.storeId, '修改分红', '修改分红 #' + req.params.id);
    res.json({ message: '分红更新成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/archive', (req: AuthRequest, res: Response) => {
  try {
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '分红记录不存在' });
    db.prepare("UPDATE dividends SET status = 'archived' WHERE id = ?").run(req.params.id);
    opLog(req.user.id, req.params.storeId, '归档分红', '归档分红 #' + req.params.id);
    res.json({ message: '分红已归档' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// PUT /:id/archive - archive dividend
router.put('/:id/archive', (req: AuthRequest, res: Response) => {
  try {
    const div = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!div) return res.status(404).json({ error: '分红记录不存在' });
    db.prepare("UPDATE dividends SET status = 'archived' WHERE id = ?").run(req.params.id);
    // Create expense entry
    db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run(req.params.storeId, '支出', '分红', div.total_amount, '分红支出 #' + req.params.id + ' ' + (div.note || ''), new Date().toISOString().slice(0, 10), req.user?.id);
    opLog(req.user.id, req.params.storeId, '归档分红', '归档分红 #' + req.params.id);
    res.json({ message: '分红已归档' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;