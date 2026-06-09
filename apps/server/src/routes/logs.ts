import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { storeId } = req.query;
  let sql = 'SELECT o.*, u.username FROM op_logs o LEFT JOIN users u ON o.user_id=u.id';
  const params: any[] = [];
  
  if (storeId) {
    sql += ' WHERE o.store_id=?';
    params.push(storeId);
  }
  
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

export default router;
