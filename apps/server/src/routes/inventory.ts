import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';

const router = Router({ mergeParams: true });

// GET / - list master items for this store
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const items = db.prepare('SELECT * FROM inventory_master WHERE store_id = ? ORDER BY sort_order ASC, id ASC').all(storeId);
    const checks = db.prepare('SELECT * FROM inventory_checks WHERE store_id = ? ORDER BY created_at DESC LIMIT 20').all(storeId);
    for (const c of checks as any[]) {
      c.items_count = (db.prepare('SELECT COUNT(*) as cnt FROM inventory_check_items WHERE check_id = ?').get(c.id) as any).cnt || 0;
    }
    res.json({ items, checks });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /items - add master item
router.post('/items', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { name, quantity, photo, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '请输入物品名称' });
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM inventory_master WHERE store_id = ?').get(storeId) as any)?.m || 0;
    const result = db.prepare('INSERT INTO inventory_master (store_id, name, quantity, photo, status, sort_order) VALUES (?,?,?,?,?,?)').run(storeId, name, quantity || 0, photo || '', 'normal', sort_order ?? maxOrder + 1);
    opLog(req.user.id, Number(storeId), '盘点', '添加物品: ' + name);
    res.json({ id: result.lastInsertRowid, message: '物品添加成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /items/:id - update master item
router.put('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    const { name, quantity, photo, status, sort_order } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(name); }
    if (quantity !== undefined) { fields.push('quantity=?'); vals.push(quantity); }
    if (photo !== undefined) { fields.push('photo=?'); vals.push(photo); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (sort_order !== undefined) { fields.push('sort_order=?'); vals.push(sort_order); }
    if (fields.length > 0) {
      vals.push(req.params.id);
      db.prepare('UPDATE inventory_master SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    }
    res.json({ message: '物品已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /items/:id - delete master item
router.delete('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const item = db.prepare('SELECT store_id FROM inventory_master WHERE id = ?').get(req.params.id) as any;
    if (!item) return res.status(404).json({ error: '物品不存在' });
    if (String(item.store_id) !== String(storeId)) return res.status(404).json({ error: '物品不存在' });
    db.prepare('DELETE FROM inventory_master WHERE id = ?').run(req.params.id);
    res.json({ message: '物品已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /items/reorder - reorder items
router.post('/items/reorder', (req: AuthRequest, res: Response) => {
  try {
    const { order } = req.body; // [{id, sort_order}]
    if (!Array.isArray(order)) return res.status(400).json({ error: '参数错误' });
    const stmt = db.prepare('UPDATE inventory_master SET sort_order = ? WHERE id = ?');
    for (const o of order) stmt.run(o.sort_order, o.id);
    res.json({ message: '排序已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /checks - start a new inventory check
router.post('/checks', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const items = db.prepare('SELECT * FROM inventory_master WHERE store_id = ? ORDER BY sort_order ASC').all(storeId) as any[];
    if (items.length === 0) return res.status(400).json({ error: '请先添加物品' });
    const result = db.prepare('INSERT INTO inventory_checks (store_id, status, checked_by) VALUES (?,?,?)').run(storeId, 'in_progress', req.user.id);
    const checkId = result.lastInsertRowid;
    const stmt = db.prepare('INSERT INTO inventory_check_items (check_id, master_id, name, expected_qty, consumption, actual_qty, status) VALUES (?,?,?,?,?,?,?)');
    for (const item of items) {
      stmt.run(checkId, item.id, item.name, item.quantity, 0, item.quantity, 'normal');
    }
    opLog(req.user.id, Number(storeId), '盘点', '开始盘点 #' + checkId);
    res.json({ id: checkId, message: '盘点已开始' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /checks/:id - get check detail
router.get('/checks/:id', (req: AuthRequest, res: Response) => {
  try {
    const check = db.prepare('SELECT * FROM inventory_checks WHERE id = ?').get(req.params.id) as any;
    if (!check) return res.status(404).json({ error: '盘点记录不存在' });
    const items = db.prepare('SELECT * FROM inventory_check_items WHERE check_id = ? ORDER BY id ASC').all(check.id);
    res.json({ check, items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /checks/:id/items/:itemId - update check item
router.put('/checks/:id/items/:itemId', (req: AuthRequest, res: Response) => {
  try {
    const { consumption, actual_qty, status } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    if (consumption !== undefined) { fields.push('consumption=?'); vals.push(consumption); }
    if (actual_qty !== undefined) { fields.push('actual_qty=?'); vals.push(actual_qty); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (fields.length > 0) {
      vals.push(req.params.itemId);
      db.prepare('UPDATE inventory_check_items SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    }
    res.json({ message: '已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /checks/:id/complete - complete check, update master quantities
router.post('/checks/:id/complete', (req: AuthRequest, res: Response) => {
  try {
    const check = db.prepare('SELECT * FROM inventory_checks WHERE id = ?').get(req.params.id) as any;
    if (!check) return res.status(404).json({ error: '盘点记录不存在' });
    const items = db.prepare('SELECT * FROM inventory_check_items WHERE check_id = ?').all(check.id) as any[];
    for (const item of items) {
      const newQty = item.actual_qty || 0;
      db.prepare('UPDATE inventory_master SET quantity = ?, status = ? WHERE id = ?').run(newQty, item.status, item.master_id);
    }
    db.prepare("UPDATE inventory_checks SET status = 'completed' WHERE id = ?").run(req.params.id);
    opLog(req.user.id, Number(check.store_id), '盘点', '完成盘点 #' + req.params.id);
    res.json({ message: '盘点完成' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// POST /checks/batch-complete - create check, save results, complete, update master
router.post('/checks/batch-complete', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) return res.status(400).json({ error: '无盘点数据' });
    
    // Create check
    const checkResult = db.prepare('INSERT INTO inventory_checks (store_id, status, checked_by) VALUES (?,?,?)').run(storeId, 'completed', req.user.id);
    const checkId = checkResult.lastInsertRowid;
    
    const insertItem = db.prepare('INSERT INTO inventory_check_items (check_id, master_id, name, expected_qty, consumption, actual_qty, status) VALUES (?,?,?,?,?,?,?)');
    const updateMaster = db.prepare('UPDATE inventory_master SET quantity = ?, status = ? WHERE id = ?');
    
    for (const r of results) {
      const consumption = r.consumption || 0;
      const actual = r.actual_qty || 0;
      const expected = r.expected_qty || 0;
      // Auto-determine status
      let status = r.status || 'normal';
      if (consumption + actual !== expected) status = 'diff';
      if (actual === 0 && consumption === 0) status = 'empty';
      
      insertItem.run(checkId, r.item_id, r.name || '', expected, consumption, actual, status);
      // Update master quantity to actual
      updateMaster.run(actual, status, r.item_id);
    }
    
    opLog(req.user.id, Number(storeId), '盘点', '完成盘点 #' + checkId);
    res.json({ id: checkId, message: '盘点完成' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
export default router;
