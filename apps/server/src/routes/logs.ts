import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const { storeId, action, dateFrom, dateTo, search, page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;

    let whereClause = '';
    const countParams: any[] = [];
    const queryParams: any[] = [];

    // Filter by store
    if (storeId) {
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + 'o.target=?';
      countParams.push(String(storeId));
      queryParams.push(String(storeId));
    }

    // Filter by action type
    if (action && action !== 'all') {
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + 'o.action=?';
      countParams.push(String(action));
      queryParams.push(String(action));
    }

    // Filter by date range
    if (dateFrom) {
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + 'DATE(o.created_at)>=?';
      countParams.push(String(dateFrom));
      queryParams.push(String(dateFrom));
    }
    if (dateTo) {
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + 'DATE(o.created_at)<=?';
      countParams.push(String(dateTo));
      queryParams.push(String(dateTo));
    }

    // Search in detail
    if (search) {
      whereClause += (whereClause ? ' AND ' : ' WHERE ') + '(o.detail LIKE ? OR o.user_name LIKE ?)';
      const searchTerm = '%' + String(search) + '%';
      countParams.push(searchTerm, searchTerm);
      queryParams.push(searchTerm, searchTerm);
    }

    const total = (db.prepare('SELECT COUNT(*) as count FROM op_logs o' + whereClause).get(...countParams) as any).count;

    const sql = 'SELECT o.id, o.user_id, o.user_name, o.action, o.detail, o.created_at, o.target, o.ip, s.name AS store_name FROM op_logs o LEFT JOIN stores s ON o.target = s.id' + whereClause + ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    queryParams.push(ps, offset);
    const rows = db.prepare(sql).all(...queryParams);

    const totalPages = Math.ceil(total / ps);
    res.json({ data: rows, total, page: p, pageSize: ps, totalPages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;