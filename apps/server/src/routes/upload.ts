import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');

const router = Router();

const UPLOAD_DIRS = ['avatars', 'stores', 'shifts', 'inventory', 'health'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('不支持的文件类型，仅允许 JPEG/PNG/WebP'));
    }
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase() || '';
    if (!allowedExts.includes(ext)) {
      return cb(new Error('文件扩展名不允许，仅支持 jpg/jpeg/png/webp'));
    }
    cb(null, true);
  },
});

router.post('/:type', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type;
    if (!UPLOAD_DIRS.includes(type)) return res.status(400).json({ error: '\u4e0d\u652f\u6301\u7684\u4e0a\u4f20\u7c7b\u578b' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u6587\u4ef6' });
    const ext = file.mimetype === 'image/webp' ? 'webp' : file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/png' ? 'png' : 'webp';
    const filename = crypto.randomUUID() + '.' + ext;
    const uploadDir = join(BASE_DIR, 'uploads', type);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    writeFileSync(join(uploadDir, filename), file.buffer);
    res.json({ url: '/uploads/' + type + '/' + filename, filename });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/', (req: AuthRequest, res: Response) => {
  try {
    // 权限检查：确保认证中间件已应用
    if (!req.user || !req.user.role) return res.status(401).json({ error: '未认证' });
    // 角色检查：只有 ADMIN 和 STORE_ADMIN 可以删除文件
    if (!['ADMIN', 'STORE_ADMIN'].includes(req.user.role?.toUpperCase())) {
      return res.status(403).json({ error: '无权限删除文件' });
    }
    const { url } = req.body;
    if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: '无效的文件路径' });
    const filePath = path.resolve(join(BASE_DIR, url));
    const uploadsDir = path.resolve(join(BASE_DIR, 'uploads'));
    if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) return res.status(400).json({ error: '路径不合法' });

    // 验证文件属于该用户的店铺（非 ADMIN 需校验）
    if (req.user.role?.toUpperCase() !== 'ADMIN') {
      const urlParts = url.split('/').filter(Boolean); // e.g. ['uploads', 'stores', 'filename.ext']
      const uploadType = urlParts.length >= 2 ? urlParts[1] : '';
      const storeTypes = ['stores', 'shifts', 'inventory'];
      if (storeTypes.includes(uploadType)) {
        const userStoreId = req.user.store_id;
        if (!userStoreId) return res.status(403).json({ error: '无关联店铺，无法删除' });
        // 校验文件是否存在于数据库中并属于该店铺
        const fileUrl = url; // e.g. /uploads/stores/uuid.webp
        const linked = db.prepare(
          "SELECT id FROM stores WHERE store_id = ? AND (photos LIKE ?) UNION ALL SELECT id FROM entries WHERE store_id = ? AND (photo_url LIKE ? OR attachments LIKE ?)"
        ).get(userStoreId, '%' + fileUrl + '%', userStoreId, '%' + fileUrl + '%', '%' + fileUrl + '%');
        if (!linked) {
          return res.status(403).json({ error: '文件不属于您的店铺' });
        }
      }
    }

    if (existsSync(filePath)) unlinkSync(filePath);
    res.json({ message: '文件已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
