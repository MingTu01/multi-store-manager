import { Router } from 'express';
import db from '../db.js';
import { opLog } from '../oplog.js';

const router = Router({ mergeParams: true });

// GET inventory checks
router.get('/', (req, res) => {
  const { storeId } = req.params;
  const checks = db.prepare('SELECT * FROM inventory_checks WHERE store_id=? ORDER BY created_at DESC').all(storeId);
  for (const check of checks as any[]) {
    check.items = db.prepare('SELECT * FROM inventory_items WHERE check_id=?').all(check.id);
  }
  res.json(checks);
});

// POST create inventory check
router.post('/', (req, res) => {
  const { storeId } = req.params;
  const { note, items } = req.body;
  const user = (req as any).user;
  const result = db.prepare('INSERT INTO inventory_checks (store_id, note, checked_by) VALUES (?,?,?)').run(storeId, note || '', user.id);
  const checkId = result.lastInsertRowid;
  
  if (items && items.length > 0) {
    const stmt = db.prepare('INSERT INTO inventory_items (check_id, name, expected, actual, consumption, status, photo, note) VALUES (?,?,?,?,?,?,?,?)');
    for (const item of items) {
      stmt.run(checkId, item.name, item.expected || 0, item.actual || 0, item.consumption || 0, item.status || '正常', item.photo || '', item.note || '');
    }
  }
  
  opLog(user.id, Number(storeId), '盘点', '创建盘点单 #' + checkId);
  res.json({ id: checkId, success: true });
});

// PUT update inventory check (add/modify items)
router.put('/:id', (req, res) => {
  const { items } = req.body;
  if (items) {
    const stmt = db.prepare('INSERT OR REPLACE INTO inventory_items (id, check_id, name, expected, actual, consumption, status, photo, note) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const item of items) {
      stmt.run(item.id || null, req.params.id, item.name, item.expected || 0, item.actual || 0, item.consumption || 0, item.status || '正常', item.photo || '', item.note || '');
    }
  }
  res.json({ success: true });
});


// GET /:id - get inventory check detail with items
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const check = db.prepare('SELECT * FROM inventory_checks WHERE id = ? AND store_id = ?').get(req.params.id, storeId) as any;
    if (!check) return res.status(404).json({ error: '盘点记录不存在' });
    const items = db.prepare('SELECT * FROM inventory_items WHERE check_id = ?').all(check.id);
    res.json({ ...check, items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /:id/items - add items to inventory check
router.post('/:id/items', (req: AuthRequest, res: Response) => {
  try {
    const { product_name, expected_qty, actual_qty, unit, consumption, photo, note } = req.body;
    if (!product_name) return res.status(400).json({ error: '请输入项目名称' });
    const result = db.prepare('INSERT INTO inventory_items (check_id, product_name, expected_qty, actual_qty, unit, consumption, photo, note) VALUES (?,?,?,?,?,?,?,?)').run(req.params.id, product_name, expected_qty || 0, actual_qty || 0, unit || '', consumption || 0, photo || '', note || '');
    res.json({ id: result.lastInsertRowid, message: '条目添加成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
