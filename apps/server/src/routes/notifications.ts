import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;
    const total = (db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?').get(req.user.id) as any).count;
    const unread = (db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id) as any).count;
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(req.user.id, ps, offset);
    res.json({ notifications, total, unread, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { user_id, title, link, content } = req.body;
    if (!user_id || !title) return res.status(400).json({ error: '参数不完整' });
    const result = db.prepare('INSERT INTO notifications (user_id, title, link) VALUES (?,?,?)').run(user_id, title, link || content || '');
    res.json({ id: result.lastInsertRowid, message: '通知发送成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/read', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: '已标记为已读' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/read-all', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: '全部已读' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: '通知已删除' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
