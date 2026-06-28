import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { sanitizeText } from '../sanitize.js';
import { opLog } from '../oplog.js';
import { isManagerOrAbove, isReadonly } from '../lib/roles.js';
import { triggerNotification } from '../notify-trigger.js';
import { eventBus } from '../event-bus.js';
import { localDate } from '../lib/utils.js';

const router = Router({ mergeParams: true });

// GET / - Get purchase items + records for a specific date
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const date = (req.query.date as string) || localDate();
    const items = db.prepare('SELECT * FROM purchase_items WHERE store_id = ? ORDER BY sort_order ASC, id ASC').all(storeId);
    const records = db.prepare('SELECT * FROM purchase_records WHERE store_id = ? AND date = ?').all(storeId, date);
    const recordMap: Record<number, any> = {};
    for (const r of records as any[]) recordMap[r.item_id] = r;
    const data = items.map((item: any) => ({
      ...item,
      record: recordMap[item.id] || { morning_qty: 0, afternoon_qty: 0 }
    }));
    res.json({ items: data, date });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /items - Add purchase item
router.post('/items', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '无权限' });
    const storeId = req.params.storeId;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '请输入商品名称' });
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM purchase_items WHERE store_id = ?').get(storeId) as any)?.m || 0;
    const result = db.prepare('INSERT INTO purchase_items (store_id, name, sort_order) VALUES (?,?,?)').run(storeId, sanitizeText(name), maxOrder + 1);
    opLog(req.user.id, storeId, '进货', '添加商品: ' + name);
    res.json({ id: result.lastInsertRowid, message: '商品添加成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// PUT /items/:id - Update purchase item
router.put('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '无权限' });
    const { name, sort_order } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(sanitizeText(name)); }
    if (sort_order !== undefined) { fields.push('sort_order=?'); vals.push(sort_order); }
    if (fields.length === 0) return res.status(400).json({ error: '无更新内容' });
    vals.push(req.params.id);
    db.prepare('UPDATE purchase_items SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    res.json({ message: '更新成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// DELETE /items/:id - Delete purchase item
router.delete('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user.role)) return res.status(403).json({ error: '无权限' });
    const itemId = req.params.id;
    const deleteItem = db.transaction(() => {

      db.prepare('DELETE FROM purchase_records WHERE item_id = ?').run(itemId);

      db.prepare('DELETE FROM purchase_items WHERE id = ?').run(itemId);

    });

    deleteItem();
    res.json({ message: '删除成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// PUT /records - Save/update records for a date (batch upsert)
router.put('/records', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user.role)) return res.status(403).json({ error: '只读角色无法编辑' });
    const storeId = req.params.storeId;
    const { date, records } = req.body;
    if (!date || !Array.isArray(records)) return res.status(400).json({ error: '参数不完整' });

    // Only allow editing today
    const today = localDate();
    if (date !== today) return res.status(403).json({ error: '只能编辑今天的进货数据' });

    const upsert = db.prepare(`
      INSERT INTO purchase_records (store_id, date, item_id, morning_qty, afternoon_qty, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
      ON CONFLICT(store_id, date, item_id) DO UPDATE SET
        morning_qty = excluded.morning_qty,
        afternoon_qty = excluded.afternoon_qty,
        updated_at = datetime('now','localtime')
    `);

    const tx = db.transaction(() => {
      for (const r of records) {
        upsert.run(storeId, date, r.item_id, r.morning_qty || 0, r.afternoon_qty || 0);
      }
    });
    tx();

    opLog(req.user.id, storeId, '进货', '更新进货记录: ' + date);
    const totalMorning = records.reduce((s: number, r: any) => s + (r.morning_qty || 0), 0);
    const totalAfternoon = records.reduce((s: number, r: any) => s + (r.afternoon_qty || 0), 0);
    const itemNames = [...new Set(records.map((r: any) => r.item_name || ''))].filter(Boolean).slice(0, 5).join('、');
    triggerNotification({ type: 'purchase', action: '更新进货', storeId, detail: date + ' ' + records.length + '种商品 上午' + totalMorning + '/下午' + totalAfternoon + (itemNames ? ' 含' + itemNames : ''), operatorName: req.user.name || req.user.username });
    eventBus.broadcast({ type: 'purchase', action: 'update', storeId, data: { date } });
    res.json({ message: '保存成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// GET /trend - Get trend data for analysis
router.get('/trend', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const days = parseInt(req.query.days as string) || 60;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    const start = localDate(startDate);
    const end = localDate(endDate);

    const allRows = db.prepare(`
      SELECT r.date, i.id as item_id, i.name as item_name, i.sort_order,
             r.morning_qty, r.afternoon_qty, r.morning_qty + r.afternoon_qty as total
      FROM purchase_records r
      JOIN purchase_items i ON r.item_id = i.id
      WHERE r.store_id = ? AND r.date >= ? AND r.date <= ?
      ORDER BY r.date ASC, i.sort_order ASC
    `).all(storeId, start, end) as any[];

    const items = db.prepare('SELECT id, name FROM purchase_items WHERE store_id = ? ORDER BY sort_order').all(storeId) as any[];
    const itemNames = items.map(i => i.name);

    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    // 1. Trend data for requested period (use all rows from query)
    const trendMap: Record<string, any> = {};
    for (const r of allRows) {
      if (!trendMap[r.date]) trendMap[r.date] = { date: r.date };
      trendMap[r.date][r.item_name] = r.total;
    }
    const trendData = Object.values(trendMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // --- Fixed 60-day analysis window (independent of days parameter) ---
    const analysisEnd = new Date();
    const analysisStart = new Date();
    analysisStart.setDate(analysisEnd.getDate() - 59);
    const analysisStartStr = localDate(analysisStart);
    const analysisEndStr = localDate(analysisEnd);

    const analysisRows = db.prepare(`
      SELECT r.date, i.id as item_id, i.name as item_name, i.sort_order,
             r.morning_qty + r.afternoon_qty as total
      FROM purchase_records r
      JOIN purchase_items i ON r.item_id = i.id
      WHERE r.store_id = ? AND r.date >= ? AND r.date <= ?
      ORDER BY r.date ASC, i.sort_order ASC
    `).all(storeId, analysisStartStr, analysisEndStr) as any[];

    // 2. Same-weekday history: past 8 occurrences of tomorrow's weekday
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDayIdx = (tomorrow.getDay() + 6) % 7; // Mon=0
    const tomorrowLabel = dayLabels[tomorrowDayIdx];

    const itemDateMap: Record<number, Record<string, number>> = {};
    for (const r of analysisRows) {
      if (!itemDateMap[r.item_id]) itemDateMap[r.item_id] = {};
      itemDateMap[r.item_id][r.date] = r.total;
    }

    const sameWeekdayDates: string[] = [];
    const d = new Date(analysisEnd);
    while (sameWeekdayDates.length < 8) {
      if ((d.getDay() + 6) % 7 === tomorrowDayIdx) {
        sameWeekdayDates.push(localDate(d));
      }
      d.setDate(d.getDate() - 1);
    }
    sameWeekdayDates.reverse();

    const sameWeekdayData = items.map(item => {
      const dates = sameWeekdayDates.map(dt => ({
        date: dt,
        value: itemDateMap[item.id]?.[dt] || 0
      }));
      const values = dates.map(d => d.value).filter(v => v > 0);
      const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      const latest = dates.length > 0 ? dates[dates.length - 1].value : 0;
      const prev = dates.length > 1 ? dates[dates.length - 2].value : 0;
      const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'flat';
      return { name: item.name, dates, avg, latest, trend };
    });

    // 3. Weekday averages (fixed 60-day period)
    const weekdaySums: Record<string, Record<string, { sum: number; count: number }>> = {};
    for (const r of analysisRows) {
      const dayIdx = (new Date(r.date).getDay() + 6) % 7;
      const label = dayLabels[dayIdx];
      if (!weekdaySums[label]) weekdaySums[label] = {};
      if (!weekdaySums[label][r.item_name]) weekdaySums[label][r.item_name] = { sum: 0, count: 0 };
      weekdaySums[label][r.item_name].sum += r.total;
      weekdaySums[label][r.item_name].count += 1;
    }
    const weekdayAvg = dayLabels.map(label => {
      const entry: any = { day: label };
      for (const name of itemNames) {
        const dd = weekdaySums[label]?.[name];
        entry[name] = dd ? Math.round(dd.sum / dd.count * 10) / 10 : 0;
      }
      return entry;
    });

    // 4. Recommendations based on same-weekday analysis (60-day fixed)
    const recommendations = sameWeekdayData.map(item => {
      const values = item.dates.map((dd: any) => dd.value).filter((v: number) => v > 0);
      const avg = values.length > 0 ? Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length) : 0;
      const recent = values.slice(-3);
      const older = values.slice(0, -3);
      const recentAvg = recent.length > 0 ? Math.round(recent.reduce((a: number, b: number) => a + b, 0) / recent.length) : avg;
      const olderAvg = older.length > 0 ? Math.round(older.reduce((a: number, b: number) => a + b, 0) / older.length) : avg;
      const recommended = recent.length > 0 ? Math.round((recentAvg * 2 + olderAvg) / 3) : avg;
      return { name: item.name, recommended, recentAvg, avg, trend: item.trend };
    });

    res.json({ sameWeekdayData, sameWeekdayDates, tomorrowLabel, trendData, weekdayAvg, itemNames, recommendations });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

export default router;
