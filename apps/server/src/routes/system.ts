import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { join } from 'path';
const BASE_DIR = join(__dirname, '..', '..');
import { exec } from 'child_process';
import { readdirSync, statSync, unlinkSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync } from 'fs';
import os from 'os';
import multer from 'multer';
import AdmZip from 'adm-zip';
import db from '../db.js';
import { isAdmin, isStoreAdmin } from '../lib/roles.js';
import { AuthRequest } from '../auth.js';
import { getSettings, sendNotification, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder, buildAlert } from '../notify.js';
import { safePath } from '../middleware/store-access.js';

const router = Router();
const upload = multer({ dest: join(BASE_DIR, 'uploads') });

// SSE clients for upgrade progress
const sseClients: Set<Response> = new Set();
let upgradeState = { step: 0, message: '', complete: false };

function broadcastProgress(event: string, data: any) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// SSE endpoint for upgrade progress streaming
router.get('/upgrade-progress', (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
});

// S30: 系统信息 — 仅 ADMIN
router.get('/info', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    const storeCount = (db.prepare('SELECT COUNT(*) as count FROM stores').get() as any).count;
    const entryCount = (db.prepare('SELECT COUNT(*) as count FROM entries').get() as any).count;
    const dbSize = existsSync(join(BASE_DIR, 'data', 'store.db')) ? statSync(join(BASE_DIR, 'data', 'store.db')).size : 0;
    const cpus = os.cpus();
    const cpuUsage = cpus.length > 0 ? Math.round(cpus.reduce((s: number, c: any) => s + (c.times.user + c.times.nice + c.times.sys + c.times.irq) / (c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle) * 100, 0) / cpus.length) : 0;
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    let version = '1.0.0';
    try { version = JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch {}
    res.json({ version, userCount, storeCount, entryCount, dbSize: (dbSize / 1024 / 1024).toFixed(2) + ' MB', uptime: process.uptime(), cpu: cpuUsage + '%', memory: Math.round(usedMem / 1048576) + ' / ' + Math.round(totalMem / 1048576) + ' MB', nodeVersion: process.version });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9: 备份 — 仅 ADMIN
router.post('/backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const backupDir = join(BASE_DIR, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'manual-' + now + '.zip';
    console.log('[Update] Running WAL checkpoint...'); db.pragma('wal_checkpoint(TRUNCATE)'); console.log('[Update] WAL checkpoint done');
    const dbDir = join(BASE_DIR, 'data');
    const zipPath = join(backupDir, filename);
    const zip = new AdmZip();
    zip.addLocalFile(join(dbDir, 'store.db'), '', 'store.db');
    if (existsSync(join(dbDir, 'store.db-wal'))) zip.addLocalFile(join(dbDir, 'store.db-wal'), '', 'store.db-wal');
    if (existsSync(join(dbDir, 'store.db-shm'))) zip.addLocalFile(join(dbDir, 'store.db-shm'), '', 'store.db-shm');
    zip.writeZip(zipPath);
    const size = statSync(zipPath).size;
    res.json({ filename, size: (size / 1024).toFixed(1) + ' KB', message: '备份成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9+3: 备份信息 — ADMIN + 路径安全
router.get('/backup-info/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const stats = statSync(filepath);
    res.json({ filename: req.params.filename, size: (stats.size / 1024).toFixed(1) + ' KB', sizeBytes: stats.size, date: stats.mtime.toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9: 备份列表 — ADMIN
router.get('/backups', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const backupDir = join(BASE_DIR, 'backups');
    if (!existsSync(backupDir)) return res.json({ backups: [] });
    const files = readdirSync(backupDir).filter(f => f.endsWith('.zip') || f.endsWith('.db')).map(f => {
      const stats = statSync(join(backupDir, f));
      return { filename: f, size: (stats.size / 1024).toFixed(1) + ' KB', date: stats.mtime.toISOString() };
    }).sort((a: any, b: any) => b.date.localeCompare(a.date));
    res.json({ backups: files });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9+3: 备份下载 — ADMIN + 路径安全
router.get('/backups/:filename/download', (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
  if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
  res.download(filepath, req.params.filename);
});

// 上传备份 — ADMIN
router.post('/backups/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传备份文件' });
    if (!file.originalname.endsWith('.db') && !file.originalname.endsWith('.zip')) return res.status(400).json({ error: '请上传.db或.zip格式的备份文件' });
    const backupDir = join(BASE_DIR, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = file.originalname.split('.').pop() || 'db';
    const filename = 'uploaded-' + now + '.' + ext;
    copyFileSync(file.path, join(backupDir, filename));
    unlinkSync(file.path);
    res.json({ filename, message: '备份上传成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S2: 备份恢复 — ADMIN + 安全脚本生成（JSON.stringify 防注入）+ 路径安全
router.post('/backups/:filename/restore', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const dbDir = join(BASE_DIR, 'data');

    // Step 1: Backup current DB before restore
    try {
      const preBackup = new AdmZip();
      const dbFile = join(dbDir, 'store.db');
      if (existsSync(dbFile)) preBackup.addLocalFile(dbFile, '', 'store.db');
      const walFile = join(dbDir, 'store.db-wal');
      if (existsSync(walFile)) preBackup.addLocalFile(walFile, '', 'store.db-wal');
      const shmFile = join(dbDir, 'store.db-shm');
      if (existsSync(shmFile)) preBackup.addLocalFile(shmFile, '', 'store.db-shm');
      preBackup.writeZip(join(dbDir, '_pre-restore-backup.zip'));
    } catch {}

    // Step 2: Checkpoint WAL and close DB connections gracefully
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}

    // Step 3: Delete old DB files
    try { unlinkSync(join(dbDir, 'store.db')); } catch {}
    try { unlinkSync(join(dbDir, 'store.db-wal')); } catch {}
    try { unlinkSync(join(dbDir, 'store.db-shm')); } catch {}

    // Step 4: Extract backup ZIP
    const zip = new AdmZip(filepath);
    zip.extractAllTo(dbDir, true);

    // Step 5: Verify extracted files exist
    const restoredDb = join(dbDir, 'store.db');
    if (!existsSync(restoredDb)) {
      // Rollback from pre-restore backup
      try {
        const rollback = new AdmZip(join(dbDir, '_pre-restore-backup.zip'));
        rollback.extractAllTo(dbDir, true);
      } catch {}
      return res.status(500).json({ error: '恢复失败：备份文件中未找到数据库' });
    }

    // Step 6: Verify DB is readable
    try {
      const Database = require('better-sqlite3');
      const testDb = new Database(restoredDb, { readonly: true });
      const storeCount = testDb.prepare('SELECT count(*) as c FROM stores').get().c;
      const userCount = testDb.prepare('SELECT count(*) as c FROM users').get().c;
      testDb.close();
      console.log('[Restore] Verified: ' + storeCount + ' stores, ' + userCount + ' users');
    } catch (e: any) {
      console.error('[Restore] DB verification failed:', e.message);
      // Rollback
      try {
        const rollback = new AdmZip(join(dbDir, '_pre-restore-backup.zip'));
        rollback.extractAllTo(dbDir, true);
      } catch {}
      return res.status(500).json({ error: '恢复失败：数据库验证失败 - ' + e.message });
    }

    res.json({ message: '备份恢复成功，服务器即将重启...' });

    // Step 7: Graceful restart
    setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          execSync('taskkill /F /PID ' + process.pid, { windowsHide: true });
        } else {
          process.kill(process.pid, 'SIGTERM');
        }
      } catch {}
      // Fallback: force exit after 2s if SIGTERM didn't work
      setTimeout(() => process.exit(0), 2000);
    }, 500);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9: 删除备份 — ADMIN + 路径安全
router.delete('/backups/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    unlinkSync(filepath);
    res.json({ message: '备份已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 自动备份配置 — ADMIN
router.get('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    if (!existsSync(configPath)) return res.json({ enabled: false, interval: 'daily', keepCount: 30 });
    res.json(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    mkdirSync(join(BASE_DIR, 'data'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ message: '自动备份设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 升级相关 — ADMIN
router.get('/upgrade/stream', (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

router.get('/upgrade/status', (req: AuthRequest, res: Response) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  try { res.json(upgradeState); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/upgrade/validate', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传升级包' });
    let version = '未知';
    try {
      const zip = new AdmZip(file.path);
      const pkgEntry = zip.getEntries().find(e => e.entryName === 'apps/web/package.json') || zip.getEntries().find(e => e.entryName === 'apps/server/package.json') || zip.getEntries().find(e => e.entryName === 'package.json');
      if (pkgEntry) { const pkg = JSON.parse(pkgEntry.getData().toString('utf8')); version = pkg.version || '未知'; }
    } catch (e: any) { return res.status(400).json({ error: '无法解析升级包: ' + e.message }); }
    // Q15: 清理临时文件
    try { unlinkSync(file.path); } catch {}
    res.json({ version, file: file.originalname, valid: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/upgrade', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传升级包' });
    res.json({ message: '升级已开始', status: 'processing' });
    (async () => {
      try {
        // Step 1: Backup database
        upgradeState = { step: 1, message: '正在备份数据', complete: false };
        console.log('[Update] Step 1: Starting backup...'); broadcastProgress('progress', { step: 1, total: 4, message: '正在备份数据' });
        const backupDir = join(BASE_DIR, 'backups');
        mkdirSync(backupDir, { recursive: true });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        db.pragma('wal_checkpoint(TRUNCATE)');
        const preZip = new AdmZip();
        preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db'), '', 'store.db');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-wal'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-wal'), '', 'store.db-wal');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-shm'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-shm'), '', 'store.db-shm');
        console.log('[Update] Creating backup zip...'); preZip.writeZip(join(backupDir, 'pre-upgrade-' + now + '.zip')); console.log('[Update] Backup zip created');
        await new Promise(r => setTimeout(r, 500));
        // Step 2: Extract
        upgradeState = { step: 2, message: '正在解压', complete: false };
        broadcastProgress('progress', { step: 2, total: 4, message: '正在解压' });
        const extractDir = join(BASE_DIR, 'uploads', 'extract-' + Date.now());
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(file.path);
        zip.extractAllTo(extractDir, true);
        await new Promise(r => setTimeout(r, 500));
        console.log('[Upgrade] Step 3: Starting file copy...');
        // Step 3: Update files
        upgradeState = { step: 3, message: '正在更新', complete: false };
        broadcastProgress('progress', { step: 3, total: 4, message: '正在更新' });
        const copyDir = (src, dest) => {
          mkdirSync(dest, { recursive: true });
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            if (entry.isDirectory()) copyDir(srcPath, destPath);
            else copyFileSync(srcPath, destPath);
          }
        };
        // 清空目录内容但保留目录本身（Docker volume mount 不能删除挂载点）
        const clearDir = (dir) => {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) rmSync(fullPath, { recursive: true, force: true });
            else { try { unlinkSync(fullPath); } catch {} }
          }
        };
        // --- 清理清单机制 ---
        const cleanupJsonPath = join(extractDir, 'cleanup.json');
        if (existsSync(cleanupJsonPath)) {
          try {
            const cleanup = JSON.parse(readFileSync(cleanupJsonPath, 'utf-8'));
            console.log('[Upgrade] Processing cleanup.json:', cleanup.description || 'no description');
            if (Array.isArray(cleanup.deleteFiles)) {
              for (const f of cleanup.deleteFiles) {
                const target = join(BASE_DIR, f);
                if (existsSync(target)) {
                  try { unlinkSync(target); console.log('[Upgrade] Deleted file:', f); } catch (e) { console.warn('[Upgrade] Failed to delete', f, e.message); }
                }
              }
            }
            if (Array.isArray(cleanup.deleteDirs)) {
              for (const d of cleanup.deleteDirs) {
                const target = join(BASE_DIR, d);
                if (existsSync(target)) {
                  try { rmSync(target, { recursive: true, force: true }); console.log('[Upgrade] Deleted dir:', d); } catch (e) { console.warn('[Upgrade] Failed to delete dir', d, e.message); }
                }
              }
            }
            broadcastProgress('progress', { step: 3, total: 4, message: '清理旧文件完成' });
          } catch (e) {
            console.warn('[Upgrade] Failed to process cleanup.json:', e.message);
          }
        }
        // === 更新 web-dist ===
        const webDist = join(extractDir, 'web-dist');
        if (existsSync(webDist)) {
          const webDest = join(BASE_DIR, 'public', 'web-dist');
          if (existsSync(webDest)) clearDir(webDest);
          copyDir(webDist, webDest);
          console.log('[Upgrade] web-dist updated');
        } else {
          broadcastProgress('error', { message: '升级失败: web-dist目录不存在' });
          return;
        }
        // === 更新服务端代码 ===
        const serverSrc = join(extractDir, 'server-src');
        if (!existsSync(serverSrc)) {
          broadcastProgress('error', { message: '升级失败: server-src目录不存在' });
          return;
        }
        const srcDest = join(BASE_DIR, 'src');
        clearDir(srcDest);
        copyDir(serverSrc, srcDest);
        console.log('[Upgrade] server-src updated');
        // === 更新 package.json ===
        const pkgFile = join(extractDir, 'package.json');
        if (existsSync(pkgFile)) {
          copyFileSync(pkgFile, join(BASE_DIR, 'package.json'));
          console.log('[Upgrade] package.json updated');
        }
        // === npm install (失败必须中止升级) ===
        try {
          console.log('[Upgrade] Running npm install...');
          broadcastProgress('progress', { step: 3, total: 4, message: '正在安装依赖' });
          const { execSync } = require('child_process');
          execSync('npm install --omit=dev', { cwd: BASE_DIR, timeout: 300000, stdio: 'pipe' });
          console.log('[Upgrade] npm install completed');
        } catch (e) {
          console.error('[Upgrade] npm install FAILED:', e.message);
          broadcastProgress('error', { message: '依赖安装失败，请检查服务器 npm 环境: ' + e.message });
          return;
        }
        // === 后置脚本 ===
        const postUpgradeScript = join(extractDir, 'post-upgrade.cjs');
        if (existsSync(postUpgradeScript)) {
          try {
            console.log('[Upgrade] Running post-upgrade script...');
            broadcastProgress('progress', { step: 3, total: 4, message: '正在执行后置脚本' });
            const { execSync } = require('child_process');
            execSync('node "' + postUpgradeScript + '"', { cwd: BASE_DIR, timeout: 120000, stdio: 'pipe' });
            console.log('[Upgrade] Post-upgrade script completed');
          } catch (e) {
            console.warn('[Upgrade] Post-upgrade script failed (non-fatal):', e.message);
          }
        }
        // === 更新版本号 ===
        try {
          const pkgPath = [join(extractDir, 'apps', 'web', 'package.json'), join(extractDir, 'apps', 'server', 'package.json'), join(extractDir, 'package.json')].find(p => existsSync(p)) || join(extractDir, 'package.json');
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            writeFileSync(join(BASE_DIR, 'data', 'version.json'), JSON.stringify({ version: pkg.version || '2.0.0' }, null, 2));
          }
        } catch {}
        // 清理临时解压目录
        try { rmSync(extractDir, { recursive: true, force: true }); } catch {}
        console.log('[Upgrade] Step 3: File copy complete, starting step 4...');
        await new Promise(r => setTimeout(r, 500));
        // Step 4: Restart
        upgradeState = { step: 4, message: '重启', complete: false };
        broadcastProgress('progress', { step: 4, total: 4, message: '重启', done: true });
        broadcastProgress('complete', { message: '升级完成' });
        // Auto-restart after upgrade
        setTimeout(() => {
          console.log('[Upgrade] Sending SIGTERM for restart...');
          process.kill(process.pid, 'SIGTERM');
        }, 3000);
      } catch (err: any) {
        broadcastProgress('error', { message: '升级失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 重启 — ADMIN
router.post('/restart', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '正在重启...' });
    setTimeout(() => {
      console.log('[Restart] Sending SIGTERM for restart...');
      process.kill(process.pid, 'SIGTERM');
    }, 500);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
// 通知设置 — ADMIN
router.get('/notification-settings', (req: AuthRequest, res: Response) => {
  if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  try { res.json(getSettings()); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/notification-settings', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const s = getSettings();
    // 字段白名单验证，防止写入非法字段
    const allowedFields = ['pushplus_enabled', 'pushplus_token', 'serverchan_enabled', 'serverchan_key',
      'wecom_enabled', 'wecom_corp_id', 'wecom_agent_id', 'wecom_secret', 'wecom_user_id', 'wecom_proxy_url',
      'report_daily', 'report_weekly', 'report_monthly', 'report_review', 'report_warning'];
    const safeBody: any = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) safeBody[key] = req.body[key];
    }
    Object.assign(s, safeBody);
    const configPath = join(BASE_DIR, 'data', 'notification-settings.json');
    mkdirSync(join(BASE_DIR, 'data'), { recursive: true });
    db.prepare("UPDATE notification_settings SET method=?, pushplus_token=?, serverchan_key=?, wecom_corpid=?, wecom_agentid=?, wecom_secret=?, wecom_userid=?, wecom_proxy_url=?, push_daily_report=?, push_weekly_report=?, push_monthly_report=?, push_review_reminder=?, push_alert=? WHERE id=1").run(
      s.method || 'none', s.pushplus_token || '', s.serverchan_key || '',
      s.wecom_corpid || '', s.wecom_agentid || '', s.wecom_secret || '',
      s.wecom_userid || '', s.wecom_proxy_url || 'https://wx.908521.xyz/',
      s.push_daily_report ? 1 : 0, s.push_weekly_report ? 1 : 0,
      s.push_monthly_report ? 1 : 0, s.push_review_reminder ? 1 : 0,
      s.push_alert ? 1 : 0
    )
    res.json({ message: '通知设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/notification-settings/test', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const type = req.query.type as string || 'daily';
    (() => {
      let title = '测试通知'; let content = '这是一条测试通知消息\n发送时间: ' + new Date().toLocaleString('zh-CN');
      if (type === 'daily') { title = '每日简报'; content = buildDailyReport(); }
      else if (type === 'weekly') { title = '每周简报'; content = buildWeeklyReport(); }
      else if (type === 'monthly') { title = '月度报告'; content = buildMonthlyReport(); }
      else if (type === 'review') { title = '待审核提醒'; content = buildReviewReminder(); }
      else if (type === 'alert') { title = '系统告警'; content = buildAlert('测试告警信息'); }
      return sendNotification(title, content, type);
    })()
      .then(() => res.json({ message: '测试通知已发送' }))
      .catch((err: any) => res.status(500).json({ error: '发送失败: ' + err.message }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// Cleanup upgrade files
router.post('/upgrade/cleanup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });

    const uploadsDir = join(BASE_DIR, 'uploads');
    if (existsSync(uploadsDir)) {
      const items = readdirSync(uploadsDir);
      for (const item of items) {
        if (item.startsWith('extract-')) {
          const extractPath = join(uploadsDir, item);
          try {
            rmSync(extractPath, { recursive: true, force: true });
            console.log('[Cleanup] Removed:', item);
          } catch (e) { console.error('[Cleanup] Failed to remove:', item, e); }
        }
      }
    }
    res.json({ message: '清理完成' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});


// Version comparison utilities
const parseVersion = (v: string) => v.replace(/^v/, '').split('.').map(Number);
const compareVersions = (v1: string, v2: string): number => {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
};
const getVersionDiff = (current: string, target: string) => {
  const c = parseVersion(current);
  const t = parseVersion(target);
  return {
    major: t[0] - c[0],
    minor: t[1] - c[1],
    patch: t[2] - c[2],
    totalMinor: (t[0] - c[0]) * 100 + (t[1] - c[1])
  };
};
// Maximum supported minor version jump
const MAX_MINOR_JUMP = 5;

// GitHub Proxy mirrors for China
const GITHUB_PROXIES = ['https://ghfast.top/', 'https://gh-proxy.com/'];
const DEPLOY_REPO = 'MingTu01/multi-shop-link-deploy';

async function fetchWithProxy(url: string, opts?: any): Promise<Response | null> {
  for (const proxy of GITHUB_PROXIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(proxy + url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
    } catch {}
  }
  // Try direct
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return res;
  } catch {}
  return null;
}

// Check for updates
// Check for updates
router.get('/check-update', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    
    // Get current version
    let currentVersion = '1.0.0';
    try { currentVersion = JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch {}
    
    // Get latest version from deploy repo
    const versionUrl = 'https://raw.githubusercontent.com/' + DEPLOY_REPO + '/main/data/version.json';
    const versionRes = await fetchWithProxy(versionUrl);
    if (!versionRes) return res.json({ currentVersion, latestVersion: null, error: '无法连接到更新服务器' });
    
    const latestData = await versionRes.json();
    const latestVersion = latestData.version;
    
    // Compare versions using utility functions
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;
    
    // Version compatibility check
    const diff = getVersionDiff(currentVersion, latestVersion);
    const isCompatible = diff.totalMinor <= MAX_MINOR_JUMP;
    let upgradePath = [];
    let warning = '';
    
    if (hasUpdate && !isCompatible) {
      // Generate intermediate upgrade path
      const currentParts = parseVersion(currentVersion);
      const latestParts = parseVersion(latestVersion);
      let stepMajor = currentParts[0];
      let stepMinor = currentParts[1];
      
      while (stepMajor < latestParts[0] || (stepMajor === latestParts[0] && stepMinor < latestParts[1])) {
        stepMinor += MAX_MINOR_JUMP;
        if (stepMinor > 99) {
          stepMajor++;
          stepMinor = stepMinor - 100;
        }
        const stepVersion = stepMajor + '.' + stepMinor + '.0';
        upgradePath.push('v' + stepVersion);
      }
      upgradePath.push('v' + latestVersion);
      
      warning = '当前版本与目标版本差距过大（跨越 ' + diff.totalMinor + ' 个次版本），建议分步升级以确保数据安全';
    }
    
    res.json({
      currentVersion,
      latestVersion,
      hasUpdate,
      compatibility: {
        isCompatible,
        diff,
        maxMinorJump: MAX_MINOR_JUMP,
        upgradePath,
        warning
      }
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Execute update
router.post('/do-update', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '更新已开始..' });
    
    (async () => {
      try {
        console.log('[Update] Async function started');
        console.log('[Update] BASE_DIR:', BASE_DIR);
        
        // Step 1: Backup
        broadcastProgress('progress', { step: 1, total: 4, message: '正在备份数据' });
        const backupDir = join(BASE_DIR, 'backups');
        mkdirSync(backupDir, { recursive: true });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        try {
          db.pragma('wal_checkpoint(TRUNCATE)');
          const preZip = new AdmZip();
          preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db'), '', 'store.db');
          if (existsSync(join(BASE_DIR, 'data', 'store.db-wal'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-wal'), '', 'store.db-wal');
          if (existsSync(join(BASE_DIR, 'data', 'store.db-shm'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-shm'), '', 'store.db-shm');
          preZip.writeZip(join(backupDir, 'pre-upgrade-' + now + '.zip'));
        } catch (backupErr) { console.error('[Update] Backup error:', backupErr.message); }
        broadcastProgress('progress', { step: 1, total: 4, message: '数据库备份完成', done: true });
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 2: Download
        broadcastProgress('progress', { step: 2, total: 4, message: '正在下载更新' });
        const zipUrl = 'https://github.com/' + DEPLOY_REPO + '/archive/refs/heads/main.zip';
        const zipRes = await fetchWithProxy(zipUrl);
        if (!zipRes) throw new Error('无法下载更新包');
        const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
        broadcastProgress('progress', { step: 2, total: 4, message: '下载完成', done: true });
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 3: Extract & Update
        broadcastProgress('progress', { step: 3, total: 4, message: '正在更新' });
        const extractDir = join(BASE_DIR, 'uploads', 'extract-' + now);
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(zipBuffer);
        zip.extractAllTo(extractDir, true);
        const extractedFolder = join(extractDir, 'multi-shop-link-deploy-main');
        
        // --- cleanup.json 清理清单 ---
        const cleanupJsonPath = join(extractedFolder, 'cleanup.json');
        if (existsSync(cleanupJsonPath)) {
          try {
            const cleanup = JSON.parse(readFileSync(cleanupJsonPath, 'utf-8'));
            console.log('[Update] Processing cleanup.json:', cleanup.description || '');
            if (Array.isArray(cleanup.deleteFiles)) {
              for (const f of cleanup.deleteFiles) {
                const target = join(BASE_DIR, f);
                if (existsSync(target)) {
                  try { unlinkSync(target); console.log('[Update] Deleted:', f); } catch (e: any) { console.warn('[Update] Failed to delete', f, e.message); }
                }
              }
            }
            if (Array.isArray(cleanup.deleteDirs)) {
              for (const d of cleanup.deleteDirs) {
                const target = join(BASE_DIR, d);
                if (existsSync(target)) {
                  try { rmSync(target, { recursive: true, force: true }); console.log('[Update] Deleted dir:', d); } catch (e: any) { console.warn('[Update] Failed to delete dir', d, e.message); }
                }
              }
            }
          } catch (e: any) { console.warn('[Update] Failed to process cleanup.json:', e.message); }
        }
        
        const publicDir = join(extractedFolder, 'public');
        if (existsSync(publicDir)) {
          const destPublic = join(BASE_DIR, 'public');
          if (existsSync(destPublic)) {
            const webDistDest = join(destPublic, 'web-dist');
            if (existsSync(webDistDest)) clearDir(webDistDest);
          }
          cpSync(publicDir, destPublic, { recursive: true });
          console.log('[Update] web-dist updated');
        }
        // === 更新服务端代码 ===
        const srcDir = join(extractedFolder, 'src');
        if (existsSync(srcDir)) {
          const destSrc = join(BASE_DIR, 'src');
          clearDir(destSrc);
          cpSync(srcDir, destSrc, { recursive: true });
          console.log('[Update] server-src updated');
        }
        const pkgFile = join(extractedFolder, 'package.json');
        if (existsSync(pkgFile)) copyFileSync(pkgFile, join(BASE_DIR, 'package.json'));
        const versionFile = join(extractedFolder, 'data', 'version.json');
        if (existsSync(versionFile)) copyFileSync(versionFile, join(BASE_DIR, 'data', 'version.json'));
        const postUpgradeScript = join(extractedFolder, 'post-upgrade.cjs');
        if (existsSync(postUpgradeScript)) {
          try {
            console.log('[Update] Running post-upgrade script...');
            const { execSync } = require('child_process');
            execSync('node "' + postUpgradeScript + '"', { cwd: BASE_DIR, timeout: 120000, stdio: 'pipe' });
            console.log('[Update] Post-upgrade completed');
          } catch (e) { console.warn('[Update] Post-upgrade failed (non-fatal):', e.message); }
        }
        try { rmSync(extractDir, { recursive: true, force: true }); } catch {}
        broadcastProgress('progress', { step: 3, total: 4, message: '更新完成', done: true });
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 4: Restart
        broadcastProgress('progress', { step: 4, total: 4, message: '正在重启' });
        broadcastProgress('complete', { message: '更新完成' });
        
        setTimeout(() => {
          console.log('[Update] Restarting via process.exit...');
          process.exit(0);
        }, 3000);
        
      } catch (err) {
        console.error('[Update] FAILED:', err.message);
        broadcastProgress('error', { message: '更新失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

