import { Router, Response } from 'express';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

const router = Router();

// GET / - list available reports
router.get('/', (req, res) => {
  try {
    const reportsDir = join(process.cwd(), 'public', 'reports');
    if (!existsSync(reportsDir)) return res.json([]);
    const files = readdirSync(reportsDir).filter(f => f.endsWith('.html') || f.endsWith('.png') || f.endsWith('.jpg'));
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:filename - serve report file
router.get('/:filename', (req, res) => {
  try {
    const filepath = join(process.cwd(), 'public', 'reports', req.params.filename);
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
