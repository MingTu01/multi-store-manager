import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { period, date, storeId } = req.query;
    const d = date ? new Date(date as string) : new Date();
    const dateStr = d.toISOString().slice(0, 10);
    const storeCondition = storeId ? 'AND store_id = ?' : '';
    const storeParams = storeId ? [storeId] : [];

    function getDateConditions(d: Date, period: string) {
      const ds = d.toISOString().slice(0, 10);
      let cur = '', curP: any[] = [], prev = '', prevP: any[] = [], yoy = '', yoyP: any[] = [];
      if (period === 'day') {
        cur = 'AND date = ?'; curP = [ds];
        const p = new Date(d); p.setDate(p.getDate()-1); prev = 'AND date = ?'; prevP = [p.toISOString().slice(0,10)];
        const y = new Date(d); y.setFullYear(y.getFullYear()-1); yoy = 'AND date = ?'; yoyP = [y.toISOString().slice(0,10)];
      } else if (period === 'week') {
        const ws = new Date(d); ws.setDate(d.getDate()-d.getDay()+1);
        const we = new Date(ws); we.setDate(ws.getDate()+6);
        cur = 'AND date >= ? AND date <= ?'; curP = [ws.toISOString().slice(0,10), we.toISOString().slice(0,10)];
        const pws = new Date(ws); pws.setDate(pws.getDate()-7); const pwe = new Date(pws); pwe.setDate(pws.getDate()+6);
        prev = 'AND date >= ? AND date <= ?'; prevP = [pws.toISOString().slice(0,10), pwe.toISOString().slice(0,10)];
        const yws = new Date(ws); yws.setFullYear(yws.getFullYear()-1); const ywe = new Date(yws); ywe.setDate(yws.getDate()+6);
        yoy = 'AND date >= ? AND date <= ?'; yoyP = [yws.toISOString().slice(0,10), ywe.toISOString().slice(0,10)];
      } else if (period === 'month') {
        const ms = ds.slice(0,7);
        cur = "AND strftime('%Y-%m',date) = ?"; curP = [ms];
        const pm = new Date(d.getFullYear(), d.getMonth()-1, 1); prev = "AND strftime('%Y-%m',date) = ?"; prevP = [pm.toISOString().slice(0,7)];
        const ym = new Date(d); ym.setFullYear(ym.getFullYear()-1); yoy = "AND strftime('%Y-%m',date) = ?"; yoyP = [ym.toISOString().slice(0,7)];
      } else if (period === 'year') {
        const ys = ds.slice(0,4);
        cur = "AND strftime('%Y',date) = ?"; curP = [ys];
        prev = "AND strftime('%Y',date) = ?"; prevP = [String(parseInt(ys)-1)];
        yoy = "AND strftime('%Y',date) = ?"; yoyP = [String(parseInt(ys)-2)];
      }
      return { cur, curP, prev, prevP, yoy, yoyP };
    }

    const conds = getDateConditions(d, (period as string) || 'day');
    const base = 'FROM entries WHERE 1=1 ' + storeCondition;

    const q = (type: string, cond: string, params: any[]) => {
      try { return (db.prepare(`SELECT COALESCE(SUM(amount),0) as t ${base} AND type='${type}' ${cond}`).get(...storeParams, ...params) as any).t || 0; } catch { return 0; }
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

    const incomeByCategory = db.prepare(`SELECT category, SUM(amount) as amount ${base} AND type='收入' ${conds.cur} GROUP BY category ORDER BY amount DESC`).all(...storeParams, ...conds.curP);
    const expenseByCategory = db.prepare(`SELECT category, SUM(amount) as amount ${base} AND type='支出' ${conds.cur} GROUP BY category ORDER BY amount DESC`).all(...storeParams, ...conds.curP);

    // Per-store summary (only for admin without storeId filter)
    let stores: any[] = [];
    if (!storeId) {
      const allStores = db.prepare('SELECT * FROM stores ORDER BY id').all() as any[];
      stores = allStores.map((s: any) => {
        const sc = 'AND store_id = ?';
        const si = q('收入', conds.cur + sc, [...conds.curP, s.id]);
        const se = q('支出', conds.cur + sc, [...conds.curP, s.id]);
        return { id: s.id, name: s.name, address: s.address, is_open: s.is_open, income: si, expense: se, profit: si - se, margin: si > 0 ? (si - se) / si : 0 };
      });
    }

    res.json({
      income: ci, expense: ce, profit: cp, margin: cm,
      comparison: { current: { income: ci, expense: ce, profit: cp, margin: cm }, previous: { income: pi, expense: pe, profit: pp, margin: pm }, changes: { incomeChange: pct(ci,pi), expenseChange: pct(ce,pe), profitChange: pct(cp,pp), marginChange: pct(cm,pm) } },
      yoy: { incomeChange: pct(ci,yi), expenseChange: pct(ce,ye), profitChange: pct(cp,yp), marginChange: cm !== 0 && yi > 0 ? (cm - (yi>0?(yi-ye)/yi:0)) / Math.abs(yi>0?(yi-ye)/yi:0||1) : 0 },
      incomeByCategory, expenseByCategory, stores
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;