import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');
import { join, resolve } from 'path';
import { existsSync, mkdirSync, renameSync, readFileSync } from 'fs';
import multer from 'multer';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { isAdmin } from '../lib/roles.js';
import { localDate } from '../lib/utils.js';
import { triggerNotification } from '../notify-trigger.js';
import { getAliyunOCRConfig, isAliyunOCRConfigured, saveAliyunCredentials, reloadAliyunOCRConfig } from '../lib/aliyun-ocr.js';

const router = Router();
const upload = multer({
  dest: join(BASE_DIR, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  }
});

router.post('/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请选择文件' });
    const ext = file.originalname.split('.').pop() || 'jpg';
    const newName = 'health_' + req.user.id + '_' + Date.now() + '.' + ext;
    const destDir = join(BASE_DIR, 'uploads');
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    renameSync(file.path, join(destDir, newName));
    res.json({ url: '/uploads/' + newName, filename: newName });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /ocr - 阿里云 OCR 识别健康证
router.post('/ocr', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAliyunOCRConfigured()) {
      return res.status(400).json({ error: 'OCR 服务未配置，请联系管理员在系统设置中配置阿里云 AccessKey' });
    }

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '请提供图片路径' });
    const imagePath = join(BASE_DIR, url.replace(/^\//, ''));
    // Path traversal protection
    const resolvedPath = resolve(imagePath);
    const uploadsDir = resolve(BASE_DIR, 'uploads');
    if (!resolvedPath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: '无效的文件路径' });
    }
    if (!existsSync(imagePath)) return res.status(404).json({ error: '图片不存在' });

    const config = getAliyunOCRConfig();

    // 动态导入阿里云 OCR SDK
    let OcrClient;
    try {
      const mod = await import('@alicloud/ocr-api20210707');
      OcrClient = mod.default?.default || mod.default || mod;
      var { RecognizeGeneralStructureRequest } = mod;
    } catch (importErr: any) {
      return res.status(500).json({ error: 'OCR SDK 加载失败，请确认已安装 @alicloud/ocr-api20210707' });
    }

    const client = new OcrClient({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      endpoint: config.endpoint,
      regionId: config.regionId,
      readTimeout: 30000,
      connectTimeout: 10000,
    });

    const imageBuffer = readFileSync(imagePath);
    const { Readable } = await import('stream');

    // 调用通用票证抽取 API（结构化 KV 提取，适合健康证）
    let ocrResult: any;
    try {
      const request = new RecognizeGeneralStructureRequest({ body: Readable.from(imageBuffer) });
      ocrResult = await client.recognizeGeneralStructure(request);
    } catch (apiErr: any) {
      const errMsg = apiErr.message || 'OCR 识别失败';
      if (errMsg.includes('AccessKey') || errMsg.includes('InvalidAccessKey')) {
        return res.status(500).json({ error: '阿里云认证失败，请检查 AccessKey 配置' });
      }
      console.error("[OCR] API Error:", errMsg); return res.status(500).json({ error: 'OCR 识别失败: ' + (errMsg.length > 200 ? errMsg.slice(0, 200) + '...' : errMsg) });
    }

    // 解析 OCR 结果 — recognizeGeneralStructure 返回结构化 KV 数据
    const ocrBody = ocrResult?.body || {};
    const ocrData = ocrBody?.data || {};
    const subImages = ocrData?.subImages || [];
    const kvData = subImages[0]?.kvInfo?.data || {};

    let ocrName = kvData['姓名'] || kvData['name'] || kvData['Name'] || '';
    let ocrExpiry = '';

    // 清洗姓名：去掉前导数字、空格、特殊字符
    ocrName = ocrName.replace(/^\d+\s*/, '').replace(/\s+/g, '').trim();

    // 从体检日期字段提取日期（格式：2026年06月04日(有效期一年)）
    const examDateField = kvData['体检日期'] || kvData['有效期'] || kvData['有效日期'] || '';
    if (examDateField) {
      // 匹配：2026年06月04日(有效期一年) 或 2026年06月04日
      const dateMatch = String(examDateField).match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (dateMatch) {
        ocrExpiry = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
      }
    }

    // 兜底：如果没解析到日期，遍历所有 KV 寻找日期格式
    if (!ocrExpiry) {
      for (const [, v] of Object.entries(kvData)) {
        const s = String(v || '');
        const m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
        if (m) {
          ocrExpiry = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
          break;
        }
      }
    }

    // 原始文本用于前端展示
    const rawText = Object.entries(kvData).map(([k, v]) => k + ': ' + v).join('\n');

    // 姓名匹配
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id) as any;
    let match = false;
    if (ocrName && user?.name) {
      if (ocrName.includes(user.name) || user.name.includes(ocrName)) {
        match = true;
      } else if (ocrName.length === user.name.length) {
        let sameCount = 0;
        for (let i = 0; i < ocrName.length; i++) {
          if (ocrName[i] === user.name[i]) sameCount++;
        }
        if (ocrName.length <= 3) { match = sameCount === ocrName.length; } else { match = sameCount >= ocrName.length - 1; }
      }
    }

    // 计算有效期（体检日期 + 1年）
    let realExpiryStr = '';
    if (ocrExpiry) {
      const d = new Date(ocrExpiry);
      d.setFullYear(d.getFullYear() + 1);
      realExpiryStr = localDate(d);
    }
    const realDaysLeft = realExpiryStr ? Math.ceil((new Date(realExpiryStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : -1;

    console.log("[OCR] Parsed: name=[" + ocrName + "] expiry=[" + ocrExpiry + "] kvKeys=" + Object.keys(kvData).join(","));
    res.json({
      ocrName,
      ocrExpiry,
      realExpiry: realExpiryStr,
      accountName: user?.name || '',
      match,
      daysLeft: realDaysLeft,
      rawText: typeof rawText === 'string' ? rawText.slice(0, 500) : '',
      provider: 'aliyun',
    });
  } catch (err: any) {
    console.error('[OCR] Error:', err.message);
    res.status(500).json({ error: 'OCR 识别异常，请稍后重试' });
  }
});

// POST /config - 管理员配置阿里云 OCR 密钥
router.post('/config', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const { accessKeyId, accessKeySecret, endpoint, regionId } = req.body;
    if (!accessKeyId || !accessKeySecret) {
      return res.status(400).json({ error: '请提供 AccessKeyId 和 AccessKeySecret' });
    }
    saveAliyunCredentials(accessKeyId, accessKeySecret, endpoint, regionId);
    res.json({ message: '阿里云 OCR 配置已保存' });
  } catch (err: any) {
    res.status(500).json({ error: '配置保存失败' });
  }
});

// GET /config - 管理员查看 OCR 配置状态（不返回密钥）
router.get('/config', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configured = isAliyunOCRConfigured();
    const config = getAliyunOCRConfig();
    res.json({
      configured,
      endpoint: config.endpoint,
      regionId: config.regionId,
      accessKeyIdHint: configured ? config.accessKeyId.slice(0, 6) + '****' : '',
    });
  } catch (err: any) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

router.put('/save', (req: AuthRequest, res: Response) => {
  try {
    const { url, name, expiry, verified } = req.body;
    if (isAdmin(req.user.role)) {
      db.prepare('UPDATE users SET health_cert_url = ?, health_cert_name = ?, health_cert_expiry = ?, health_cert_verified = ? WHERE id = ?')
        .run(url || '', name || '', expiry || '', verified ? 1 : 0, req.user.id);
    } else {
      db.prepare('UPDATE users SET health_cert_url = ?, health_cert_name = ?, health_cert_expiry = ? WHERE id = ?')
        .run(url || '', name || '', expiry || '', req.user.id);
    }
    const realExpiry = expiry || '';
    if (realExpiry) {
      const exp = new Date(realExpiry);
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 0) {
        triggerNotification({ type: 'health_cert', action: '健康证已过期', targetUserId: req.user.id, detail: '已过期' + Math.abs(daysLeft) + '天，请立即处理', operatorName: req.user.name || req.user.username });
      } else if (daysLeft <= 30) {
        triggerNotification({ type: 'health_cert', action: '健康证即将到期', targetUserId: req.user.id, detail: '还剩' + daysLeft + '天到期，请尽快体检', operatorName: req.user.name || req.user.username });
      }
    }
    res.json({ message: '健康证信息已保存' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

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
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
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
