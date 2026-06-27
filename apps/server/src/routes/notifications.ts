import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';



// Auto-cleanup: delete read notifications older than 30 days, limit unread to 500
function cleanupReadNotifications() {
  try {
    // 删除超过30天的已读通知
    const result = db.prepare(
      "DELETE FROM notifications WHERE read = 1 AND created_at < datetime('now', '-30 days', 'localtime')"
    ).run();
    if (result.changes > 0) {
      console.log('[通知清理] 已清理 ' + result.changes + ' 条已读通知(超过30天)');
    }
    // 限制每用户未读通知上限500条
    const users = db.prepare("SELECT DISTINCT user_id FROM notifications WHERE read = 0").all() as any[];
    for (const u of users) {
      const count = (db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0").get(u.user_id) as any).cnt;
      if (count > 500) {
        const excess = db.prepare(
          "DELETE FROM notifications WHERE user_id = ? AND read = 0 AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC LIMIT 500)"
        ).run(u.user_id, u.user_id);
        if (excess.changes > 0) {
          console.log('[通知清理] 用户 ' + u.user_id + ' 未读通知超出限制，已删除 ' + excess.changes + ' 条');
        }
      }
    }
  } catch (err) {
    console.error('[通知清理] 清理失败:', err);
  }
}

// Run cleanup every hour
setInterval(cleanupReadNotifications, 3600000);
// Run once on startup
cleanupReadNotifications();

const router = Router();

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, type } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
    const offset = (p - 1) * ps;
    const typeFilter = type && type !== 'all' ? String(type) : '';

    // Build WHERE for count queries (no table alias)
    const countWhere = typeFilter ? 'WHERE user_id = ? AND type = ?' : 'WHERE user_id = ?';
    const countParams: any[] = typeFilter ? [req.user.id, typeFilter] : [req.user.id];

    const total = (db.prepare('SELECT COUNT(*) as count FROM notifications ' + countWhere).get(...countParams) as any).count;
    const unreadWhere = typeFilter ? 'WHERE user_id = ? AND read = 0 AND type = ?' : 'WHERE user_id = ? AND read = 0';
    const unreadParams: any[] = typeFilter ? [req.user.id, typeFilter] : [req.user.id];
    const unread = (db.prepare('SELECT COUNT(*) as count FROM notifications ' + unreadWhere).get(...unreadParams) as any).count;

    // Build WHERE for SELECT query (with table alias n.)
    const selWhere = typeFilter ? 'WHERE n.user_id = ? AND n.type = ?' : 'WHERE n.user_id = ?';
    const queryParams: any[] = typeFilter ? [req.user.id, typeFilter, ps, offset] : [req.user.id, ps, offset];
    const notifications = db.prepare('SELECT n.*, s.name as store_name FROM notifications n LEFT JOIN stores s ON n.store_id = s.id ' + selWhere + ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?').all(...queryParams);

    res.json({ notifications, total, unread, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /notifications/unread-count - 轻量API，仅返回未读数量
router.get('/unread-count', (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id) as any;
    res.json({ count: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - 内部调用接口（由 triggerNotification 使用，外部不可直接调用）
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const { user_id, title, link, content, type, store_id } = req.body;
    if (!user_id || !title) return res.status(400).json({ error: '参数不完整' });
    const result = db.prepare(
      'INSERT INTO notifications (user_id, title, link, type, content, store_id, read, created_at) VALUES (?,?,?,?,?,?,0,datetime(\'now\',\'localtime\'))'
    ).run(user_id, title, link || '', type || '', content || '', store_id || null);
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
