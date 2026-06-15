import { Router, Response } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import db from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router();

// Allowed upload directories
const UPLOAD_DIRS = ['avatars', 'stores', 'shifts', 'inventory', 'health'];

// Multer config - save to temp, then move to correct dir with UUID name
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只能上传图片文件'));
    }
  },
});

// POST /api/upload/:type
router.post('/:type', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type;
    if (!UPLOAD_DIRS.includes(type)) {
      return res.status(400).json({ error: '不支持的上传类型' });
    }

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请选择文件' });

    // Generate UUID filename
    const ext = file.mimetype === 'image/webp' ? 'webp' : 
                file.mimetype === 'image/jpeg' ? 'jpg' : 
                file.mimetype === 'image/png' ? 'png' : 'webp';
    const uuid = crypto.randomUUID();
    const filename = uuid + '.' + ext;

    // Ensure directory exists
    const uploadDir = join(process.cwd(), 'uploads', type);
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

    // Save file
    const filePath = join(uploadDir, filename);
    require('fs').writeFileSync(filePath, file.buffer);

    // Return URL
    const url = '/uploads/' + type + '/' + filename;
    res.json({ url, filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload - delete file by URL
router.delete('/', (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith('/uploads/')) {
      return res.status(400).json({ error: '无效的文件路径' });
    }
    const filePath = join(process.cwd(), url);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    res.json({ message: '文件已删除' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
