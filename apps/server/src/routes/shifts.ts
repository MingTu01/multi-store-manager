import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { opLog } from '../oplog.js';

const router = Router({ mergeParams: true });

// GET /
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { page, pageSize, type } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
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
      try {
        return { ...s, photos: JSON.parse(s.photos || '[]') };
      } catch {
        return { ...s, photos: [] };
      }
    });

    res.json({ shifts: enriched, total, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { type, photos, note, handover_content } = req.body;
    if (!type || !['open', 'close'].includes(type)) {
      return res.status(400).json({ error: '请指定类型 (open/close)' });
    }
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content) VALUES (?,?,?,?,?)').run(storeId, type, photosStr, note || '', handover_content || '');

    // Update store open status
    db.prepare('UPDATE stores SET is_open = ? WHERE id = ?').run(type === 'open' ? 1 : 0, storeId);

    const action = type === 'open' ? '开店' : '关店';
    opLog(req.user.id, storeId, action, action + '操作' + (note ? ': ' + note : ''));

    res.json({ id: result.lastInsertRowid, message: action + '成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// POST /open - convenience route for opening store
router.post('/open', (req: AuthRequest, res: Response) => {
  req.body.type = 'open';
  // Forward to the main POST handler by calling the same logic
  try {
    const storeId = req.params.storeId;
    const { photos, note, handover_content } = req.body;
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content) VALUES (?,?,?,?,?)').run(storeId, 'open', photosStr, note || '', handover_content || '');
    db.prepare('UPDATE stores SET is_open = 1 WHERE id = ?').run(storeId);
    opLog(req.user.id, storeId, '开店', '开店操作' + (note ? ': ' + note : ''));
    res.json({ id: result.lastInsertRowid, message: '开店成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /close - convenience route for closing store
router.post('/close', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { photos, note, handover_content } = req.body;
    const photosStr = JSON.stringify(photos || []);
    const result = db.prepare('INSERT INTO store_opens (store_id, type, photos, note, handover_content) VALUES (?,?,?,?,?)').run(storeId, 'close', photosStr, note || '', handover_content || '');
    db.prepare('UPDATE stores SET is_open = 0 WHERE id = ?').run(storeId);
    opLog(req.user.id, storeId, '关店', '关店操作' + (note ? ': ' + note : ''));
    res.json({ id: result.lastInsertRowid, message: '关店成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
