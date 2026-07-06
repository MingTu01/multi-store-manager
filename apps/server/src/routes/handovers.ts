import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isManagerOrAbove, isReadonly } from '../lib/roles.js';
import { sanitizeNote } from '../sanitize.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';
import { eventBus } from '../event-bus.js';
import { localDate } from '../lib/utils.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    // 角色检查: 管理员和店长可看所有，其他人只看自己门店
    if (!isAdmin(req.user.role) && !isManagerOrAbove(req.user.role)) {
      const user = db.prepare('SELECT store_id FROM users WHERE id = ?').get(req.user.id) as any;
      if (user && String(user.store_id) !== String(storeId)) {
        return res.status(403).json({ error: '无权限查看其他门店的交接记录' });
      }
    }
    const { page, pageSize, type } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = Math.min(parseInt(pageSize as string) || 20, 100);
    const offset = (p - 1) * ps;

    const countSql = type
      ? 'SELECT COUNT(*) as count FROM store_opens WHERE store_id = ? AND type = ?'
      : 'SELECT COUNT(*) as count FROM store_opens WHERE store_id = ?';
    const countParams = type ? [storeId, type] : [storeId];
    const total = (db.prepare(countSql).get(...countParams) as any).count;

    const dataSql = 'SELECT so.*, u.username as operator_name FROM store_opens so LEFT JOIN users u ON so.user_id = u.id WHERE so.store_id = ?' + (type ? ' AND so.type = ?' : '') + ' ORDER BY so.created_at DESC LIMIT ? OFFSET ?';
    const dataParams = type ? [storeId, type, ps, offset] : [storeId, ps, offset];
    const handovers = db.prepare(dataSql).all(...dataParams);

    const enriched = handovers.map((h: any) => {
      try { return { ...h, photos: JSON.parse(h.photos || '[]') }; }
      catch { return { ...h, photos: [] }; }
    });

    res.json({ handovers: enriched, total, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// ============ v2.2.0 日常交接（独立于开闭店交接）============

// GET /daily?date=2026-07-01 - 查询当日日常交接列表（STAFF 及以上可见）
router.get('/daily', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const role = req.user.role;
    // SHAREHOLDER 不可见日常交接
    if (isReadonly(role)) {
      return res.status(403).json({ error: '无权限查看交接记录' });
    }
    const date = (req.query.date as string) || localDate();

    const rows = db.prepare(
      `SELECT h.id, h.store_id, h.user_id, h.date, h.content, h.created_at, h.updated_at, u.name as user_name
       FROM staff_handovers h LEFT JOIN users u ON h.user_id = u.id
       WHERE h.store_id = ? AND h.date = ? ORDER BY h.created_at ASC`
    ).all(storeId, date);

    const data = rows.map((h: any) => ({
      ...h,
      is_mine: h.user_id === req.user.id,
      can_edit: h.user_id === req.user.id || isManagerOrAbove(role)
    }));

    res.json({ success: true, data, date });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// POST /daily - 创建日常交接（非 SHAREHOLDER）
router.post('/daily', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user.role)) {
      return res.status(403).json({ error: '只读角色无权操作' });
    }
    const storeId = req.params.storeId;
    const { content, date } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '交接内容不能为空' });
    }
    const handoverDate = date || localDate();

    const result = db.prepare(
      'INSERT INTO staff_handovers (store_id, user_id, date, content) VALUES (?,?,?,?)'
    ).run(storeId, req.user.id, handoverDate, sanitizeNote(content));

    opLog(req.user.id, storeId, '日常交接', `提交了 ${handoverDate} 的日常交接`);

    triggerNotification({
      type: 'shift',
      action: '日常交接',
      storeId,
      detail: `${req.user.name || req.user.username} 提交了交接：${content.substring(0, 50)}`,
      operatorName: req.user.name || req.user.username
    });

    eventBus.broadcast({ type: 'handover', action: 'new', storeId });

    res.json({ success: true, data: { id: result.lastInsertRowid }, message: '提交成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// PUT /daily/:id - 修改自己的交接（本人或 MANAGER 及以上）
router.put('/daily/:id', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user.role)) {
      return res.status(403).json({ error: '只读角色无权操作' });
    }
    const storeId = req.params.storeId;
    const id = req.params.id;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '交接内容不能为空' });
    }

    const record = db.prepare('SELECT * FROM staff_handovers WHERE id = ? AND store_id = ?').get(id, storeId) as any;
    if (!record) return res.status(404).json({ error: '交接记录不存在' });

    if (record.user_id !== req.user.id && !isManagerOrAbove(req.user.role)) {
      return res.status(403).json({ error: '只能修改自己的交接记录' });
    }

    db.prepare('UPDATE staff_handovers SET content = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(sanitizeNote(content), id);

    eventBus.broadcast({ type: 'handover', action: 'update', storeId });

    res.json({ success: true, message: '修改成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// DELETE /daily/:id - 删除自己的交接（本人或 MANAGER 及以上）
router.delete('/daily/:id', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user.role)) {
      return res.status(403).json({ error: '只读角色无权操作' });
    }
    const storeId = req.params.storeId;
    const id = req.params.id;

    const record = db.prepare('SELECT * FROM staff_handovers WHERE id = ? AND store_id = ?').get(id, storeId) as any;
    if (!record) return res.status(404).json({ error: '交接记录不存在' });

    if (record.user_id !== req.user.id && !isManagerOrAbove(req.user.role)) {
      return res.status(403).json({ error: '只能删除自己的交接记录' });
    }

    db.prepare('DELETE FROM staff_handovers WHERE id = ?').run(id);

    eventBus.broadcast({ type: 'handover', action: 'delete', storeId });

    res.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

export default router;