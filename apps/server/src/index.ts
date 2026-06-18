process.env.TZ = 'Asia/Shanghai';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
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
import uploadRouter from './routes/upload.js';
import { startHealthCheckScheduler } from './health-check-scheduler.js';
import { requireStoreAccess } from './middleware/store-access.js';
import { sendNotification, getSettings, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder } from './notify.js';
import { startReportScheduler } from './report-scheduler.js';
import { eventBus } from './event-bus.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// S7: CORS 可配置，默认 * 向后兼容
// S7: CORS 配置，支持环境变量或动态 Origin 回退（不使用通配符）
const corsOrigin = process.env.CORS_ORIGIN || '';
const corsOptions: cors.CorsOptions = {
  origin: corsOrigin
    ? corsOrigin.split(',').map(s => s.trim())
    : (origin, callback) => {
        if (!origin) console.warn('[CORS] No origin header, allowing request');
        else console.warn('[CORS] Dynamic origin allowed:', origin, '(Set CORS_ORIGIN env for production)');
        callback(null, origin || true);
      },
  credentials: true
};
app.use(compression({ level: 6, threshold: 1024 }));
// 安全HTTP头
app.use((req, res, next) => {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS保护
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // 防止信息泄露
  res.removeHeader('X-Powered-By');
  // CSP - 允许内联样式（Tailwind需要），禁止外部脚本
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'self';"
  );
  // Referrer策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors(corsOptions));

// P5: JSON body 大小限制可配置，默认从 50MB 降到 5MB
const jsonLimit = process.env.JSON_LIMIT || '5mb';
app.use(express.json({ limit: jsonLimit }));

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
console.log('[PATH] Web dist:', WEB_DIST_PATH);

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
app.use('/uploads', express.static(join(BASE_DIR, 'uploads'), { maxAge: '30d', etag: true }));

// Public auth routes

// SSE - Server-Sent Events for real-time data push
app.get('/api/sse', authMiddleware, (req, res) => {
  const userId = (req as any).user?.id || 0;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = eventBus.addClient(userId, res);

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

// 启动健康证到期检查
startReportScheduler();

app.get('{*splat}', (req, res) => {
  if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) return res.status(404).send('Not found');
  res.sendFile(join(WEB_DIST_PATH, 'index.html'));
});

// Prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  // Don't exit, keep server running
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.path}:`, err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制 (最大1MB)' });
  }
  res.status(500).json({ error: err.message || '服务器内部错误' });
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

app.listen(PORT, '0.0.0.0', () => console.log('Server running on http://0.0.0.0:' + PORT))
  .on('error', (err: any) => {
    if (err.code === 'EACCES') {
      console.error('端口 ' + PORT + ' 无权限，请尝试其他端口: PORT=3000 node --import tsx src/index.ts');
    } else {
      console.error('服务器启动失败:', err.message);
    }
    process.exit(1);
  });
