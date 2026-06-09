import { Router, Response } from 'express';
import db from '../db.js';
import { opLog } from '../oplog.js';

const router = Router({ mergeParams: true });

// GET entries with date filtering
router.get('/', (req, res) => {
  const { storeId } = req.params;
  const { date, dateFrom, dateTo, month, year, week, period, limit } = req.query;
  let sql = 'SELECT * FROM entries WHERE store_id=?';
  const params: any[] = [storeId];
  
  const user = (req as any).user;
  if (user.role !== 'admin' && user.role !== 'ADMIN') {
    sql += ' AND is_system=0';
  }
  
  // Period-based filtering
  if (period === 'day') {
    const today = new Date().toISOString().slice(0, 10);
    sql += ' AND date=?';
    params.push(today);
  } else if (period === 'week') {
    const d = new Date();
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    sql += ' AND date>=? AND date<=?';
    params.push(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  } else if (period === 'month') {
    const monthStr = new Date().toISOString().slice(0, 7);
    sql += " AND strftime('%Y-%m',date)=?";
    params.push(monthStr);
  } else if (period === 'year') {
    const yearStr = new Date().getFullYear().toString();
    sql += " AND strftime('%Y',date)=?";
    params.push(yearStr);
  }
  
  // Explicit date filters (take precedence)
  if (date) { sql += ' AND date=?'; params.push(date); }
  if (dateFrom && dateTo) { sql += ' AND date>=? AND date<=?'; params.push(dateFrom, dateTo); }
  if (month) { sql += " AND strftime('%Y-%m',date)=?"; params.push(month); }
  if (year) { sql += " AND strftime('%Y',date)=?"; params.push(year); }
  if (week) {
    const d = new Date(week as string);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay() + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    sql += ' AND date>=? AND date<=?';
    params.push(start.toISOString().slice(0,10), end.toISOString().slice(0,10));
  }
  
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  
  const rows = db.prepare(sql).all(...params);
  
  // Calculate summary
  const summarySql = `SELECT 
    COALESCE(SUM(CASE WHEN type='收入' THEN amount ELSE 0 END), 0) as income,
    COALESCE(SUM(CASE WHEN type='支出' THEN amount ELSE 0 END), 0) as expense
  FROM entries WHERE store_id=?`;
  const summaryParams: any[] = [storeId];
  // Apply same date filters for summary
  let summaryDateCondition = '';
  if (period === 'day') {
    summaryDateCondition = ' AND date=?';
    summaryParams.push(new Date().toISOString().slice(0, 10));
  } else if (period === 'month') {
    summaryDateCondition = " AND strftime('%Y-%m',date)=?";
    summaryParams.push(new Date().toISOString().slice(0, 7));
  } else if (period === 'year') {
    summaryDateCondition = " AND strftime('%Y',date)=?";
    summaryParams.push(new Date().getFullYear().toString());
  }
  
  let summary;
  try {
    summary = db.prepare(summarySql + summaryDateCondition).get(...summaryParams) as any;
  } catch {
    summary = { income: 0, expense: 0 };
  }
  
  res.json({ entries: rows, summary: { ...summary, profit: (summary?.income || 0) - (summary?.expense || 0) } });
});

// POST create entry
router.post('/', (req, res) => {
  const { storeId } = req.params;
  const { type, category, amount, note, date } = req.body;
  const user = (req as any).user;
  const result = db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(storeId, type, category, amount, note || '', date || new Date().toISOString().slice(0, 10), user.id);
  opLog(user.id, Number(storeId), '记账', type + ' ' + category + ' ¥' + amount);
  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT update entry
router.put('/:id', (req, res) => {
  const { type, category, amount, note, date } = req.body;
  db.prepare('UPDATE entries SET type=?, category=?, amount=?, note=?, date=? WHERE id=?').run(type, category, amount, note || '', date, req.params.id);
  res.json({ success: true });
});

// DELETE entry
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

export default router;