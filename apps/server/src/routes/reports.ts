import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { join } from 'path';
const BASE_DIR = join(__dirname, '..', '..');
import { existsSync, readFileSync, readdirSync } from 'fs';
import { safePath } from '../middleware/store-access.js';

const router = Router();

// GET / - list available reports
router.get('/', (req, res) => {
  try {
    const reportsDir = join(BASE_DIR, 'public', 'reports');
    if (!existsSync(reportsDir)) return res.json([]);
    const files = readdirSync(reportsDir).filter(f => f.endsWith('.html') || f.endsWith('.png') || f.endsWith('.jpg'));
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:filename - serve report file — S3: 路径安全校验
router.get('/:filename', (req, res) => {
  try {
    const filepath = safePath(join(BASE_DIR, 'public', 'reports'), req.params.filename);
    if (!filepath) return res.status(400).json({ error: '非法文件名' });
    if (!existsSync(filepath)) return res.status(404).json({ error: '报告不存在' });
    const ext = req.params.filename.split('.').pop()?.toLowerCase();
    if (ext === 'html') {
      const content = readFileSync(filepath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(content);
    } else if (ext === 'png') {
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(filepath);
    } else if (ext === 'jpg' || ext === 'jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
      res.sendFile(filepath);
    } else {
      res.sendFile(filepath);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
