import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..', '..');

// 阿里云 OCR 配置管理
// 优先级: 环境变量 > data/aliyun-credentials.json 文件
// 安全规则: 密钥不出现在日志、错误信息、API 响应中

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
      const cred = JSON.parse(raw);
      if (cred.accessKeyId && cred.accessKeySecret) {
        return {
          accessKeyId: cred.accessKeyId,
          accessKeySecret: cred.accessKeySecret,
          endpoint: cred.endpoint || 'ocr-api.cn-hangzhou.aliyuncs.com',
          regionId: cred.regionId || 'cn-shanghai',
        };
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
  writeFileSync(credPath, JSON.stringify(cred, null, 2), 'utf-8');
  _config = cred;
  console.log('[OCR] Aliyun credentials saved');
}

export function reloadAliyunOCRConfig(): void {
  _config = null;
  getAliyunOCRConfig();
}
