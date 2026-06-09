import { Router, Response } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router({ mergeParams: true });

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.params.storeId;
    const { page, pageSize, type } = req.query;
    const p = parseInt(page as string) || 1;
    const ps = parseInt(pageSize as string) || 20;
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
    res.status(500).json({ error: err.message });
  }
});

export default router;