import { localDate } from '../lib/utils.js';
import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { entryFilterClause } from '../lib/roles.js';

const router = Router({ mergeParams: true });

function getDateRange(period: string, dateStr: string) {
  const d = new Date(dateStr);
  let start: string, end: string, prevStart: string, prevEnd: string;
  if (period === 'day') {
    start = end = dateStr;
    const prev = new Date(d); prev.setDate(prev.getDate() - 1);
    prevStart = prevEnd = localDate(prev);
  } else if (period === 'week') {
    const day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    start = localDate(mon); end = localDate(sun);
    const pMon = new Date(mon); pMon.setDate(pMon.getDate() - 7);
    const pSun = new Date(pMon); pSun.setDate(pMon.getDate() + 6);
    prevStart = localDate(pMon); prevEnd = localDate(pSun);
  } else if (period === 'month') {
    start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    end = localDate(last);
    const pStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const pEnd = new Date(d.getFullYear(), d.getMonth(), 0);
    prevStart = localDate(pStart); prevEnd = localDate(pEnd);
  } else if (period === 'year') {
    start = d.getFullYear() + '-01-01'; end = d.getFullYear() + '-12-31';
    prevStart = (d.getFullYear() - 1) + '-01-01'; prevEnd = (d.getFullYear() - 1) + '-12-31';
  } else {
    start = '2000-01-01'; end = '2099-12-31';
    prevStart = prevEnd = '2000-01-01';
  }
  return { start, end, prevStart, prevEnd };
}

function queryStats(storeId: string, start: string, end: string, userRole?: string) {
  const income = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('收入','income') AND date>=? AND date<=?" + entryFilterClause(userRole)).get(storeId, start, end) as any).t || 0;
  const expense = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('支出','expense') AND date>=? AND date<=?" + entryFilterClause(userRole)).get(storeId, start, end) as any).t || 0;
  const cats = db.prepare("SELECT category, type, SUM(amount) as amount FROM entries WHERE store_id=? AND date>=? AND date<=?" + entryFilterClause(userRole) + " GROUP BY category, type ORDER BY amount DESC").all(storeId, start, end) as any[];
  return { income, expense, profit: income - expense, margin: income > 0 ? (income - expense) / income : 0, categories: cats };
}

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const userRole = req.user.role;
    const { period = 'day', date } = req.query;
    const dateStr = (date as string) || localDate();
    const { start, end, prevStart, prevEnd } = getDateRange(period as string, dateStr);

    const current = queryStats(storeId, start, end, userRole);
    const previous = queryStats(storeId, prevStart, prevEnd, userRole);

    const pctChange = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 1 : 0) : (cur - prev) / prev;

    // YoY
    const d = new Date(dateStr);
    let yoyStart: string, yoyEnd: string;
    if (period === 'day') {
      const yoyD = new Date(d); yoyD.setFullYear(yoyD.getFullYear() - 1);
      yoyStart = yoyEnd = localDate(yoyD);
    } else if (period === 'month') {
      yoyStart = (d.getFullYear() - 1) + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
      const yoyLast = new Date(d.getFullYear() - 1, d.getMonth() + 1, 0);
      yoyEnd = localDate(yoyLast);
    } else if (period === 'year') {
      yoyStart = (d.getFullYear() - 1) + '-01-01'; yoyEnd = (d.getFullYear() - 1) + '-12-31';
    } else {
      const wStart = new Date(d); wStart.setFullYear(wStart.getFullYear() - 1);
      yoyStart = localDate(wStart);
      const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
      yoyEnd = localDate(wEnd);
    }
    const yoyData = queryStats(storeId, yoyStart, yoyEnd, userRole);

    const incomeByCategory = current.categories.filter((c: any) => c.type === '收入' || c.type === 'income').map((c: any) => ({ category: c.category || '未分类', amount: c.amount }));
    const expenseByCategory = current.categories.filter((c: any) => c.type === '支出' || c.type === 'expense').map((c: any) => ({ category: c.category || '未分类', amount: c.amount }));


    // Fund balance for this store
    const storeInfo = db.prepare('SELECT initial_capital FROM stores WHERE id = ?').get(storeId) as any;
    const initCap = storeInfo?.initial_capital || 0;
    const allInc = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('\u6536\u5165','income')" + entryFilterClause(userRole)).get(storeId) as any).t || 0;
    const allExp = (db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM entries WHERE store_id=? AND type IN ('\u652f\u51fa','expense')" + entryFilterClause(userRole)).get(storeId) as any).t || 0;
    // payroll/dividends already recorded as entries
    const fundBalance = initCap + allInc - allExp;

    res.json({
      income: current.income,
      expense: current.expense,
      incomeByCategory,
      expenseByCategory,
      fundBalance,
      comparison: {
        current: { income: current.income, expense: current.expense },
        previous: { income: previous.income, expense: previous.expense },
        changes: {
          incomeChange: pctChange(current.income, previous.income),
          expenseChange: pctChange(current.expense, previous.expense),
          profitChange: pctChange(current.profit, previous.profit),
          marginChange: current.margin - previous.margin,
        },
      },
      yoy: {
        incomeChange: pctChange(current.income, yoyData.income),
        expenseChange: pctChange(current.expense, yoyData.expense),
        profitChange: pctChange(current.profit, yoyData.profit),
        marginChange: current.margin - yoyData.margin,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;