import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';
import { sanitizeText } from '../sanitize.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { type } = req.query;
    let sql = 'SELECT * FROM categories WHERE (store_id IS NULL OR store_id = ?)';
    const params: any[] = [storeId];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY sort_order, id';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.post('/', (req: AuthRequest, res: Response) => {
    try {
    if (['SHAREHOLDER'].includes(req.user.role?.toUpperCase())) {
      return res.status(403).json({ error: '只读角色无权操作分类' });
    }

    const { storeId } = req.params;
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: '请输入分类名和类型' });
    const result = db.prepare('INSERT INTO categories (name, type, store_id) VALUES (?,?,?)').run(sanitizeText(name), type, storeId);
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/:id', (req: AuthRequest, res: Response) => {
    try {
    if (['SHAREHOLDER'].includes(req.user.role?.toUpperCase())) {
      return res.status(403).json({ error: '只读角色无权操作分类' });
    }

    const { storeId } = req.params;
    const { name, type } = req.body;
    // S28: 归属校验
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as any;
    if (!cat) return res.status(404).json({ error: '分类不存在' });
    if (!cat.store_id && !isAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权修改全局分类' });
    }
    if (cat.store_id && String(cat.store_id) !== String(storeId)) {
      return res.status(403).json({ error: '无权修改其他门店分类' });
    }
    db.prepare('UPDATE categories SET name = COALESCE(?, name), type = COALESCE(?, type) WHERE id = ?').run(sanitizeText(name), type, req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// S28: DELETE 添加归属校验
router.delete('/:id', (req: AuthRequest, res: Response) => {
    try {
    if (['SHAREHOLDER'].includes(req.user.role?.toUpperCase())) {
      return res.status(403).json({ error: '只读角色无权操作分类' });
    }

    const { storeId } = req.params;
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as any;
    if (!cat) return res.status(404).json({ error: '分类不存在' });
    if (!cat.store_id && !isAdmin(req.user.role)) {
      return res.status(403).json({ error: '无权删除全局分类' });
    }
    if (cat.store_id && String(cat.store_id) !== String(storeId)) {
      return res.status(403).json({ error: '无权删除其他门店分类' });
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

export default router;
