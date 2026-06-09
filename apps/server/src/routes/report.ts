import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { period, date, dateFrom, dateTo, month, year } = req.query;
    const user = db.prepare('SELECT role, store_id, username FROM users WHERE id = ?').get(req.user.id) as any;
    let stores;
    if (user.role === 'admin' || user.role === 'ADMIN') {
      stores = db.prepare('SELECT * FROM stores').all() as any[];
    } else if (user.store_id) {
      stores = db.prepare('SELECT * FROM stores WHERE id = ?').all(user.store_id) as any[];
    } else {
      stores = db.prepare('SELECT s.* FROM stores s JOIN shareholders sh ON s.id = sh.store_id WHERE sh.name = ?').all(user.username) as any[];
    }
    const reports = stores.map((store: any) => {
      let dateCondition = '';
      const params: any[] = [store.id];
      if (date) { dateCondition = 'AND date = ?'; params.push(date); }
      else if (dateFrom && dateTo) { dateCondition = 'AND date >= ? AND date <= ?'; params.push(dateFrom, dateTo); }
      else if (month) { dateCondition = 'AND date LIKE ?'; params.push(month + '%'); }
      else if (year) { dateCondition = 'AND date LIKE ?'; params.push(year + '%'); }
      else { const today = new Date().toISOString().slice(0, 10); dateCondition = 'AND date = ?'; params.push(today); }
      const income = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '收入' " + dateCondition).get(...params) as any;
      const expense = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM entries WHERE store_id = ? AND type = '支出' " + dateCondition).get(...params) as any;
      const categories = db.prepare('SELECT category, type, SUM(amount) as total FROM entries WHERE store_id = ? ' + dateCondition + ' GROUP BY category, type ORDER BY total DESC').all(...params);
      return { store_id: store.id, store_name: store.name, income: income?.total || 0, expense: expense?.total || 0, profit: (income?.total || 0) - (expense?.total || 0), categories };
    });
    const single = reports.find((r: any) => r.store_id === req.params.storeId) || reports[0] || { income: 0, expense: 0, categories: [] };
    res.json(single);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trend', (req: AuthRequest, res: Response) => {
  try {
    const { storeId, months } = req.query;
    const m = parseInt(months as string) || 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - m);
    const startStr = startDate.toISOString().slice(0, 7);
    const stores = storeId
      ? db.prepare('SELECT * FROM stores WHERE id = ?').all(storeId)
      : db.prepare('SELECT * FROM stores').all() as any[];
    const trends = (stores as any[]).map((store: any) => {
      const monthlyData = db.prepare('SELECT date, type, SUM(amount) as total FROM entries WHERE store_id = ? AND date >= ? GROUP BY substr(date,1,7), type ORDER BY date').all(store.id, startStr + '-01') as any[];
      const monthMap: Record<string, { income: number; expense: number }> = {};
      for (const row of monthlyData) {
        const mKey = row.date.slice(0, 7);
        if (!monthMap[mKey]) monthMap[mKey] = { income: 0, expense: 0 };
        if (row.type === '收入') monthMap[mKey].income = row.total;
        else monthMap[mKey].expense = row.total;
      }
      return { store_id: store.id, store_name: store.name, data: Object.entries(monthMap).map(([month, d]) => ({ month, income: d.income, expense: d.expense, profit: d.income - d.expense })) };
    });
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
