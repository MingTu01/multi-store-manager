import { Router, Response } from 'express';
import db from '../db.js';
import { localDate } from '../lib/utils.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isStoreAdmin, entryFilterClause } from '../lib/roles.js';



const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    // Q13: 仅 ADMIN 可访问管理大屏
    if (!isStoreAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权限' });
    }
    const { period, date, storeId } = req.query;
    const d = date ? new Date(date as string) : new Date();
    const dateStr = localDate(d);
    const storeCondition = storeId ? 'AND store_id = ?' : '';
    const storeParams = storeId ? [storeId] : [];

    function getDateConditions(d: Date, period: string) {
      const ds = localDate(d);
      let cur = '', curP: any[] = [], prev = '', prevP: any[] = [], yoy = '', yoyP: any[] = [];
      if (period === 'day') {
        cur = 'AND date = ?'; curP = [ds];
        const p = new Date(d); p.setDate(p.getDate()-1); prev = 'AND date = ?'; prevP = [localDate(p)];
        const y = new Date(d); y.setFullYear(y.getFullYear()-1); yoy = 'AND date = ?'; yoyP = [localDate(y)];
      } else if (period === 'week') {
        const ws = new Date(d); ws.setDate(d.getDate()-d.getDay()+1);
        const we = new Date(ws); we.setDate(ws.getDate()+6);
        cur = 'AND date >= ? AND date <= ?'; curP = [localDate(ws), localDate(we)];
        const pws = new Date(ws); pws.setDate(pws.getDate()-7); const pwe = new Date(pws); pwe.setDate(pws.getDate()+6);
        prev = 'AND date >= ? AND date <= ?'; prevP = [localDate(pws), localDate(pwe)];
        const yws = new Date(ws); yws.setFullYear(yws.getFullYear()-1); const ywe = new Date(yws); ywe.setDate(yws.getDate()+6);
        yoy = 'AND date >= ? AND date <= ?'; yoyP = [localDate(yws), localDate(ywe)];
      } else if (period === 'month') {
        const ms = ds.slice(0,7);
        cur = "AND strftime('%Y-%m',date) = ?"; curP = [ms];
        const pm = new Date(d.getFullYear(), d.getMonth()-1, 1); prev = "AND strftime('%Y-%m',date) = ?"; prevP = [localDate(pm).slice(0,7)];
        const ym = new Date(d); ym.setFullYear(ym.getFullYear()-1); yoy = "AND strftime('%Y-%m',date) = ?"; yoyP = [localDate(ym).slice(0,7)];
      } else if (period === 'year') {
        const ys = ds.slice(0,4);
        cur = "AND strftime('%Y',date) = ?"; curP = [ys];
        prev = "AND strftime('%Y',date) = ?"; prevP = [String(parseInt(ys)-1)];
        yoy = "AND strftime('%Y',date) = ?"; yoyP = [String(parseInt(ys)-2)];
      }
      return { cur, curP, prev, prevP, yoy, yoyP };
    }

    const conds = getDateConditions(d, (period as string) || 'day');
    const base = 'FROM entries WHERE 1=1 ' + storeCondition + entryFilterClause(req.user.role);

    const q = (type: string, cond: string, params: any[]) => {
      const isIncome = type === '收入' || type === 'income';
      const typeFilter = isIncome ? `AND type IN ('收入','income')` : `AND type IN ('支出','expense')`;
      try { return (db.prepare(`SELECT COALESCE(SUM(amount),0) as t ${base} ${typeFilter} ${cond}`).get(...storeParams, ...params) as any).t || 0; } catch { return 0; }
    };

    const ci = q('收入', conds.cur, conds.curP);
    const ce = q('支出', conds.cur, conds.curP);
    const pi = q('收入', conds.prev, conds.prevP);
    const pe = q('支出', conds.prev, conds.prevP);
    const yi = q('收入', conds.yoy, conds.yoyP);
    const ye = q('支出', conds.yoy, conds.yoyP);
    const cp = ci - ce, pp = pi - pe, yp = yi - ye;
    const cm = ci > 0 ? cp/ci : 0, pm = pi > 0 ? pp/pi : 0;

    const pct = (c: number, p: number) => p !== 0 ? (c - p) / Math.abs(p) : 0;

    const incomeByCategory = db.prepare(`SELECT category, SUM(amount) as amount ${base} AND type IN ('收入','income') ${conds.cur} GROUP BY category ORDER BY amount DESC`).all(...storeParams, ...conds.curP);
    const expenseByCategory = db.prepare(`SELECT category, SUM(amount) as amount ${base} AND type IN ('支出','expense') ${conds.cur} GROUP BY category ORDER BY amount DESC`).all(...storeParams, ...conds.curP);


    // Fund balance: initial_capital + all_income - all_expense (payroll/dividends already in entries)
    const stores_all = db.prepare('SELECT id, initial_capital FROM stores').all() as any[];
    let totalFundBalance = 0;
    const storeFundBalances: Record<string, number> = {};
    for (const s of stores_all) {
      const ic = s.initial_capital || 0;
      const allInc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('\u6536\u5165','income')").get(s.id) as any).t || 0;
      const allExp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('\u652f\u51fa','expense')").get(s.id) as any).t || 0;
      const fb = ic + allInc - allExp;
      storeFundBalances[s.id] = fb;
      totalFundBalance += fb;
    }

    // Per-store summary (only for admin without storeId filter)
    let stores: any[] = [];
    if (!storeId) {
      const allStores = db.prepare('SELECT * FROM stores ORDER BY id').all() as any[];
      // Batch queries to avoid N+1
      const batchDateCond = conds.cur;
      const incomeTypeFilter = "AND type IN ('收入','income')";
      const expenseTypeFilter = "AND type IN ('支出','expense')";
      const batchIncRows = db.prepare(
        'SELECT store_id, COALESCE(SUM(amount),0) as total FROM entries WHERE 1=1 ' + storeCondition + ' ' + incomeTypeFilter + ' ' + batchDateCond + entryFilterClause(req.user.role) + ' GROUP BY store_id'
      ).all(...storeParams, ...conds.curP) as any[];
      const batchExpRows = db.prepare(
        'SELECT store_id, COALESCE(SUM(amount),0) as total FROM entries WHERE 1=1 ' + storeCondition + ' ' + expenseTypeFilter + ' ' + batchDateCond + entryFilterClause(req.user.role) + ' GROUP BY store_id'
      ).all(...storeParams, ...conds.curP) as any[];
      const batchStaffRows = db.prepare(
        'SELECT store_id, COUNT(*) as count FROM users WHERE store_id IS NOT NULL GROUP BY store_id'
      ).all() as any[];
      const incMap: Record<string, number> = {};
      const expMap: Record<string, number> = {};
      const staffMap: Record<string, number> = {};
      for (const r of batchIncRows) incMap[r.store_id] = r.total;
      for (const r of batchExpRows) expMap[r.store_id] = r.total;
      for (const r of batchStaffRows) staffMap[r.store_id] = r.count;
      stores = allStores.map((s: any) => {
        const si = incMap[s.id] || 0;
        const se = expMap[s.id] || 0;
        const staffCount = staffMap[s.id] || 0;
        const storeMargin = si > 0 ? (si - se) / si : (se > 0 ? -1 : 0);
        return { id: s.id, name: s.name, address: s.address, is_open: s.is_open, income: si, expense: se, profit: si - se, margin: storeMargin, staff_count: staffCount, fundBalance: storeFundBalances[s.id] || 0 };
      });
    }

    res.json({
      income: ci, expense: ce, profit: cp, margin: cm,
      comparison: { current: { income: ci, expense: ce, profit: cp, margin: cm }, previous: { income: pi, expense: pe, profit: pp, margin: pm }, changes: { incomeChange: pct(ci,pi), expenseChange: pct(ce,pe), profitChange: pct(cp,pp), marginChange: pct(cm,pm) } },
      yoy: { incomeChange: pct(ci,yi), expenseChange: pct(ce,ye), profitChange: pct(cp,yp), marginChange: cm !== 0 && yi > 0 ? (cm - (yi>0?(yi-ye)/yi:0)) / Math.abs(yi>0?(yi-ye)/yi:0||1) : 0 },
      incomeByCategory, expenseByCategory, stores, fundBalance: totalFundBalance
    });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message }); }
});


// GET /dashboard/trend - get trend data for charts
router.get('/trend', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role) && req.user.role !== 'SHAREHOLDER') {
      return res.status(403).json({ error: '无权限' });
    }
    const { period = 'day', storeId, days } = req.query;
    const now = new Date();
    const points: any[] = [];
    
    if (period === 'day') {
      const dayCount = parseInt(days as string) || 30;
      for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const ds = localDate(d);
        const cond = storeId ? 'AND store_id = ?' : '';
        const params = storeId ? [ds, storeId] : [ds];
        const inc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date=? AND type IN ('收入','income') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        const exp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date=? AND type IN ('支出','expense') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        points.push({ label: ds.slice(5), income: inc, expense: exp });
      }
    } else if (period === 'week') {
      for (let i = 14; i >= 0; i--) {
        const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay() + 1 - i * 7);
        const we = new Date(ws); we.setDate(we.getDate() + 6);
        const startStr = localDate(ws);
        const endStr = localDate(we);
        const cond = storeId ? 'AND store_id = ?' : '';
        const params = storeId ? [startStr, endStr, storeId] : [startStr, endStr];
        const inc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date>=? AND date<=? AND type IN ('收入','income') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        const exp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date>=? AND date<=? AND type IN ('支出','expense') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        points.push({ label: 'W' + Math.ceil((ws.getDate()) / 7) + '/' + (ws.getMonth() + 1), income: inc, expense: exp });
      }
    } else if (period === 'month') {
      for (let i = 11; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ms = localDate(m).slice(0, 7);
        const cond = storeId ? 'AND store_id = ?' : '';
        const params = storeId ? [ms + '%', storeId] : [ms + '%'];
        const inc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date LIKE ? AND type IN ('收入','income') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        const exp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date LIKE ? AND type IN ('支出','expense') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        points.push({ label: (m.getMonth() + 1) + '月', income: inc, expense: exp });
      }
    } else if (period === 'year') {
      for (let i = 9; i >= 0; i--) {
        const y = String(now.getFullYear() - i);
        const cond = storeId ? 'AND store_id = ?' : '';
        const params = storeId ? [y + '%', storeId] : [y + '%'];
        const inc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date LIKE ? AND type IN ('收入','income') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        const exp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE date LIKE ? AND type IN ('支出','expense') " + cond + entryFilterClause(req.user.role)).get(...params) as any).t;
        points.push({ label: y, income: inc, expense: exp });
      }
    }
    
    res.json({ trend: points });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message }); }
});
export default router;

