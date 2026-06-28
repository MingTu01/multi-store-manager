import { localDate } from '../lib/utils.js';
import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId);
    const balance = (() => {
      const store = db.prepare('SELECT initial_capital FROM stores WHERE id = ?').get(storeId) as any;
      const income = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND type IN ('收入','income')").get(storeId) as any;
      const expense = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND type IN ('支出','expense')").get(storeId) as any;
      return (store?.initial_capital || 0) + (income?.t || 0) - (expense?.t || 0);
    })();
    const dividends = db.prepare('SELECT * FROM dividends WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as any[];
    // Batch query dividend details to avoid N+1
    const _divIds = dividends.map((d: any) => d.id);
    let _allDetails: any[] = [];
    if (_divIds.length > 0) {
      const _dph = _divIds.map(() => '?').join(',');
      _allDetails = db.prepare('SELECT * FROM dividend_details WHERE dividend_id IN (' + _dph + ')').all(..._divIds);
    }
    const _detailsMap = new Map<number, any[]>();
    for (const detail of _allDetails) {
      if (!_detailsMap.has(detail.dividend_id)) _detailsMap.set(detail.dividend_id, []);
      _detailsMap.get(detail.dividend_id)!.push(detail);
    }
    const enriched = dividends.map((d: any) => {
      const items = _detailsMap.get(d.id) || [];
      return { ...d, items };
    });
    res.json({ success: true, data: { dividends: enriched, shareholders, balance } });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "�������ڲ�����" : err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const { total_amount, note } = req.body;
    if (!total_amount) return res.status(400).json({ error: '请输入总金额' });
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId) as any[];
    const totalRatio = shareholders.reduce((s: number, sh: any) => s + (sh.ratio || 0), 0);
    const result = db.prepare('INSERT INTO dividends (store_id, total_amount, note, status) VALUES (?,?,?,?)').run(storeId, total_amount, note || '', 'draft');
    const dividendId = result.lastInsertRowid;
    const stmt = db.prepare('INSERT INTO dividend_details (dividend_id, shareholder_name, ratio, amount) VALUES (?,?,?,?)');
    for (const sh of shareholders) {
      const amount = totalRatio > 0 ? (total_amount * sh.ratio / totalRatio) : 0;
      stmt.run(dividendId, sh.name, sh.ratio, amount);
    }

    triggerNotification({
      type: 'dividend',
      action: '创建分红',
      storeId,
      detail: '新分红已创建, 总金额 ¥' + Number(total_amount).toFixed(2) + (note ? ', 备注: ' + note : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ success: true, data: { id: dividendId }, message: '分红创建成功' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "�������ڲ�����" : err.message });
  }
});

// TODO: wrap in transaction for data consistency
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const { total_amount, note } = req.body;
    if (!total_amount || isNaN(Number(total_amount)) || Number(total_amount) <= 0) return res.status(400).json({ error: '请输入有效分红金额' });
    if (Number(total_amount) > 9999999) return res.status(400).json({ error: '分红金额不能超过999万' });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '分红记录不存在' });
    if (dividend.status === 'archived') return res.status(400).json({ error: '已归档的分红不能修改' });
    const updateDividend = db.transaction(() => {
      db.prepare('UPDATE dividends SET total_amount = COALESCE(?, total_amount), note = COALESCE(?, note) WHERE id = ?').run(total_amount, note, req.params.id);
          if (total_amount !== undefined) {
            const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(req.params.storeId) as any[];
            const totalRatio = shareholders.reduce((s: number, sh: any) => s + (sh.ratio || 0), 0);
            db.prepare('DELETE FROM dividend_details WHERE dividend_id = ?').run(req.params.id);
            const stmt = db.prepare('INSERT INTO dividend_details (dividend_id, shareholder_name, ratio, amount) VALUES (?,?,?,?)');
            for (const sh of shareholders) {
              const amount = totalRatio > 0 ? (total_amount * sh.ratio / totalRatio) : 0;
              stmt.run(req.params.id, sh.name, sh.ratio, amount);
            }
          }
          res.json({ success: true, data: null, message: '分红更新成功' });
    });
    updateDividend();
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "�������ڲ�����" : err.message });
  }
});

router.put('/:id/archive', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '分红记录不存在' });
    if (dividend.status === 'archived') return res.status(400).json({ error: '已归档' });
    const archiveDividend = db.transaction((dividendId: number, storeId: string, userId: number) => {
      db.prepare("UPDATE dividends SET status = 'archived' WHERE id = ?").run(dividendId);
      db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run(storeId, '支出', '分红', dividend.total_amount, '分红支出 #' + dividendId + ' ' + (dividend.note || ''), localDate(), userId);
    });
    archiveDividend(Number(req.params.id), req.params.storeId, req.user.id);
    opLog(req.user.id, req.params.storeId, '归档分红', '归档分红 #' + req.params.id);

    triggerNotification({
      type: 'dividend',
      action: '分红归档',
      storeId: req.params.storeId,
      detail: '分红 #' + req.params.id + ' 已归档, 金额 ¥' + dividend.total_amount.toFixed(2)
    , operatorName: req.user.name || req.user.username});

    res.json({ success: true, data: null, message: '分红已归档' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "�������ڲ�����" : err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '分红记录不存在' });
    if (dividend.status === 'archived') return res.status(400).json({ error: '已归档的分红不能删除' });
    db.prepare('DELETE FROM dividend_details WHERE dividend_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dividends WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: null, message: '分红已删除' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "�������ڲ�����" : err.message });
  }
});

export default router;
