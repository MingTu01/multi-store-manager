import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { sanitizeNote } from '../sanitize.js';
import { isReadonly } from '../lib/roles.js';
import { opLog } from '../oplog.js';
import { triggerNotification } from '../notify-trigger.js';

const router = Router({ mergeParams: true });

// GET /
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { page, pageSize, type } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = Math.min(parseInt(pageSize as string) || 20, 100);
    const offset = (p - 1) * ps;

    let condition = 'store_id = ?';
    const params: any[] = [storeId];
    if (type) {
      condition += ' AND type = ?';
      params.push(type);
    }

    const total = (db.prepare('SELECT COUNT(*) as count FROM store_opens WHERE ' + condition).get(...params) as any).count;
    const shifts = db.prepare('SELECT * FROM store_opens WHERE ' + condition + ' ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, ps, offset);

    const enriched = shifts.map((s: any) => {
      let photoCount = 0;
      try { photoCount = JSON.parse(s.photos || '[]').length; } catch {}
      return { ...s, photos: [], photo_count: photoCount };
    });

    res.json({ success: true, data: enriched, pagination: { page: p, pageSize: ps, total } });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});


// GET /last-close-handover
router.get('/last-close-handover', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const last = db.prepare("SELECT handover_content, created_at FROM store_opens WHERE store_id = ? AND type = 'close' AND handover_content != '' ORDER BY created_at DESC LIMIT 1").get(storeId) as any;
    res.json({ success: true, data: { handover: last?.handover_content || '', date: last?.created_at || '' } });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// GET /:shiftId - Get single shift with photos
router.get('/:shiftId', (req: AuthRequest, res: Response) => {
  try {
    const shift = db.prepare('SELECT * FROM store_opens WHERE id = ? AND store_id = ?').get(req.params.shiftId, req.params.storeId) as any;
    if (!shift) return res.status(404).json({ error: '记录不存在' });
    let photos = [];
    try { photos = JSON.parse(shift.photos || '[]'); } catch {}
    res.json({ success: true, data: { ...shift, photos } });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});

// POST /
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user?.role)) return res.status(403).json({ error: '只读角色无权操作' });
    const storeId = req.params.storeId;
    const { type, photos, note, handover_content } = req.body;
    if (!type || !['open', 'close'].includes(type)) {
      return res.status(400).json({ error: '请指定类型 (open/close)' });
    }
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content, user_id) VALUES (?,?,?,?,?,?)').run(storeId, type, photosStr, sanitizeNote(note || ''), sanitizeNote(handover_content || ''), req.user?.id || null);

    // Update store open status
    db.prepare('UPDATE stores SET is_open = ? WHERE id = ?').run(type === 'open' ? 1 : 0, storeId);

    const action = type === 'open' ? '开店' : '关店';
    opLog(req.user.id, storeId, action, action + '操作' + (note ? ': ' + note : ''));

    triggerNotification({
      type: 'shift',
      action,
      storeId,
      detail: (req.user.name || req.user.username) + ' 执行了' + action + '操作' + (note ? ': ' + note : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ success: true, data: { id: result.lastInsertRowid }, message: action + '成功' });
  } catch (err: any) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message });
  }
});


// POST /open
router.post('/open', (req: AuthRequest, res: Response) => {
  req.body.type = 'open';
  try {
    if (isReadonly(req.user?.role)) return res.status(403).json({ error: '只读角色无权操作' });
    const storeId = req.params.storeId;
    const { photos, note, handover_content } = req.body;
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content, user_id) VALUES (?,?,?,?,?,?)').run(storeId, 'open', photosStr, sanitizeNote(note || ''), sanitizeNote(handover_content || ''), req.user?.id || null);
    db.prepare('UPDATE stores SET is_open = 1 WHERE id = ?').run(storeId);
    opLog(req.user.id, storeId, '开店', '开店操作' + (note ? ': ' + note : ''));

    triggerNotification({
      type: 'shift',
      action: '开店',
      storeId,
      detail: (req.user.name || req.user.username) + ' 执行了开店操作' + (note ? ': ' + note : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ success: true, data: { id: result.lastInsertRowid }, message: '开店成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST /close
router.post('/close', (req: AuthRequest, res: Response) => {
  try {
    if (isReadonly(req.user?.role)) return res.status(403).json({ error: '只读角色无权操作' });
    const storeId = req.params.storeId;
    const { photos, note, handover_content } = req.body;
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content, user_id) VALUES (?,?,?,?,?,?)').run(storeId, 'close', photosStr, sanitizeNote(note || ''), sanitizeNote(handover_content || ''), req.user?.id || null);
    db.prepare('UPDATE stores SET is_open = 0 WHERE id = ?').run(storeId);
    opLog(req.user.id, storeId, '关店', '关店操作' + (note ? ': ' + note : ''));

    triggerNotification({
      type: 'shift',
      action: '关店',
      storeId,
      detail: (req.user.name || req.user.username) + ' 执行了关店操作' + (note ? ': ' + note : '')
    , operatorName: req.user.name || req.user.username});

    res.json({ success: true, data: { id: result.lastInsertRowid }, message: '关店成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});


export default router;
