import { requireNotReadonly } from '../middleware/require-role.js';
﻿import { triggerNotification } from '../notify-trigger.js';
import { eventBus } from '../event-bus.js';
import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';
import { isManagerOrAbove } from '../lib/roles.js';

// STAFF can perform: add items, takeout, inventory checks
function canOperateInventory(role: string): boolean {
  return ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'].includes(role);
}
import { sanitizeText, sanitizeNote } from '../sanitize.js';

const router = Router({ mergeParams: true });

function autoStatus(qty: number): string {
  if (qty <= 0) return 'pending'; // ???
  return 'normal';
}


// GET / - list master items for this store
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const items = db.prepare('SELECT * FROM inventory_master WHERE store_id = ? ORDER BY sort_order ASC, id ASC').all(storeId);
    const p = parseInt(req.query.page as string) || 1;
    const ps = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (p - 1) * ps;
    const total = (db.prepare('SELECT COUNT(*) as count FROM inventory_checks WHERE store_id = ?').get(storeId) as any).count || 0;
    const totalPages = Math.ceil(total / ps);
    const checks = db.prepare('SELECT * FROM inventory_checks WHERE store_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(storeId, ps, offset);
    // Batch query item counts to avoid N+1
    const _checkIds = (checks as any[]).map((c: any) => c.id);
    const _countMap = new Map<string, number>();
    if (_checkIds.length > 0) {
      const _cph = _checkIds.map(() => '?').join(',');
      const _counts = db.prepare('SELECT check_id, COUNT(*) as cnt FROM inventory_check_items WHERE check_id IN (' + _cph + ') GROUP BY check_id').all(..._checkIds) as any[];
      for (const row of _counts) _countMap.set(row.check_id, row.cnt);
    }

    for (const c of checks as any[]) {
      c.items_count = _countMap.get(c.id) || 0;
    }
    res.json({ success: true, data: { items, checks }, pagination: { page: p, pageSize: ps, total, totalPages } });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /items - add master item
router.post('/items', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const storeId = req.params.storeId;
    const { name, quantity, photo, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '请输入物品名称' });
    const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM inventory_master WHERE store_id = ?').get(storeId) as any)?.m || 0;
    const result = db.prepare('INSERT INTO inventory_master (store_id, name, quantity, photo, status, sort_order) VALUES (?,?,?,?,?,?)').run(storeId, sanitizeText(name), quantity || 0, photo || '', 'normal', sort_order ?? maxOrder + 1);
    opLog(req.user.id, storeId, '盘点', '添加物品: ' + name);
    triggerNotification({ type: 'inventory', action: '新增盘点条目', storeId, detail: name , operatorName: req.user.name || req.user.username});
    res.json({ success: true, data: { id: result.lastInsertRowid }, message: '物品添加成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// PUT /items/:id - update master item
router.put('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const { name, quantity, photo, status, sort_order } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { fields.push('name=?'); vals.push(sanitizeText(name)); }
    if (quantity !== undefined) { fields.push('quantity=?'); vals.push(quantity); }
    if (photo !== undefined) { fields.push('photo=?'); vals.push(photo); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (sort_order !== undefined) { fields.push('sort_order=?'); vals.push(sort_order); }
    if (fields.length > 0) {
      vals.push(req.params.id);
      db.prepare('UPDATE inventory_master SET ' + fields.join(',') + ' WHERE id=?').run(...vals);
    }
      // Log the edit
      const editedItem = db.prepare('SELECT name FROM inventory_master WHERE id = ?').get(req.params.id) as any;
      const changes: string[] = [];
      if (name !== undefined) changes.push('名称:' + name);
      if (quantity !== undefined) changes.push('数量:' + quantity);
      if (status !== undefined) { const statusNames: Record<string,string> = {normal:'正常',diff:'差异',lost:'丢失',scrap:'报废',empty:'空仓',restocking:'待补货',pending:'待补货'}; changes.push('状态:' + (statusNames[status] || status)); }
      opLog(req.user.id, req.params.storeId, '盘点', '编辑物品 ' + (editedItem?.name || '') + ' (' + changes.join(', ') + ')');
    res.json({ success: true, data: null, message: '物品已更新' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// DELETE /items/:id - delete master item
router.delete('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const itemId = req.params.id;
    const item = db.prepare('SELECT * FROM inventory_master WHERE id = ?').get(itemId) as any;
    if (!item) return res.status(404).json({ error: '物品不存在' });
    // Delete related check items first
    db.prepare('DELETE FROM inventory_check_items WHERE master_id = ?').run(itemId);
    // Delete the master item
    db.prepare('DELETE FROM inventory_master WHERE id = ?').run(itemId);
    opLog(req.user.id, item.store_id, '删除盘点物品', item.name);
    res.json({ success: true, data: null, message: '删除成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// 领出物品
router.post('/items/:id/takeout', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const { storeId } = req.params;
    const { quantity } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ error: '请输入领出数量' });
    const item = db.prepare('SELECT * FROM inventory_master WHERE id = ? AND store_id = ?').get(req.params.id, storeId) as any;
    if (!item) return res.status(404).json({ error: '物品不存在' });
    if (item.quantity < quantity) return res.status(400).json({ error: '库存不足，当前库存: ' + item.quantity });
    const newQty = item.quantity - quantity;
    const newStatus = newQty <= 0 ? 'pending' : item.status;
    db.prepare('UPDATE inventory_master SET quantity = ?, status = ? WHERE id = ?').run(newQty, newStatus, req.params.id);
    opLog(req.user.id, storeId, '盘点', '领出 ' + item.name + ' x' + quantity + ' (剩余' + newQty + ')');
    res.json({ success: true, data: { newQuantity: newQty }, message: '领出成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.delete('/items/:id', (req: AuthRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const item = db.prepare('SELECT store_id FROM inventory_master WHERE id = ?').get(req.params.id) as any;
    if (!item) return res.status(404).json({ error: '物品不存在' });
    if (String(item.store_id) !== String(storeId)) return res.status(404).json({ error: '物品不存在' });
    db.prepare('DELETE FROM inventory_master WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: null, message: '物品已删除' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /items/reorder - reorder items
router.post('/items/reorder', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const { order } = req.body; // [{id, sort_order}]
    if (!Array.isArray(order)) return res.status(400).json({ error: '参数错误' });
    const stmt = db.prepare('UPDATE inventory_master SET sort_order = ? WHERE id = ?');
    for (const o of order) stmt.run(o.sort_order, o.id);
    res.json({ success: true, data: null, message: '排序已更新' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /checks - start a new inventory check
router.post('/checks', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const storeId = req.params.storeId;
    const items = db.prepare('SELECT * FROM inventory_master WHERE store_id = ? ORDER BY sort_order ASC').all(storeId) as any[];
    if (items.length === 0) return res.status(400).json({ error: '请先添加物品' });
    const result = db.prepare('INSERT INTO inventory_checks (store_id, status, checked_by) VALUES (?,?,?)').run(storeId, 'in_progress', req.user.id);
    const checkId = result.lastInsertRowid;
    const stmt = db.prepare('INSERT INTO inventory_check_items (check_id, master_id, name, expected_qty, consumption, actual_qty, status) VALUES (?,?,?,?,?,?,?)');
    for (const item of items) {
      stmt.run(checkId, item.id, item.name, item.quantity, 0, item.quantity, 'normal');
    }
    opLog(req.user.id, storeId, '盘点', '开始盘点 #' + checkId);
    res.json({ success: true, data: { id: checkId }, message: '盘点已开始' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// GET /checks/:id - get check detail
router.get('/checks/:id', (req: AuthRequest, res: Response) => {
  try {
    const check = db.prepare('SELECT * FROM inventory_checks WHERE id = ?').get(req.params.id) as any;
    if (!check) return res.status(404).json({ error: '盘点记录不存在' });
    const items = db.prepare('SELECT * FROM inventory_check_items WHERE check_id = ? ORDER BY id ASC').all(check.id);
    res.json({ success: true, data: { check, items } });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// PUT /checks/:id/items/:itemId - update check item
router.put('/checks/:id/items/:itemId', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
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
    res.json({ success: true, data: null, message: '已更新' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /checks/:id/complete - complete check, update master quantities
router.post('/checks/:id/complete', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const check = db.prepare('SELECT * FROM inventory_checks WHERE id = ?').get(req.params.id) as any;
    if (!check) return res.status(404).json({ error: '盘点记录不存在' });
    const items = db.prepare('SELECT * FROM inventory_check_items WHERE check_id = ?').all(check.id) as any[];
    const completeCheck = db.transaction((checkId: number) => {
      for (const item of items) {
        const newQty = item.actual_qty || 0;
        const finalStatus = newQty <= 0 ? 'pending' : (item.status || 'normal');
        db.prepare('UPDATE inventory_master SET quantity = ?, status = ? WHERE id = ?').run(newQty, finalStatus, item.master_id);
      }
      db.prepare("UPDATE inventory_checks SET status = 'completed' WHERE id = ?").run(checkId);
    });
    completeCheck(Number(req.params.id));
    opLog(req.user.id, check.store_id, '盘点', '完成盘点 #' + req.params.id);
    triggerNotification({ type: 'inventory', action: '盘点完成', storeId: check.store_id, detail: '盘点 #' + req.params.id + ' 已完成', operatorName: req.user.name || req.user.username });
    eventBus.broadcast({ type: 'inventory', action: 'check', storeId: check.store_id, data: { checkId: req.params.id } });
    res.json({ success: true, data: null, message: '盘点完成' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});


// POST /checks/batch-complete - create check, save results, complete, update master
router.post('/checks/batch-complete', (req: AuthRequest, res: Response) => {
  try {
    if (!canOperateInventory(req.user.role)) return res.status(403).json({ error: '无权操作' });
    const storeId = req.params.storeId;
    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) return res.status(400).json({ error: '无盘点数据' });
    
    
    const batchComplete = db.transaction((storeId: string, userId: number, resultsArr: any[]) => {
      const checkResult = db.prepare('INSERT INTO inventory_checks (store_id, status, checked_by) VALUES (?,?,?)').run(storeId, 'completed', userId);
      const checkId = checkResult.lastInsertRowid;
      const insertItem = db.prepare('INSERT INTO inventory_check_items (check_id, master_id, name, expected_qty, consumption, actual_qty, status) VALUES (?,?,?,?,?,?,?)');
      const updateMaster = db.prepare('UPDATE inventory_master SET quantity = ?, status = ? WHERE id = ?');
      for (const r of resultsArr) {
        const consumption = r.consumption || 0;
        const actual = r.actual_qty || 0;
        const expected = r.expected_qty || 0;
        let status = r.status || 'normal';
        if (consumption + actual !== expected) status = 'diff';
        if (actual === 0 && consumption === 0) status = 'empty';
        insertItem.run(checkId, r.item_id, r.name || '', expected, consumption, actual, status);
        const finalStatus = actual <= 0 ? 'pending' : status;
        updateMaster.run(actual, finalStatus, r.item_id);
      }
      return checkId;
    });
    const checkId = batchComplete(storeId, req.user.id, results);
    opLog(req.user.id, storeId, '盘点', '完成盘点 #' + checkId);
    const anomalies = results.filter((r: any) => {
      const exp = r.expected_qty || 0; const act = r.actual_qty || 0; const con = r.consumption || 0;
      return (con + act !== exp) || (act === 0 && con === 0);
    });
    const detailParts: string[] = [];
    if (anomalies.length > 0) detailParts.push(anomalies.length + '项异常: ' + anomalies.map((a: any) => a.name + '(应' + a.expected_qty + '/实' + a.actual_qty + ')').join('、'));
    detailParts.push(results.length + '项盘点完成');
    triggerNotification({ type: 'inventory', action: '日常盘点', storeId, detail: detailParts.join(' | '), operatorName: req.user.name || req.user.username });
    eventBus.broadcast({ type: 'inventory', action: 'check', storeId, data: { checkId } });
    res.json({ success: true, data: { id: checkId }, message: '盘点完成' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});
export default router;
