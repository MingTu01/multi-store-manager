import { requireNotReadonly } from '../middleware/require-role.js';
import { Router, Response } from 'express';
import db from '../db.js';
import { opLog } from '../oplog.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isReadonly } from '../lib/roles.js';
import { localDate, localDateTime } from '../lib/utils.js';
import { triggerNotification } from '../notify-trigger.js';
import { eventBus } from '../event-bus.js';
import { sanitizeNote } from '../sanitize.js';

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
    res.json({ success: true, data: { income, expense, profit: income - expense } });
  } catch (err: any) { res.status(500).json({ error: err.message || '服务器内部错误' }); }
});

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { date, dateFrom, dateTo, month, year, week, period, limit, page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = Math.min(parseInt(pageSize as string) || 20, 100);
    const offset = (p - 1) * ps;
    let whereClause = ' WHERE e.store_id=?';
    const params: any[] = [storeId];
    const user = (req as any).user;
    if ((user.role?.toUpperCase() === 'STAFF') && !period && !date && !dateFrom && !dateTo) {
      whereClause += ' AND e.date=?'; params.push(localDate());
    }
    if (user.role?.toUpperCase() === 'STAFF') whereClause += ' AND e.is_system=0';
    if (period === 'day') { whereClause += ' AND e.date=?'; params.push(localDate()); }
    else if (period === 'week') { const d = new Date(); const s = new Date(d); const dow = d.getDay(); s.setDate(d.getDate()-(dow===0?6:dow-1)); const e = new Date(s); e.setDate(s.getDate()+6); whereClause += ' AND e.date>=? AND e.date<=?'; params.push(localDate(s), localDate(e)); }
    else if (period === 'month') { const m = localDate().slice(0,7); whereClause += " AND e.date >= ? AND e.date < ?"; params.push(m + '-01'); params.push(m + '-32'); }
    else if (period === 'year') { whereClause += " AND strftime('%Y',e.date)=?"; params.push(new Date().getFullYear().toString()); }
    if (date) { whereClause += ' AND e.date=?'; params.push(date); }
    if (dateFrom && dateTo) { whereClause += ' AND e.date>=? AND e.date<=?'; params.push(dateFrom, dateTo); }
    if (month) { whereClause += " AND e.date >= ? AND e.date < ?"; params.push(month + '-01'); params.push(month + '-32'); }
    if (year) { whereClause += " AND strftime('%Y',e.date)=?"; params.push(year); }
    if (week) { const d = new Date(week as string); const s = new Date(d); const dow = d.getDay(); s.setDate(d.getDate()-(dow===0?6:dow-1)); const e = new Date(s); e.setDate(s.getDate()+6); whereClause += ' AND e.date>=? AND e.date<=?'; params.push(localDate(s), localDate(e)); }
    const total = (db.prepare('SELECT COUNT(*) as count FROM entries e' + whereClause).get(...params) as any).count;
    const qp = [...params];
    let sql = 'SELECT e.*, COALESCE(c.name, e.category) AS category_name, u.name AS creator_name FROM entries e LEFT JOIN categories c ON e.category_id = c.id LEFT JOIN users u ON e.created_by = u.id' + whereClause + ' ORDER BY e.created_at DESC';
    if (!page && limit) { sql += ' LIMIT ?'; qp.push(Number(limit)); } else { sql += ' LIMIT ? OFFSET ?'; qp.push(ps, offset); }
    const totalPages = Math.ceil(total / ps);
    res.json({ success: true, data: db.prepare(sql).all(...qp), pagination: { page: p, pageSize: ps, total, totalPages } });
  } catch (err: any) { res.status(500).json({ error: err.message || '服务器内部错误' }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const user = (req as any).user;
    if (isReadonly(user.role)) return res.status(403).json({ error: '员工无权新增记账' });
    const { storeId } = req.params;
    const { type, category, category_id, amount, note, date } = req.body;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '日期格式不正确' });
    if (amount === undefined || amount === null || isNaN(Number(amount))) return res.status(400).json({ error: '请输入有效金额' });
    if (Number(amount) < 0) return res.status(400).json({ error: '金额不能为负数' });
    if (Number(amount) > 9999999) return res.status(400).json({ error: '金额不能超过999万' });
    let categoryName = category || '';
    let catId = category_id || null;
    if (catId) { const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(catId) as any; if (cat) categoryName = cat.name; }
    const nt = normalizeType(type);
    const result = db.prepare('INSERT INTO entries (store_id,type,category,category_id,amount,note,date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(storeId, nt, categoryName, catId, amount, sanitizeNote(note||''), date||localDate(), user.id, localDateTime());
    opLog(user.id, storeId, '记账', '新增' + nt + ' ' + categoryName + ' ¥' + amount, req.ip);

    triggerNotification({
      type: 'entry',
      action: '新增记账',
      storeId,
      detail: nt + '，' + categoryName + '，¥' + amount + (sanitizeNote(note||'') ? '，' + sanitizeNote(note||'') : '')
    , operatorName: req.user.name || req.user.username});

    eventBus.broadcast({ type: 'entry', action: 'create', storeId, data: { id: result.lastInsertRowid } });
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err: any) { res.status(500).json({ error: err.message || '服务器内部错误' }); }
});

// S12: PUT 添加记录归属校验
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const user = (req as any).user;
    if (isReadonly(user.role)) return res.status(403).json({ error: '员工无权修改记账' });
    const { storeId } = req.params;
    const { type, category, category_id, amount, note, date } = req.body;
    if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) < 0 || Number(amount) > 9999999)) return res.status(400).json({ error: '金额必须在0-999万之间' });
    const original = db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id) as any;
    if (original && String(original.store_id) !== String(storeId)) {
      return res.status(404).json({ error: '记录不存在' });
    }
    let categoryName = category || '';
    let catId = category_id || null;
    if (catId) { const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(catId) as any; if (cat) categoryName = cat.name; }
    const nt = type !== undefined ? normalizeType(type) : '';
    // 仅更新提供的字段，未传字段保留原值
    const updates: string[] = [];
    const params: any[] = [];
    if (type !== undefined) { updates.push('type=?'); params.push(nt); }
    if (category !== undefined || category_id !== undefined) { updates.push('category=?'); params.push(categoryName); }
    if (category_id !== undefined) { updates.push('category_id=?'); params.push(catId); }
    if (amount !== undefined) { updates.push('amount=?'); params.push(amount); }
    if (note !== undefined) { updates.push('note=?'); params.push(sanitizeNote(note || '')); }
    if (date !== undefined) { updates.push('date=?'); params.push(date); }
    if (updates.length === 0) return res.status(400).json({ error: '没有要更新的字段' });
    updates.push("updated_at=datetime('now','localtime')");
    params.push(req.params.id);
    db.prepare('UPDATE entries SET ' + updates.join(', ') + ' WHERE id=?').run(...params);
    const before = original ? { type: original.type, category: original.category || '未分类', amount: original.amount, note: original.note || '', date: original.date } : null;
    const after = {
      type: type !== undefined ? nt : (original?.type || ''),
      category: (category !== undefined || category_id !== undefined) ? (categoryName || '未分类') : (original?.category || '未分类'),
      amount: amount !== undefined ? Number(amount) : (original?.amount || 0),
      note: note !== undefined ? (note || '') : (original?.note || ''),
      date: date !== undefined ? date : (original?.date || '')
    };
    opLog(user.id, storeId, '记账', JSON.stringify({ action: 'modify', id: req.params.id, before, after }), req.ip);

    triggerNotification({
      type: 'entry',
      action: '修改记账',
      storeId,
      detail: '#' + req.params.id + '，' + (categoryName || original?.category || '未分类') + '，¥' + (amount !== undefined ? amount : original?.amount)
    , operatorName: req.user.name || req.user.username});

    eventBus.broadcast({ type: 'entry', action: 'update', storeId, data: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err: any) { res.status(500).json({ error: err.message || '服务器内部错误' }); }
});

// S12: DELETE 添加记录归属校验
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const user = (req as any).user;
    if (isReadonly(user.role)) return res.status(403).json({ error: '员工无权删除记账' });
    const { storeId } = req.params;
    const entry = db.prepare('SELECT * FROM entries WHERE id=?').get(req.params.id) as any;
    if (!entry) return res.status(404).json({ error: '记录不存在' });
    if (String(entry.store_id) !== String(storeId)) {
      return res.status(404).json({ error: '记录不存在' });
    }
    if (entry.is_system && !isAdmin(user.role)) {
      return res.status(403).json({ error: '系统自动生成的记录不能删除' });
    }
    db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
    const detail = entry ? '删除记账 #' + req.params.id + ' ' + entry.type + ' ' + entry.category + ' ¥' + entry.amount + ' (' + entry.date + ')' : '删除记账 #' + req.params.id;
    opLog(user.id, storeId, '记账', detail, req.ip);

    triggerNotification({
      type: 'entry',
      action: '删除记账',
      storeId,
      detail: '#' + req.params.id + (entry ? '，' + entry.type + '，' + entry.category + '，¥' + entry.amount + '（' + entry.date + '）' : '')
    , operatorName: req.user.name || req.user.username});

    eventBus.broadcast({ type: 'entry', action: 'delete', storeId, data: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err: any) { res.status(500).json({ error: err.message || '服务器内部错误' }); }
});

export default router;
