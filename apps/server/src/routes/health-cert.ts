import { Router, Response } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync, renameSync } from 'fs';
import multer from 'multer';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { triggerNotification } from '../notify-trigger.js';

const router = Router();
const upload = multer({ dest: join(process.cwd(), 'uploads') });

router.post('/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u6587\u4ef6' });
    const ext = file.originalname.split('.').pop() || 'jpg';
    const newName = 'health_' + req.user.id + '_' + Date.now() + '.' + ext;
    const destDir = join(process.cwd(), 'uploads');
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    renameSync(file.path, join(destDir, newName));
    res.json({ url: '/uploads/' + newName, filename: newName });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/ocr', async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '\u8bf7\u63d0\u4f9b\u56fe\u7247\u8def\u5f84' });
    const imagePath = join(process.cwd(), url.replace(/^\//, ''));
    if (!existsSync(imagePath)) return res.status(404).json({ error: '\u56fe\u7247\u4e0d\u5b58\u5728' });

    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('chi_sim+eng');
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();

    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    let ocrName = '';
    let ocrExpiry = '';

    for (const line of lines) {
      if (line.includes('\u59d3') && line.includes('\u540d')) {
        const afterName = line.split(/\u59d3\s*\u540d/)[1] || '';
        const nameChars = afterName.match(/[\u4e00-\u9fff]/g);
        if (nameChars && nameChars.length >= 2) {
          const stopChars = ['\u6027', '\u522b', '\u8eab', '\u8bc1'];
          let name = '';
          for (const ch of nameChars) {
            if (stopChars.includes(ch)) break;
            name += ch;
            if (name.length >= 4) break;
          }
          ocrName = name;
        }
      }
      const dateMatch = line.match(/(\d{4})\s*\u5e74\s*(\d{1,2})\s*\u6708\s*(\d{1,2})/);
      if (dateMatch) {
        ocrExpiry = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
      }
    }

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id) as any;
    const match = ocrName && user?.name ? ocrName.includes(user.name) || user.name.includes(ocrName) : false;

    let daysLeft = -1;
    if (ocrExpiry) {
      const exp = new Date(ocrExpiry.replace(/\//g, '-'));
      daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    res.json({ ocrName, ocrExpiry, accountName: user?.name || '', match, daysLeft, rawText: lines.slice(0, 20).join('\n') });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/save', (req: AuthRequest, res: Response) => {
  try {
    const { url, name, expiry, verified } = req.body;
    db.prepare('UPDATE users SET health_cert_url = ?, health_cert_name = ?, health_cert_expiry = ?, health_cert_verified = ? WHERE id = ?')
      .run(url || '', name || '', expiry || '', verified ? 1 : 0, req.user.id);
    if (expiry) {
      const exp = new Date(expiry);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) {
        triggerNotification({ type: 'health_cert', action: '\u5065\u5eb7\u8bc1\u5df2\u8fc7\u671f', targetUserId: req.user.id, detail: '\u5df2\u8fc7\u671f' + Math.abs(daysLeft) + '\u5929' });
      } else if (daysLeft <= 30) {
        triggerNotification({ type: 'health_cert', action: '\u5065\u5eb7\u8bc1\u5373\u5c06\u5230\u671f', targetUserId: req.user.id, detail: '\u8fd8\u5269' + daysLeft + '\u5929\u5230\u671f' });
      }
    }
    res.json({ message: '\u5065\u5eb7\u8bc1\u4fe1\u606f\u5df2\u4fdd\u5b58' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/check-expiry', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '\u65e0\u6743\u9650' });
    const users = db.prepare("SELECT id, name, health_cert_url, health_cert_expiry, health_cert_verified FROM users WHERE health_cert_expiry != '' AND health_cert_expiry IS NOT NULL").all() as any[];
    const results = users.map((u: any) => {
      const exp = new Date(u.health_cert_expiry);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return { ...u, daysLeft, status: daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'warning' : 'valid' };
    });
    res.json({ results });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;