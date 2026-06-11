import { Router, Response } from 'express';
import db from '../db.js';
import { opLog } from '../oplog.js';
import { AuthRequest } from '../auth.js';
import { localDate, localDateTime } from '../lib/utils.js';

function normalizeType(type: string): string {
  if (type === 'income') return '收入';
  if (type === 'expense') return '支出';
  if (type === '收入' || type === '支出') return type;
  return '收入';
}

const router = Router({ mergeParams: true });

router.get('/stats', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const today = localDate();
    const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('收入','income') AND date=?").get(storeId, today) as any)?.total || 0;
    const expense = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type IN ('支出','expense') AND date=?").get(storeId, today) as any)?.total || 0;
    res.json({ income, expense, profit: income - expense });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { date, dateFrom, dateTo, month, year, week, period, limit, page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;
    let whereClause = ' WHERE e.store_id=?';
    const params: any[] = [storeId];
    const user = (req as any).user;
    if (user.role !== 'admin' && user.role !== 'ADMIN') whereClause += ' AND e.is_system=0';
    if (period === 'day') { whereClause += ' AND e.date=?'; params.push(localDate()); }
    else if (period === 'week') { const d = new Date(); const s = new Date(d); s.setDate(d.getDate()-d.getDay()+1); const e = new Date(s); e.setDate(s.getDate()+6); whereClause += ' AND e.date>=? AND e.date<=?'; params.push(localDate(s), localDate(e)); }
    else if (period === 'month') { whereClause += " AND strftime('%Y-%m',e.date)=?"; params.push(localDate().slice(0,7)); }
    else if (period === 'year') { whereClause += " AND strftime('%Y',e.date)=?"; params.push(new Date().getFullYear().toString()); }
    if (date) { whereClause += ' AND e.date=?'; params.push(date); }
    if (dateFrom && dateTo) { whereClause += ' AND e.date>=? AND e.date<=?'; params.push(dateFrom, dateTo); }
    if (month) { whereClause += " AND strftime('%Y-%m',e.date)=?"; params.push(month); }
    if (year) { whereClause += " AND strftime('%Y',e.date)=?"; params.push(year); }
    if (week) { const d = new Date(week as string); const s = new Date(d); s.setDate(d.getDate()-d.getDay()+1); const e = new Date(s); e.setDate(s.getDate()+6); whereClause += ' AND e.date>=? AND e.date<=?'; params.push(localDate(s), localDate(e)); }
    const total = (db.prepare('SELECT COUNT(*) as count FROM entries e' + whereClause).get(...params) as any).count;
    const qp = [...params];
    let sql = 'SELECT e.*, COALESCE(c.name, e.category) AS category_name FROM entries e LEFT JOIN categories c ON e.category_id = c.id' + whereClause + ' ORDER BY e.created_at DESC';
    if (!page && limit) { sql += ' LIMIT ?'; qp.push(Number(limit)); } else { sql += ' LIMIT ? OFFSET ?'; qp.push(ps, offset); }
    res.json({ entries: db.prepare(sql).all(...qp), total });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { type, category, category_id, amount, note, date } = req.body;
    const user = (req as any).user;
    let categoryName = category || '';
    let catId = category_id || null;
    if (catId) { const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(catId) as any; if (cat) categoryName = cat.name; }
    const nt = normalizeType(type);
    const result = db.prepare('INSERT INTO entries (store_id,type,category,category_id,amount,note,date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(storeId, nt, categoryName, catId, amount, note||'', date||localDate(), user.id, localDateTime());
    opLog(user.id, storeId, '记账', '新增' + nt + ' ' + categoryName + ' ¥' + amount, req.ip);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S12: PUT 添加记录归属校验
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { type, category, category_id, amount, note, date } = req.body;
    const original = db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id) as any;
    if (original && String(original.store_id) !== String(storeId)) {
      return res.status(404).json({ error: '记录不存在' });
    }
    let categoryName = category || '';
    let catId = category_id || null;
    if (catId) { const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(catId) as any; if (cat) categoryName = cat.name; }
    const nt = normalizeType(type);
    db.prepare('UPDATE entries SET type=?,category=?,category_id=?,amount=?,note=?,date=? WHERE id=?').run(nt, categoryName, catId, amount, note||'', date, req.params.id);
    const user = (req as any).user;
    const before = original ? { type: original.type, category: original.category || '未分类', amount: original.amount, note: original.note || '', date: original.date } : null;
    const after = { type: nt, category: categoryName || '未分类', amount: Number(amount), note: note || '', date };
    opLog(user.id, storeId, '记账', JSON.stringify({ action: 'modify', id: req.params.id, before, after }), req.ip);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S12: DELETE 添加记录归属校验
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const entry = db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id) as any;
    if (entry && String(entry.store_id) !== String(storeId)) {
      return res.status(404).json({ error: '记录不存在' });
    }
    db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
    const user = (req as any).user;
    const detail = entry ? '删除记账 #' + req.params.id + ' ' + entry.type + ' ' + entry.category + ' ¥' + entry.amount + ' (' + entry.date + ')' : '删除记账 #' + req.params.id;
    opLog(user.id, storeId, '记账', detail, req.ip);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
