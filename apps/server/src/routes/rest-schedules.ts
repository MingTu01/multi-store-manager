import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isManagerOrAbove } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';
import { eventBus } from '../event-bus.js';
import { sanitizeNote } from '../sanitize.js';

const router = Router({ mergeParams: true });

// GET / - 查询排休列表（全部店铺角色可查）
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { dateFrom, dateTo, date } = req.query;

    let condition = 'r.store_id = ?';
    const params: any[] = [storeId];

    if (date) {
      condition += ' AND r.date = ?';
      params.push(date);
    } else if (dateFrom && dateTo) {
      condition += ' AND r.date >= ? AND r.date <= ?';
      params.push(dateFrom, dateTo);
    } else if (dateFrom) {
      condition += ' AND r.date >= ?';
      params.push(dateFrom);
    } else if (dateTo) {
      condition += ' AND r.date <= ?';
      params.push(dateTo);
    }

    const rows = db.prepare(
      `SELECT r.id, r.store_id, r.user_id, r.date, r.type, r.leave_type, r.note, r.created_at, r.updated_at,
              u.name as user_name, u.job_title as user_job_title
       FROM staff_rest_schedules r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE ${condition}
       ORDER BY r.date DESC, r.id DESC`
    ).all(...params);

    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// POST / - 创建排休（MANAGER 及以上）
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user?.role)) {
      return res.status(403).json({ error: '仅店长及以上角色可排休' });
    }
    const storeId = req.params.storeId;
    const { user_id, date, type, leave_type, note } = req.body;

    if (!user_id || !date || !type) {
      return res.status(400).json({ error: '缺少必填字段：user_id, date, type' });
    }
    if (!['rest', 'leave'].includes(type)) {
      return res.status(400).json({ error: 'type 必须为 rest 或 leave' });
    }
    if (type === 'leave' && leave_type && !['sick', 'personal', 'annual'].includes(leave_type)) {
      return res.status(400).json({ error: 'leave_type 必须为 sick/personal/annual' });
    }

    // 校验员工归属本店
    const user = db.prepare('SELECT id, name, store_id FROM users WHERE id = ?').get(user_id) as any;
    if (!user) return res.status(404).json({ error: '员工不存在' });
    if (String(user.store_id) !== String(storeId)) {
      return res.status(403).json({ error: '该员工不属于本门店' });
    }

    // 唯一约束：同一员工同一天同类型不可重复
    const exists = db.prepare('SELECT id FROM staff_rest_schedules WHERE user_id = ? AND date = ? AND type = ?').get(user_id, date, type);
    if (exists) {
      return res.status(409).json({ error: '该员工当天已存在同类型排休记录' });
    }

    const result = db.prepare(
      'INSERT INTO staff_rest_schedules (store_id, user_id, date, type, leave_type, note, created_by) VALUES (?,?,?,?,?,?,?)'
    ).run(storeId, user_id, date, type, type === 'leave' ? (leave_type || '') : '', sanitizeNote(note || ''), req.user?.id || null);

    opLog(req.user.id, storeId, '排休', `为 ${user.name} 排休：${date} ${type === 'rest' ? '全天休' : '请假'}`);

    triggerNotification({
      type: 'shift',
      action: '排休通知',
      storeId,
      detail: `${user.name} ${date} ${type === 'rest' ? '全天休' : '请假'}`,
      operatorName: req.user.name || req.user.username
    });

    eventBus.broadcast({ type: 'rest', action: 'new', storeId });

    res.json({ success: true, data: { id: result.lastInsertRowid }, message: '排休成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// DELETE /:id - 删除排休（MANAGER 及以上）
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    if (!isManagerOrAbove(req.user?.role)) {
      return res.status(403).json({ error: '仅店长及以上角色可删除排休' });
    }
    const storeId = req.params.storeId;
    const id = req.params.id;

    const record = db.prepare('SELECT r.id, r.user_id, r.date, r.type, u.name as user_name FROM staff_rest_schedules r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ? AND r.store_id = ?').get(id, storeId) as any;
    if (!record) return res.status(404).json({ error: '排休记录不存在' });

    db.prepare('DELETE FROM staff_rest_schedules WHERE id = ? AND store_id = ?').run(id, storeId);

    opLog(req.user.id, storeId, '删除排休', `删除 ${record.user_name} ${record.date} 的排休记录`);

    triggerNotification({
      type: 'shift',
      action: '排休取消',
      storeId,
      detail: `${record.user_name} ${record.date} 排休已取消`,
      operatorName: req.user.name || req.user.username
    });

    eventBus.broadcast({ type: 'rest', action: 'delete', storeId });

    res.json({ success: true, message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

export default router;
