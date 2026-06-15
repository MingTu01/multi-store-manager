import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');
import { join } from 'path';
import { existsSync, mkdirSync, renameSync } from 'fs';
import multer from 'multer';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { triggerNotification } from '../notify-trigger.js';

const router = Router();
const upload = multer({ dest: join(BASE_DIR, 'uploads') });

router.post('/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '\u8bf7\u9009\u62e9\u6587\u4ef6' });
    const ext = file.originalname.split('.').pop() || 'jpg';
    const newName = 'health_' + req.user.id + '_' + Date.now() + '.' + ext;
    const destDir = join(BASE_DIR, 'uploads');
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    renameSync(file.path, join(destDir, newName));
    res.json({ url: '/uploads/' + newName, filename: newName });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/ocr', async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '\u8bf7\u63d0\u4f9b\u56fe\u7247\u8def\u5f84' });
    const imagePath = join(BASE_DIR, url.replace(/^\//, ''));
    if (!existsSync(imagePath)) return res.status(404).json({ error: '\u56fe\u7247\u4e0d\u5b58\u5728' });

    const { createWorker } = await import('tesseract.js');
    // OCR with 60s timeout
    let text = '';
    try {
      const worker = await createWorker('chi_sim');
      const ocrPromise = worker.recognize(imagePath).then(r => r.data.text);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR识别超时')), 60000));
      text = await Promise.race([ocrPromise, timeoutPromise]) as string;
      await worker.terminate();
    } catch (ocrErr: any) {
      return res.status(500).json({ error: ocrErr.message || 'OCR识别失败' });
    }

    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    let ocrName = '';
    let ocrExpiry = '';

    // 清洗：去标点、压缩空格、去除中文字符间空格
    const cleaned = lines.join(' ')
      .replace(/[。.,，、""''「」【】\(\)\[\]]/g, '')
      .replace(/(\s+)/g, ' ')
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2')
      .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');

    // 姓名提取
    const nameMatch = cleaned.match(/姓\s*名\s*[:：]?\s*([^性别身证年月日体检发机有至期关效]{2,4})/);
    if (nameMatch) { ocrName = nameMatch[1]; }
    if (!ocrName) {
      for (const line of lines) {
        const nm = line.replace(/\s+/g, '').match(/姓名[:：]?([\u4e00-\u9fff]{2,4})/);
        if (nm) { ocrName = nm[1]; break; }
      }
    }

    // 日期提取（修正常见OCR误识别）
    const dateText = cleaned
      .replace(/\s+/g, '')
      .replace(/户/g, '月').replace(/扩/g, '日').replace(/目/g, '月');
    const dateMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
    if (dateMatch) {
      ocrExpiry = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
    }
    if (!ocrExpiry) {
      const looseText = cleaned.replace(/户/g, '月').replace(/扩/g, '日');
      const dm = looseText.match(/(\d{4})\s*年\s*(\d{1,2})\s*[月户]\s*(\d{1,2})\s*[日扩]?/);
      if (dm) { ocrExpiry = dm[1] + '-' + dm[2].padStart(2, '0') + '-' + dm[3].padStart(2, '0'); }
    }

    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id) as any;
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
        // Require: all chars match except 1 (for names >= 3 chars)
        if (ocrName.length <= 3) { match = sameCount === ocrName.length; } else { match = sameCount >= ocrName.length - 1; }
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
    // expiry 已经是有效期（前端已计算+1年），不再重复计算
    const realExpiry = expiry || '';
    if (realExpiry) {
      const exp = new Date(realExpiry);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) {
        triggerNotification({ type: 'health_cert', action: '健康证已过期', targetUserId: req.user.id, detail: '已过期' + Math.abs(daysLeft) + '天，请立即处理' , operatorName: req.user.name || req.user.username});
      } else if (daysLeft <= 30) {
        triggerNotification({ type: 'health_cert', action: '健康证即将到期', targetUserId: req.user.id, detail: '还剩' + daysLeft + '天到期，请尽快体检' , operatorName: req.user.name || req.user.username});
      }
    }
    res.json({ message: '健康证信息已保存' });
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