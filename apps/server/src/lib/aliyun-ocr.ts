import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { encryptToken, decryptToken } from '../notify.js';
import logger from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');

// 阿里云 OCR 配置管理
// 优先级: 环境变量 > data/aliyun-credentials.json 文件
// 安全规则: 密钥不出现在日志、错误信息、API 响应中
// 凭证文件使用 AES-256-GCM 加密存储（复用 notify.ts 的加密方案）

interface AliyunOCRConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  regionId: string;
}

function loadCredentials(): AliyunOCRConfig {
  if (process.env.ALIYUN_ACCESS_KEY_ID && process.env.ALIYUN_ACCESS_KEY_SECRET) {
    return {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: process.env.ALIYUN_OCR_ENDPOINT || 'ocr-api.cn-hangzhou.aliyuncs.com',
      regionId: process.env.ALIYUN_OCR_REGION || 'cn-shanghai',
    };
  }

  const credPath = join(BASE_DIR, 'data', 'aliyun-credentials.json');
  if (existsSync(credPath)) {
    try {
      const raw = readFileSync(credPath, 'utf-8');
      const parsed = JSON.parse(raw);

      // 新格式：带 encrypted 标记的加密文件
      if (parsed.encrypted && parsed.data) {
        const decrypted = decryptToken(parsed.data);
        if (decrypted) {
          const cred = JSON.parse(decrypted);
          if (cred.accessKeyId && cred.accessKeySecret) {
            return {
              accessKeyId: cred.accessKeyId,
              accessKeySecret: cred.accessKeySecret,
              endpoint: cred.endpoint || 'ocr-api.cn-hangzhou.aliyuncs.com',
              regionId: cred.regionId || 'cn-shanghai',
            };
          }
        }
      }

      // 兼容旧格式：明文 JSON 直接读取 → 自动加密迁移
      if (parsed.accessKeyId && parsed.accessKeySecret) {
        const result: AliyunOCRConfig = {
          accessKeyId: parsed.accessKeyId,
          accessKeySecret: parsed.accessKeySecret,
          endpoint: parsed.endpoint || 'ocr-api.cn-hangzhou.aliyuncs.com',
          regionId: parsed.regionId || 'cn-shanghai',
        };
        // 后台自动迁移为加密格式
        try {
          const dataDir = join(BASE_DIR, 'data');
          if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
          const encrypted = encryptToken(JSON.stringify(parsed));
          writeFileSync(credPath, JSON.stringify({ encrypted: true, data: encrypted }, null, 2), 'utf-8');
          logger.info('[OCR] 已自动将明文凭证迁移为加密存储');
        } catch (migErr) {
          logger.warn('[OCR] 凭证加密迁移失败，继续使用明文:', (migErr as Error).message);
        }
        return result;
      }
    } catch {}
  }

  return { accessKeyId: '', accessKeySecret: '', endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com', regionId: 'cn-hangzhou' };
}

let _config: AliyunOCRConfig | null = null;

export function getAliyunOCRConfig(): AliyunOCRConfig {
  if (!_config) _config = loadCredentials();
  return _config;
}

export function isAliyunOCRConfigured(): boolean {
  const c = getAliyunOCRConfig();
  return !!(c.accessKeyId && c.accessKeySecret);
}

export function saveAliyunCredentials(accessKeyId: string, accessKeySecret: string, endpoint?: string, regionId?: string): void {
  const dataDir = join(BASE_DIR, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const credPath = join(dataDir, 'aliyun-credentials.json');
  const cred = {
    accessKeyId,
    accessKeySecret,
    endpoint: endpoint || 'ocr-api.cn-hangzhou.aliyuncs.com',
    regionId: regionId || 'cn-shanghai',
  };
  // 加密存储凭证
  const encrypted = encryptToken(JSON.stringify(cred));
  writeFileSync(credPath, JSON.stringify({ encrypted: true, data: encrypted }, null, 2), 'utf-8');
  _config = cred;
  logger.info('[OCR] Aliyun credentials saved (encrypted)');
}

export function reloadAliyunOCRConfig(): void {
  _config = null;
  getAliyunOCRConfig();
}
