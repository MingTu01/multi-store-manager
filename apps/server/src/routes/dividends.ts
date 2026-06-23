import { localDate } from '../lib/utils.js';
import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isManagerOrAbove } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(storeId);
    const balance = (() => {
      const store = db.prepare('SELECT initial_capital FROM stores WHERE id = ?').get(storeId) as any;
      const income = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND type IN ('鏀跺叆','income')").get(storeId) as any;
      const expense = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id = ? AND type IN ('鏀嚭','expense')").get(storeId) as any;
      return (store?.initial_capital || 0) + (income?.t || 0) - (expense?.t || 0);
    })();
    const dividends = db.prepare('SELECT * FROM dividends WHERE store_id = ? ORDER BY created_at DESC').all(storeId) as any[];
    const enriched = dividends.map((d: any) => {
      const items = db.prepare('SELECT * FROM dividend_details WHERE dividend_id = ?').all(d.id);
      return { ...d, items };
    });
    res.json({ dividends: enriched, shareholders, balance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const storeId = req.params.storeId;
    const { total_amount, note } = req.body;
    if (!total_amount) return res.status(400).json({ error: '璇疯緭鍏ユ€婚噾棰? });
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
      action: '鍒涘缓鍒嗙孩',
      storeId,
      detail: '鏂板垎绾㈠凡鍒涘缓, 鎬婚噾棰?楼' + Number(total_amount).toFixed(2) + (note ? ', 澶囨敞: ' + note : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ id: dividendId, message: '鍒嗙孩鍒涘缓鎴愬姛' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const { total_amount, note } = req.body;
    if (!total_amount || isNaN(Number(total_amount)) || Number(total_amount) <= 0) return res.status(400).json({ error: '璇疯緭鍏ユ湁鏁堝垎绾㈤噾棰? });
    if (Number(total_amount) > 9999999) return res.status(400).json({ error: '鍒嗙孩閲戦涓嶈兘瓒呰繃999涓? });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '鍒嗙孩璁板綍涓嶅瓨鍦? });
    if (dividend.status === 'archived') return res.status(400).json({ error: '宸插綊妗ｇ殑鍒嗙孩涓嶈兘淇敼' });
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
    res.json({ message: '鍒嗙孩鏇存柊鎴愬姛' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/archive', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '鍒嗙孩璁板綍涓嶅瓨鍦? });
    if (dividend.status === 'archived') return res.status(400).json({ error: '宸插綊妗? });
    const archiveDividend = db.transaction((dividendId: number, storeId: string, userId: number) => {
      db.prepare("UPDATE dividends SET status = 'archived' WHERE id = ?").run(dividendId);
      db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run(storeId, '鏀嚭', '鍒嗙孩', dividend.total_amount, '鍒嗙孩鏀嚭 #' + dividendId + ' ' + (dividend.note || ''), localDate(), userId);
    });
    archiveDividend(Number(req.params.id), req.params.storeId, req.user.id);
    opLog(req.user.id, req.params.storeId, '褰掓。鍒嗙孩', '褰掓。鍒嗙孩 #' + req.params.id);

    triggerNotification({
      type: 'dividend',
      action: '鍒嗙孩褰掓。',
      storeId: req.params.storeId,
      detail: '鍒嗙孩 #' + req.params.id + ' 宸插綊妗? 閲戦 楼' + dividend.total_amount.toFixed(2)
    , operatorName: req.user.name || req.user.username});

    res.json({ message: '鍒嗙孩宸插綊妗? });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '鏃犳潈闄? });
    const dividend = db.prepare('SELECT * FROM dividends WHERE id = ? AND store_id = ?').get(req.params.id, req.params.storeId) as any;
    if (!dividend) return res.status(404).json({ error: '鍒嗙孩璁板綍涓嶅瓨鍦? });
    if (dividend.status === 'archived') return res.status(400).json({ error: '宸插綊妗ｇ殑鍒嗙孩涓嶈兘鍒犻櫎' });
    db.prepare('DELETE FROM dividend_details WHERE dividend_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dividends WHERE id = ?').run(req.params.id);
    res.json({ message: '鍒嗙孩宸插垹闄? });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

