import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router({ mergeParams: true });

// GET / - list categories for a store (global + store-specific)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { type } = req.query;
    let sql = 'SELECT * FROM categories WHERE (store_id IS NULL OR store_id = ?)';
    const params: any[] = [storeId];
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY sort_order, id';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - create category
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: '请输入分类名称和类型' });
    const result = db.prepare('INSERT INTO categories (name, type, store_id) VALUES (?,?,?)').run(name, type, storeId);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - update category
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, type } = req.body;
    db.prepare('UPDATE categories SET name = COALESCE(?, name), type = COALESCE(?, type) WHERE id = ?').run(name, type, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - delete category
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;