process.env.TZ = 'Asia/Shanghai';
import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync } from 'fs';
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
import healthCertRouter from './routes/health-cert.js';
import reportsRouter from './routes/reports.js';
import dashboardRouter from './routes/dashboard.js';
import { requireStoreAccess } from './middleware/store-access.js';
import { sendNotification, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder, getSettings } from './notify.js';

const app = express();
const PORT = process.env.PORT || 3001;

// S7: CORS 可配置，默认 * 向后兼容
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin === '*' ? '*' : corsOrigin.split(',') }));

// P5: JSON body 大小限制可配置，默认从 50MB 降到 5MB
const jsonLimit = process.env.JSON_LIMIT || '30mb';
app.use(express.json({ limit: jsonLimit }));

app.use(express.static(join(process.cwd(), '..', 'web', 'dist')));
app.use(express.static(join(process.cwd(), 'public')));

// Public auth routes
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
app.use('/api/health-cert', authMiddleware, healthCertRouter);
app.use('/api/logs', authMiddleware, logsRouter);
// S6: 报表接口加认证
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);

// S15: 全局错误处理 — 生产环境隐藏内部错误详情
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : (err.message || '服务器内部错误');
  res.status(500).json({ error: message });
});

// Auto backup scheduler
function setupAutoBackup() {
  setInterval(() => {
    try {
      const configPath = join(process.cwd(), 'data', 'auto-backup.json');
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

      const backupDir = join(process.cwd(), 'backups');
      mkdirSync(backupDir, { recursive: true });
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'auto-backup-' + config.interval + '-' + ts + '.db';
      // Q8: 备份前执行 WAL checkpoint
      db.pragma('wal_checkpoint(TRUNCATE)');
      copyFileSync(join(process.cwd(), 'data', 'store.db'), join(backupDir, filename));

      config[lastKey] = now.toISOString();
      require('fs').writeFileSync(configPath, JSON.stringify(config, null, 2));

      const files = readdirSync(backupDir).filter(f => f.startsWith('auto-backup-')).sort();
      while (files.length > 30) { const old = files.shift()!; require('fs').unlinkSync(join(backupDir, old)); }

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
  res.sendFile(join(process.cwd(), '..', 'web', 'dist', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));
