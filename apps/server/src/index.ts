process.env.TZ = 'Asia/Shanghai';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
import { initPush } from './push-notify.js';
import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import db from './db.js';
import { authMiddleware } from './auth.js';
import authRouter from './routes/auth.js';
import storesRouter from './routes/stores.js';
import entriesRouter from './routes/entries.js';
import categoriesRouter from './routes/categories.js';
import reportRouter from './routes/report.js';
import notificationsRouter from './routes/notifications.js';
import usersRouter from './routes/users.js';
import inventoryRouter from './routes/inventory.js';
import handoversRouter from './routes/handovers.js';
import shiftsRouter from './routes/shifts.js';
import dividendsRouter from './routes/dividends.js';
import payrollRouter from './routes/payroll.js';
import systemRouter from './routes/system.js';
import logsRouter from './routes/logs.js';
import reportsRouter from './routes/reports.js';
import dashboardRouter from './routes/dashboard.js';
import healthCertRouter from './routes/health-cert.js';
import purchaseRouter from './routes/purchase.js';
import uploadRouter from './routes/upload.js';
import { startHealthCheckScheduler } from './health-check-scheduler.js';
import { requireStoreAccess } from './middleware/store-access.js';
import { sendNotification, getSettings, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder } from './notify.js';

import { eventBus } from './event-bus.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// S7: CORS 配置
// 未设置 CORS_ORIGIN 时默认使用生产域名
const corsOrigin = process.env.CORS_ORIGIN || '';
const corsOptions: cors.CorsOptions = {
  origin: corsOrigin
    ? corsOrigin.split(',').map(s => s.trim())
    : true,
  credentials: true  // Always allow credentials for httpOnly cookie auth
};
app.use(compression({ level: 6, threshold: 1024 }));
// 安全HTTP头
app.use((req, res, next) => {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // 防止信息泄露
  res.removeHeader('X-Powered-By');
  // CSP - 允许内联样式（Tailwind需要），禁止外部脚本
  // 生成请求级别的 CSP nonce
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-${nonce}'`,  // unsafe-inline 作为 fallback
    "style-src 'self' 'unsafe-inline'",  // Tailwind 需要
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  // Referrer策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions-Policy - 限制浏览器API
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Cross-Origin 安全头
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

app.use(cors(corsOptions));

// P5: JSON body 大小限制可配置，默认从 50MB 降到 5MB
const jsonLimit = process.env.JSON_LIMIT || '5mb';
app.use(express.json({ limit: jsonLimit }));

// Security: Global rate limit - 100 requests per minute per IP for API routes
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: false,
  legacyHeaders: false,
  message: '请求过于频繁，请稍后重试',
  skip: (req) => {
    // Skip rate limiting for non-API routes (static files, SPA)
    if (!req.path.startsWith('/api/')) return true;
    // Skip SSE connections (long-lived, only heartbeat traffic)
    if (req.path === '/api/sse') return true;
    return false;
  }
});
app.use(globalLimiter);

// Smart path detection for web dist
const POSSIBLE_WEB_DIST = [
  join(BASE_DIR, 'public', 'web-dist'),
  join(BASE_DIR, '..', 'public', 'web-dist'),
  join(BASE_DIR, '..', 'apps', 'server', 'public', 'web-dist'),
  join(BASE_DIR, 'web', 'dist'),
  join(BASE_DIR, '..', 'web', 'dist'),
  join(BASE_DIR, '..', '..', 'web', 'dist'),
  join(BASE_DIR, '..', '..', 'apps', 'web', 'dist'),
  join('/app', 'public', 'web-dist'),
  join('/app', 'apps', 'web', 'dist'),
];
const WEB_DIST_PATH = POSSIBLE_WEB_DIST.find(p => existsSync(join(p, 'index.html'))) || POSSIBLE_WEB_DIST[0];
console.log('[PATH] Web dist:', WEB_DIST_PATH); console.log('[PATH] BASE_DIR:', BASE_DIR); console.log('[PATH] index.html content ref:', require('fs').readFileSync(require('path').join(WEB_DIST_PATH, 'index.html'), 'utf8').match(/index-[A-Za-z0-9_-]+\.js/)?.[0] || 'NONE');

app.use(express.static(WEB_DIST_PATH, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (path.match(/\.(js|css|woff2?|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (path.match(/\.(png|jpe?g|gif|svg|webp|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      }
    }
  }));
app.use(express.static(join(BASE_DIR, 'public')));
// File serving - UUID filenames provide security (no auth needed for display)
app.use('/uploads', authMiddleware, express.static(join(BASE_DIR, 'uploads'), { maxAge: '30d', etag: true }));

// Public auth routes

// Health check (no auth)
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', ts: Date.now() }); });

// SSE - Server-Sent Events for real-time data push
app.get('/api/sse', authMiddleware, (req, res) => {
  const userId = (req as any).user?.id || 0;
  // Close existing connections for this user (limit 1 per user)
  eventBus.closeUserConnections(userId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const role = (req as any).user?.role || 'STAFF';
  const storeId = (req as any).user?.store_id || null;
  const clientId = eventBus.addClient(userId, role, storeId, res);
  // 连接数超限（每用户最多3个）
  if (!clientId) {
    res.status(429).json({ error: 'SSE 连接数超限，请稍后重试' });
    return;
  }

  const heartbeat = setInterval(() => {
    try { res.write('data: {"type":"heartbeat","ts":' + Date.now() + '}\n\n'); } catch {}
  }, 15000);

  res.write('data: {"type":"connected","ts":' + Date.now() + '}\n\n');

  req.on('close', () => { clearInterval(heartbeat); eventBus.removeClient(clientId); });
});

// Export eventBus for use in routes
export { eventBus };

app.use('/api/auth', authRouter);

// Protected routes — 带门店访问控制
app.use('/api/stores', authMiddleware, storesRouter);
app.use('/api/stores/:storeId/entries', authMiddleware, requireStoreAccess, entriesRouter);
app.use('/api/stores/:storeId/categories', authMiddleware, requireStoreAccess, categoriesRouter);
app.use('/api/stores/:storeId/inventory', authMiddleware, requireStoreAccess, inventoryRouter);
app.use('/api/stores/:storeId/handovers', authMiddleware, requireStoreAccess, handoversRouter);
app.use('/api/stores/:storeId/shifts', authMiddleware, requireStoreAccess, shiftsRouter);
app.use('/api/stores/:storeId/dividends', authMiddleware, requireStoreAccess, dividendsRouter);
app.use('/api/stores/:storeId/payrolls', authMiddleware, requireStoreAccess, payrollRouter);
app.use('/api/stores/:storeId/report', authMiddleware, requireStoreAccess, reportRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/system', authMiddleware, systemRouter);
app.use('/api/logs', authMiddleware, logsRouter);
// S6: 报表接口加认证
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
startHealthCheckScheduler();
app.use('/api/health-cert', authMiddleware, healthCertRouter);
app.use('/api/stores/:storeId/purchase', authMiddleware, requireStoreAccess, purchaseRouter);
app.use('/api/upload', authMiddleware, uploadRouter);

// Auto backup scheduler
function setupAutoBackup() {
  setInterval(() => {
    try {
      const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
      if (!existsSync(configPath)) return;
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!config.enabled) return;

      const now = new Date();
      const lastKey = 'lastBackup_' + config.interval;
      const lastStr = config[lastKey];
      if (lastStr) {
        const last = new Date(lastStr);
        const diff = now.getTime() - last.getTime();
        const intervalMs = config.interval === 'hourly' ? 3600000 : config.interval === 'daily' ? 86400000 : 604800000;
        if (diff < intervalMs) return;
      }

      const backupDir = join(BASE_DIR, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'auto-backup-' + config.interval + '-' + ts + '.db';
      // Q8: 备份前执行 WAL checkpoint
      db.pragma('wal_checkpoint(TRUNCATE)');
      copyFileSync(join(BASE_DIR, 'data', 'store.db'), join(backupDir, filename));

      config[lastKey] = now.toISOString();
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const files = readdirSync(backupDir).filter(f => f.startsWith('auto-backup-')).sort();
      while (files.length > 30) { const old = files.shift()!; unlinkSync(join(backupDir, old)); }

      console.log('Auto backup created:', filename);
    } catch (err) { console.error('Auto backup error:', err); }
  }, 300000);
}

// Notification cron
function setupCron() {
  setInterval(() => {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes(), day = now.getDay();
    if (h === 22 && m === 0) {
      const s = getSettings();
      if (s.push_daily_report) sendNotification('每日营业简报', buildDailyReport()).catch(console.error);
    }
    if (day === 1 && h === 9 && m === 0) {
      const s = getSettings();
      if (s.push_weekly_report) sendNotification('每周周报', buildWeeklyReport()).catch(console.error);
    }
    if (now.getDate() === 1 && h === 9 && m === 0) {
      const s = getSettings();
      if (s.push_monthly_report) sendNotification('月度报告', buildMonthlyReport()).catch(console.error);
    }
    if (h === 9 && m === 0) {
      const s = getSettings();
      if (s.push_review_reminder) sendNotification('待审核提醒', buildReviewReminder()).catch(console.error);
    }
  }, 60000);
}

setupAutoBackup();
setupCron();



app.get('{*splat}', (req, res) => {
  if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) return res.status(404).send('Not found');
  res.sendFile(join(WEB_DIST_PATH, 'index.html'));
});

// Prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error('[FATAL] Stack:', err.stack);
  process.exit(1); // 让 Docker restart:always 自动重启
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.path}:`, err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制 (最大5MB)' });
  }
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: isProd ? '服务器内部错误' : (err.message || '服务器内部错误') });
});


// Handle SIGTERM/SIGINT for Docker restart
process.on('SIGTERM', () => {
  console.log('[Signal] Received SIGTERM, shutting down...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[Signal] Received SIGINT, shutting down...');
  process.exit(0);
});

// --- Startup banner ---
function printStartupBanner() {
  const ver = (() => { try { return JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf8')).version; } catch { return '?'; } })();
  const sep = '========================================';
  console.log('');
  console.log(sep);
  console.log('  MSL Server Starting...');
  console.log('  Version:  v' + ver);
  console.log('  Node:     ' + process.version);
  console.log('  TZ:       ' + (process.env.TZ || 'not set'));
  console.log('  ENV:      ' + (process.env.NODE_ENV || 'development'));
  console.log('  PORT:     ' + PORT);
  console.log('  CORS:     ' + (corsOrigin || '* (dynamic)'));
  console.log('  Time:     ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
  console.log(sep);
  console.log('');
  console.log('[PATH] Web dist: ' + WEB_DIST_PATH);
  console.log('[PATH] BASE_DIR: ' + BASE_DIR);
  try {
    const html = readFileSync(join(WEB_DIST_PATH, 'index.html'), 'utf8');
    const match = html.match(/index-[A-Za-z0-9_-]+\.js/);
    console.log('[PATH] index.html content ref: ' + (match ? match[0] : 'NONE'));
  } catch { console.log('[PATH] index.html: NOT FOUND'); }
  try {
    const stats = {
      users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      stores: db.prepare('SELECT COUNT(*) as c FROM stores').get().c,
      entries: db.prepare('SELECT COUNT(*) as c FROM entries').get().c,
    };
    console.log('[DB] Users: ' + stats.users + '  Stores: ' + stats.stores + '  Entries: ' + stats.entries);
    try {
      const s = statSync(join(BASE_DIR, 'data', 'store.db'));
      console.log('[DB] Size: ' + (s.size < 1048576 ? (s.size / 1024).toFixed(1) + ' KB' : (s.size / 1048576).toFixed(2) + ' MB'));
    } catch {}
    try {
      const walPath = join(BASE_DIR, 'data', 'store.db-wal');
      if (existsSync(walPath)) {
        const ws = statSync(walPath);
        console.log('[DB] WAL: ' + (ws.size < 1048576 ? (ws.size / 1024).toFixed(1) + ' KB' : (ws.size / 1048576).toFixed(2) + ' MB'));
      }
    } catch {}
  } catch (e) { console.log('[DB] Stats unavailable: ' + (e as Error).message); }
  try {
    const jwtFile = join(BASE_DIR, 'data', 'jwt-secret');
    if (existsSync(jwtFile)) {
      const secret = readFileSync(jwtFile, 'utf8').trim();
      console.log('[AUTH] JWT Secret: loaded (' + secret.length + ' chars)');
    } else {
      console.log('[AUTH] JWT Secret: using env var' + (process.env.JWT_SECRET ? ' (set)' : ' (NOT SET)'));
    }
  } catch {}
  try {
    const backupDir = join(BASE_DIR, 'backups');
    if (existsSync(backupDir)) {
      const files = readdirSync(backupDir).filter((f: string) => f.endsWith('.zip') || f.endsWith('.db'));
      console.log('[BACKUP] ' + files.length + ' backup(s) available');
    }
  } catch {}
  console.log('');
}

printStartupBanner();

initPush();
app.listen(PORT, '0.0.0.0', () => {
  console.log('[SERVER] Listening on http://0.0.0.0:' + PORT);
  console.log('[SERVER] Ready to accept connections');
  console.log('');
  setTimeout(() => {
    try {
      eventBus.broadcastSystem('server-ready');
      console.log('[SSE] Broadcasted server-ready');
    } catch (e) { console.log('[SSE] server-ready broadcast skipped:', (e as Error).message); }
  }, 5000);
})
  .on('error', (err: any) => {
    if (err.code === 'EACCES') {
      console.error('端口 ' + PORT + ' 无权限，请尝试其他端口: PORT=3000 node --import tsx src/index.ts');
    } else {
      console.error('服务器启动失败:', err.message);
    }
    process.exit(1);
  });
