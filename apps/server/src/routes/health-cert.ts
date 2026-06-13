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

    // Merge all lines, clean noise chars for better parsing
    const allText = lines.join(' ').replace(/[。\u201c\u201d"]/g, '').replace(/\s+/g, '');

    // Extract name: pattern like 姓名:XXX or 姓名 : XXX
    const nameMatch = allText.match(/\u59d3\u540d[:：]?([^\u6027\u522b\u8eab\u8bc1\u5e74\u6708\u65e5\u4f53\u68c0\u53d1\u8bc1\u6709\u6548\u81f3\u671f\u673a\u5173]{2,8})[\u6027\u522b\u8eab\u8bc1\u5e74\u6708\u65e5\u4f53\u68c0\u53d1\u8bc1\u6709\u6548\u81f3\u671f\u673a\u5173]/);
    if (nameMatch) {
      ocrName = nameMatch[1].replace(/[^\u4e00-\u9fff]/g, '').slice(0, 4);
    }
    // Fallback: try each line
    if (!ocrName) {
      for (const line of lines) {
        const nm = line.match(/\u59d3\s*\u540d\s*[:：]?\s*([一-鿿]{2,4})/);
        if (nm) { ocrName = nm[1].trim(); break; }
      }
    }

    // Extract date: YYYY年MM月DD日
    const dateMatch = allText.match(/(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5?/);
    if (dateMatch) {
      ocrExpiry = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
    }
    // Fallback: try each line
    if (!ocrExpiry) {
      for (const line of lines) {
        const dm = line.match(/(\d{4})\s*\u5e74\s*(\d{1,2})\s*\u6708\s*(\d{1,2})/);
        if (dm) { ocrExpiry = dm[1] + '-' + dm[2].padStart(2, '0') + '-' + dm[3].padStart(2, '0'); break; }
      }
    }const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id) as any;
    // Fuzzy name matching: exact includes, or 2/3+ char overlap for OCR errors
    let match = false;
    if (ocrName && user?.name) {
      if (ocrName.includes(user.name) || user.name.includes(ocrName)) {
        match = true;
      } else if (ocrName.length === user.name.length) {
        let sameCount = 0;
        for (let i = 0; i < ocrName.length; i++) {
          if (ocrName[i] === user.name[i]) sameCount++;
        }
        match = sameCount >= Math.floor(ocrName.length * 0.6);
      }
    }

    let daysLeft = -1;
    if (ocrExpiry) {
      const exp = new Date(ocrExpiry.replace(/\//g, '-'));
      daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }

    // ocrExpiry is examination date, real expiry is +1 year
    let realExpiryStr = '';
    if (ocrExpiry) {
      const d = new Date(ocrExpiry);
      d.setFullYear(d.getFullYear() + 1);
      realExpiryStr = d.toISOString().slice(0, 10);
    }
    const realDaysLeft = realExpiryStr ? Math.ceil((new Date(realExpiryStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : -1;
    res.json({ ocrName, ocrExpiry, realExpiry: realExpiryStr, accountName: user?.name || '', match, daysLeft: realDaysLeft, rawText: lines.slice(0, 20).join('\n') });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/save', (req: AuthRequest, res: Response) => {
  try {
    const { url, name, expiry, verified } = req.body;
    db.prepare('UPDATE users SET health_cert_url = ?, health_cert_name = ?, health_cert_expiry = ?, health_cert_verified = ? WHERE id = ?')
      .run(url || '', name || '', expiry || '', verified ? 1 : 0, req.user.id);
    // expiry here is actually the examination date, add 1 year for real expiry
    const realExpiry = expiry ? (() => {
      const d = new Date(expiry);
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0, 10);
    })() : '';
    if (realExpiry) {
      db.prepare('UPDATE users SET health_cert_expiry = ? WHERE id = ?').run(realExpiry, req.user.id);
    }
    if (realExpiry) {
      const exp = new Date(realExpiry);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) {
        triggerNotification({ type: 'health_cert', action: '\u5065\u5eb7\u8bc1\u5df2\u8fc7\u671f', targetUserId: req.user.id, detail: '\u5df2\u8fc7\u671f' + Math.abs(daysLeft) + '\u5929\uff0c\u8bf7\u7acb\u5373\u5904\u7406' });
      } else if (daysLeft <= 30) {
        triggerNotification({ type: 'health_cert', action: '\u5065\u5eb7\u8bc1\u5373\u5c06\u5230\u671f', targetUserId: req.user.id, detail: '\u8fd8\u5269' + daysLeft + '\u5929\u5230\u671f\uff0c\u8bf7\u5c3d\u5feb\u4f53\u68c0' });
      }
    }
    res.json({ message: '\u5065\u5eb7\u8bc1\u4fe1\u606f\u5df2\u4fdd\u5b58' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// GET / - 获取当前用户健康证信息
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT health_cert_url, health_cert_name, health_cert_expiry, health_cert_verified FROM users WHERE id = ?').get(req.user.id) as any;
    if (!user || !user.health_cert_url) return res.json({ cert: null });
    res.json({
      cert: {
        url: user.health_cert_url,
        name: user.health_cert_name || '',
        expiry: user.health_cert_expiry || '',
        verified: !!user.health_cert_verified
      }
    });
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