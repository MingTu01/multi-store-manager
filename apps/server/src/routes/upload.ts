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
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('\u53ea\u80fd\u4e0a\u4f20\u56fe\u7247\u6587\u4ef6'));
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
    const { url } = req.body;
    if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: '无效的文件路径' });
    const filePath = path.resolve(join(BASE_DIR, url));
    const uploadsDir = path.resolve(join(BASE_DIR, 'uploads'));
    if (!filePath.startsWith(uploadsDir + path.sep) && filePath !== uploadsDir) return res.status(400).json({ error: '路径不合法' });
    if (existsSync(filePath)) unlinkSync(filePath);
    res.json({ message: '文件已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
