import { Router, Response } from 'express';
import { AuthRequest } from '../auth.js';
import { isManagerOrAbove } from '../lib/roles.js';
import db from '../db.js';

const router = Router();

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatDate(d: Date) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

// GET /api/calendar/monthly?year=2026&month=7 - 当月每天的全店铺汇总
router.get('/monthly', (req: AuthRequest, res: Response) => {
  if (!isManagerOrAbove(req.user.role)) {
    return res.status(403).json({ error: '无权限访问管理日历' });
  }
  try {
    const now = new Date();
    const year = parseInt(req.query.year as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || (now.getMonth() + 1); // 1-12

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const dateFrom = formatDate(firstDay);
    const dateTo = formatDate(lastDay);

    // 批量聚合 entries 按 date 分组
    const incomeRows = db.prepare(
      `SELECT date, COALESCE(SUM(amount),0) as total FROM entries
       WHERE date >= ? AND date <= ? AND type IN ('收入','income')
       GROUP BY date`
    ).all(dateFrom, dateTo) as any[];
    const expenseRows = db.prepare(
      `SELECT date, COALESCE(SUM(amount),0) as total FROM entries
       WHERE date >= ? AND date <= ? AND type IN ('支出','expense')
       GROUP BY date`
    ).all(dateFrom, dateTo) as any[];

    const incMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    for (const r of incomeRows) incMap[r.date] = r.total;
    for (const r of expenseRows) expMap[r.date] = r.total;

    // 统计店铺总数
    const storeCount = (db.prepare('SELECT COUNT(*) as c FROM stores').get() as any).c;

    // 统计每日开店数：当日有开店记录的店铺数（同店同天多次记录去重）
    const openRows = db.prepare(
      `SELECT store_id, date(created_at) as day FROM store_opens
       WHERE type = 'open' AND created_at >= ? AND created_at <= ?`
    ).all(dateFrom + ' 00:00:00', dateTo + ' 23:59:59') as any[];
    const dayOpenCount: Record<string, number> = {};
    const seen = new Set<string>();
    for (const r of openRows) {
      const key = r.store_id + '|' + r.day;
      if (seen.has(key)) continue;
      seen.add(key);
      dayOpenCount[r.day] = (dayOpenCount[r.day] || 0) + 1;
    }

    // 构建每日数据
    const days: any[] = [];
    const daysInMonth = lastDay.getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${pad(month)}-${pad(d)}`;
      const income = incMap[ds] || 0;
      const expense = expMap[ds] || 0;
      days.push({
        date: ds,
        income,
        expense,
        profit: income - expense,
        storeCount,
        openCount: dayOpenCount[ds] || 0
      });
    }

    res.json({ year, month, storeCount, days });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// GET /api/calendar/daily?date=2026-07-01 - 当日每家店铺明细
router.get('/daily', (req: AuthRequest, res: Response) => {
  if (!isManagerOrAbove(req.user.role)) {
    return res.status(403).json({ error: '无权限访问管理日历' });
  }
  try {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ error: '缺少 date 参数' });

    const allStores = db.prepare('SELECT id, name, is_open FROM stores ORDER BY id').all() as any[];

    // 批量查询当日各店收支
    const incRows = db.prepare(
      `SELECT store_id, COALESCE(SUM(amount),0) as total FROM entries
       WHERE date = ? AND type IN ('收入','income') GROUP BY store_id`
    ).all(date) as any[];
    const expRows = db.prepare(
      `SELECT store_id, COALESCE(SUM(amount),0) as total FROM entries
       WHERE date = ? AND type IN ('支出','expense') GROUP BY store_id`
    ).all(date) as any[];
    const incMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};
    for (const r of incRows) incMap[r.store_id] = r.total;
    for (const r of expRows) expMap[r.store_id] = r.total;

    // 批量查询当日各店开闭店记录
    const shiftRows = db.prepare(
      `SELECT so.store_id, so.type, so.user_id, so.handover_content, so.note, so.created_at, u.name as user_name
       FROM store_opens so LEFT JOIN users u ON so.user_id = u.id
       WHERE so.store_id IN (SELECT id FROM stores) AND date(so.created_at) = ?
       ORDER BY so.created_at ASC`
    ).all(date) as any[];
    const shiftMap: Record<string, any[]> = {};
    for (const s of shiftRows) {
      if (!shiftMap[s.store_id]) shiftMap[s.store_id] = [];
      shiftMap[s.store_id].push(s);
    }

    // 批量查询当日各店日常交接
    const handoverRows = db.prepare(
      `SELECT h.id, h.store_id, h.user_id, h.content, h.created_at, u.name as user_name
       FROM staff_handovers h LEFT JOIN users u ON h.user_id = u.id
       WHERE h.date = ? ORDER BY h.created_at ASC`
    ).all(date) as any[];
    const handoverMap: Record<string, any[]> = {};
    for (const h of handoverRows) {
      if (!handoverMap[h.store_id]) handoverMap[h.store_id] = [];
      handoverMap[h.store_id].push({ id: h.id, user_name: h.user_name, content: h.content, type: 'daily', created_at: h.created_at });
    }

    // 批量查询当日各店排休
    const restRows = db.prepare(
      `SELECT r.id, r.store_id, r.user_id, r.type, r.leave_type, r.note, u.name as user_name
       FROM staff_rest_schedules r LEFT JOIN users u ON r.user_id = u.id
       WHERE r.date = ? ORDER BY r.id ASC`
    ).all(date) as any[];
    const restMap: Record<string, any[]> = {};
    for (const r of restRows) {
      if (!restMap[r.store_id]) restMap[r.store_id] = [];
      restMap[r.store_id].push({ id: r.id, user_name: r.user_name, type: r.type, leave_type: r.leave_type, note: r.note });
    }

    // 组装结果：合并开闭店交接和日常交接
    const stores = allStores.map((s: any) => {
      const shifts = shiftMap[s.id] || [];
      const dailyHandovers = handoverMap[s.id] || [];
      // 把开闭店交接也加入 handovers 列表
      const shiftHandovers = shifts
        .filter(sh => sh.handover_content)
        .map(sh => ({
          user_name: sh.user_name,
          content: sh.handover_content,
          type: sh.type === 'open' ? 'shift_open' : 'shift_close',
          created_at: sh.created_at
        }));
      const allHandovers = [...dailyHandovers, ...shiftHandovers].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

      const openRecord = shifts.find(sh => sh.type === 'open');
      const closeRecord = shifts.find(sh => sh.type === 'close');

      return {
        store_id: s.id,
        name: s.name,
        is_open: s.is_open,
        income: incMap[s.id] || 0,
        expense: expMap[s.id] || 0,
        profit: (incMap[s.id] || 0) - (expMap[s.id] || 0),
        open_close: {
          open: openRecord ? { user_name: openRecord.user_name, time: openRecord.created_at, note: openRecord.note } : null,
          close: closeRecord ? { user_name: closeRecord.user_name, time: closeRecord.created_at, note: closeRecord.note } : null
        },
        handovers: allHandovers,
        rest_staff: restMap[s.id] || []
      };
    });

    res.json({ date, stores });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

export default router;
