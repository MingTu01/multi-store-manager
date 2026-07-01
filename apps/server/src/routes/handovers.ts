import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin, isManagerOrAbove } from '../lib/roles.js';

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

export default router;