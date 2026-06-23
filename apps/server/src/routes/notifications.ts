import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';



// Auto-cleanup: delete read notifications older than 48 hours
function cleanupReadNotifications() {
  try {
    const result = db.prepare(
      "DELETE FROM notifications WHERE read = 1 AND created_at < datetime('now', '-48 hours', 'localtime')"
    ).run();
    if (result.changes > 0) {
      console.log('[通知清理] 已清除 ' + result.changes + ' 条已读通知(超过48小时)');
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
    const ps = Math.min(parseInt(pageSize as string) || 20, 100);
    const offset = (p - 1) * ps;
    const typeFilter = type && type !== 'all' ? String(type) : '';

    // 参数化构建 WHERE 条件
    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [req.user.id];
    if (typeFilter) {
      conditions.push('type = ?');
      params.push(typeFilter);
    }
    const where = 'WHERE ' + conditions.join(' AND ');

    const total = (db.prepare('SELECT COUNT(*) as count FROM notifications ' + where).get(...params) as any).count;
    const unread = (db.prepare('SELECT COUNT(*) as count FROM notifications ' + where + ' AND read = 0').get(...params) as any).count;

    // SELECT 查询使用表别名
    const selConditions = conditions.map(c => 'n.' + c);
    const selWhere = 'WHERE ' + selConditions.join(' AND ');
    const queryParams = [...params, ps, offset];
    const notifications = db.prepare('SELECT n.*, s.name as store_name FROM notifications n LEFT JOIN stores s ON n.store_id = s.id ' + selWhere + ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?').all(...queryParams);

    res.json({ notifications, total, unread, page: p, pageSize: ps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});;

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
