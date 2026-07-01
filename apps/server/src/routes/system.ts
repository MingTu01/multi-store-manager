import { requireAdmin } from '../middleware/require-role.js';
import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { join } from 'path';
const BASE_DIR = join(__dirname, '..', '..');
import { execFileSync } from 'child_process';
import { readdirSync, statSync, unlinkSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync } from 'fs';
import os from 'os';
import crypto from 'crypto';
import multer from 'multer';
import AdmZip from 'adm-zip';
import db from '../db.js';
import { isAdmin, isStoreAdmin } from '../lib/roles.js';
import { AuthRequest } from '../auth.js';
import { getSettings, sendNotification, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder, buildAlert } from '../notify.js';
import { safePath } from '../middleware/store-access.js';
import { validateWebhookUrlAsync } from '../lib/network.js';


// 安全校验：cleanup.json 路径白名单（CRITICAL安全加固）
function validateCleanupPath(p: string): boolean {
  // 禁止路径遍历
  if (p.includes('..')) return false;
  // 规范化路径分隔符
  const normalized = p.replace(/\\/g, '/').toLowerCase();
  // 禁止指向 data/、backups/、uploads/ 目录
  if (normalized.startsWith('data/') || normalized === 'data') return false;
  if (normalized.startsWith('backups/') || normalized === 'backups') return false;
  if (normalized.startsWith('uploads/') || normalized === 'uploads') return false;
  // 只允许 src/ 和 public/ 下的文件
  if (!normalized.startsWith('src/') && !normalized.startsWith('public/')) return false;
  return true;
}
// 安全替换 web-dist 目录：先拷贝到临时目录，验证后清空旧目录再拷贝（兼容 volume mount）
// 加固版：清理前先备份到 web-dist.bak，全部成功后才删备份；失败自动回滚
function safeReplaceWebDist(newWebDistSrc: string, destWebDist: string): void {
  const tmpDir = join(BASE_DIR, 'public', 'web-dist.tmp.' + Date.now());
  const bakDir = join(BASE_DIR, 'public', 'web-dist.bak.' + Date.now());
  try {
    // 1. 拷贝新文件到临时目录
    mkdirSync(tmpDir, { recursive: true });
    cpSync(newWebDistSrc, tmpDir, { recursive: true, force: true });

    // 2. 验证临时目录有 index.html（确保拷贝完整）
    if (!existsSync(join(tmpDir, 'index.html'))) {
      throw new Error('新 web-dist 缺少 index.html，拷贝不完整');
    }

    // 3. 备份旧 web-dist（用于失败回滚）
    if (existsSync(destWebDist)) {
      cpSync(destWebDist, bakDir, { recursive: true, force: true });
      // 清空旧 web-dist 内容（不删目录本身，兼容 volume mount 挂载点）
      for (const entry of readdirSync(destWebDist, { withFileTypes: true })) {
        const target = join(destWebDist, entry.name);
        try {
          if (entry.isDirectory()) rmSync(target, { recursive: true, force: true });
          else unlinkSync(target);
        } catch (e: any) { logger.warn('[Upgrade] 清理旧 web-dist 文件失败:', entry.name, e.message); }
      }
    } else {
      mkdirSync(destWebDist, { recursive: true });
    }

    // 4. 拷贝新内容到 web-dist
    cpSync(tmpDir, destWebDist, { recursive: true, force: true });

    // 5. 验证拷贝成功
    if (!existsSync(join(destWebDist, 'index.html'))) {
      throw new Error('web-dist 拷贝后验证失败，index.html 不存在');
    }

    // 6. 成功，删除备份
    try { rmSync(bakDir, { recursive: true, force: true }); } catch {}
    logger.info('[Upgrade] web-dist 安全替换成功（旧文件已清理）');
  } catch (err) {
    // 回滚：从备份恢复
    logger.error('[Upgrade] web-dist 替换失败，正在回滚:', (err as Error).message);
    try {
      if (existsSync(bakDir)) {
        for (const entry of readdirSync(destWebDist, { withFileTypes: true })) {
          const target = join(destWebDist, entry.name);
          try {
            if (entry.isDirectory()) rmSync(target, { recursive: true, force: true });
            else unlinkSync(target);
          } catch {}
        }
        cpSync(bakDir, destWebDist, { recursive: true, force: true });
        logger.info('[Upgrade] web-dist 已从备份回滚');
      }
    } catch (e: any) { logger.error('[Upgrade] web-dist 回滚失败:', e.message); }
    throw err;
  } finally {
    try { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { if (existsSync(bakDir)) rmSync(bakDir, { recursive: true, force: true }); } catch {}
  }
}

// 原子替换 src 目录：备份旧 src → 拷贝新 src → 验证 → 失败回滚
function atomicReplaceSrc(newSrcDir: string, destSrc: string): void {
  const bakDir = destSrc + '.bak.' + Date.now();
  const tmpDir = destSrc + '.tmp.' + Date.now();
  try {
    // 1. 拷贝新 src 到临时目录
    mkdirSync(tmpDir, { recursive: true });
    cpSync(newSrcDir, tmpDir, { recursive: true, force: true });

    // 2. 验证关键文件存在（至少要有 index.ts 或 index.js）
    const hasIndex = existsSync(join(tmpDir, 'index.ts')) || existsSync(join(tmpDir, 'index.js'));
    if (!hasIndex) {
      throw new Error('新 src 目录缺少入口文件 index.ts/index.js');
    }

    // 3. 备份旧 src（重命名，原子操作）
    if (existsSync(destSrc)) {
      try { rmSync(bakDir, { recursive: true, force: true }); } catch {}
      cpSync(destSrc, bakDir, { recursive: true, force: true });
      // 清空旧 src
      for (const entry of readdirSync(destSrc, { withFileTypes: true })) {
        const target = join(destSrc, entry.name);
        try {
          if (entry.isDirectory()) rmSync(target, { recursive: true, force: true });
          else unlinkSync(target);
        } catch (e: any) { logger.warn('[Upgrade] 清理旧 src 文件失败:', entry.name, e.message); }
      }
    } else {
      mkdirSync(destSrc, { recursive: true });
    }

    // 4. 拷贝新内容
    cpSync(tmpDir, destSrc, { recursive: true, force: true });

    // 5. 验证
    if (!existsSync(join(destSrc, 'index.ts')) && !existsSync(join(destSrc, 'index.js'))) {
      throw new Error('src 拷贝后验证失败，入口文件不存在');
    }

    // 6. 成功，删备份
    try { rmSync(bakDir, { recursive: true, force: true }); } catch {}
    logger.info('[Upgrade] src 原子替换成功');
  } catch (err) {
    logger.error('[Upgrade] src 替换失败，正在回滚:', (err as Error).message);
    try {
      if (existsSync(bakDir)) {
        for (const entry of readdirSync(destSrc, { withFileTypes: true })) {
          const target = join(destSrc, entry.name);
          try {
            if (entry.isDirectory()) rmSync(target, { recursive: true, force: true });
            else unlinkSync(target);
          } catch {}
        }
        cpSync(bakDir, destSrc, { recursive: true, force: true });
        logger.info('[Upgrade] src 已从备份回滚');
      }
    } catch (e: any) { logger.error('[Upgrade] src 回滚失败:', e.message); }
    throw err;
  } finally {
    try { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { if (existsSync(bakDir)) rmSync(bakDir, { recursive: true, force: true }); } catch {}
  }
}

// 同步 src-seed：升级成功后把最新 src 复制到 /app/src-seed
// 这样容器 down/up 后 entrypoint.js 能从 src-seed 恢复升级后的版本
function syncSrcSeed(srcDir: string): void {
  const seedDir = join(BASE_DIR, 'src-seed');
  try {
    // 读取当前版本号，写入 src-seed/version.json 便于诊断
    let version = '';
    try { version = JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch {}
    // 清空旧 seed
    if (existsSync(seedDir)) {
      for (const entry of readdirSync(seedDir, { withFileTypes: true })) {
        const target = join(seedDir, entry.name);
        try {
          if (entry.isDirectory()) rmSync(target, { recursive: true, force: true });
          else unlinkSync(target);
        } catch (e: any) { logger.warn('[Upgrade] 清理旧 src-seed 失败:', entry.name, e.message); }
      }
    } else {
      mkdirSync(seedDir, { recursive: true });
    }
    // 拷贝最新 src 到 seed
    cpSync(srcDir, seedDir, { recursive: true, force: true });
    // 写入版本标记
    writeFileSync(join(seedDir, 'version.json'), JSON.stringify({ version, syncedAt: new Date().toISOString() }, null, 2));
    logger.info('[Upgrade] src-seed 已同步，版本:', version);
  } catch (e: any) {
    logger.warn('[Upgrade] src-seed 同步失败（非致命，下次容器 down/up 可能回退到镜像版本）:', e.message);
  }
}

// 从备份恢复（用于 npm install 失败等场景）
function restoreFromBackup(backupDir: string): void {
  try {
    // 恢复 src
    const bakSrc = join(backupDir, 'src');
    if (existsSync(bakSrc)) atomicReplaceSrc(bakSrc, join(BASE_DIR, 'src'));
    // 恢复 web-dist
    const bakWebDist = join(backupDir, 'web-dist');
    if (existsSync(bakWebDist)) safeReplaceWebDist(bakWebDist, join(BASE_DIR, 'public', 'web-dist'));
    // 恢复 package.json
    const bakPkg = join(backupDir, 'package.json');
    if (existsSync(bakPkg)) copyFileSync(bakPkg, join(BASE_DIR, 'package.json'));
    logger.info('[Upgrade] 已从备份恢复代码');
  } catch (e: any) {
    logger.error('[Upgrade] 从备份恢复失败:', e.message);
  }
}

// Zip Slip protection: validate all entry names before extraction
function validateZipEntries(zip: any): boolean {
  const entries = zip.getEntries();
  for (const entry of entries) {
    if (entry.entryName.includes('..') || entry.entryName.includes('\x00')) {
      return false;
    }
  }
  return true;
}
const router = Router();
const upload = multer({
  dest: join(BASE_DIR, 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 ZIP 文件'));
    }
  }
});

// SSE clients for upgrade progress
const sseClients: Set<Response> = new Set();
let upgradeState = { step: 0, message: '', complete: false };

function broadcastProgress(event: string, data: any) {
  // Update upgradeState for polling fallback
  if (event === 'progress') {
    upgradeState = { step: data.step || 0, message: data.message || '', complete: false };
  } else if (event === 'complete') {
    upgradeState = { step: upgradeState.step, message: data.message || '更新完成', complete: true };
  }
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
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// S9: 备份 — 仅 ADMIN
router.post('/backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const backupDir = join(BASE_DIR, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'manual-' + now + '.zip';
    logger.info('[Update] Running WAL checkpoint...'); db.pragma('wal_checkpoint(TRUNCATE)'); logger.info('[Update] WAL checkpoint done');
    const dbDir = join(BASE_DIR, 'data');
    const zipPath = join(backupDir, filename);
    const zip = new AdmZip();
    zip.addLocalFile(join(dbDir, 'store.db'), '', 'store.db');
    if (existsSync(join(dbDir, 'store.db-wal'))) zip.addLocalFile(join(dbDir, 'store.db-wal'), '', 'store.db-wal');
    if (existsSync(join(dbDir, 'store.db-shm'))) zip.addLocalFile(join(dbDir, 'store.db-shm'), '', 'store.db-shm');
    zip.writeZip(zipPath);
    const size = statSync(zipPath).size;
    res.json({ filename, size: (size / 1024).toFixed(1) + ' KB', message: '备份成功' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// S9+3: 备份信息 — ADMIN + 路径安全
router.get('/backup-info/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const stats = statSync(filepath);
    res.json({ filename: req.params.filename, size: (stats.size / 1024).toFixed(1) + ' KB', sizeBytes: stats.size, date: stats.mtime.toISOString() });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// S2: 备份恢复 — ADMIN + 安全脚本生成（JSON.stringify 防注入）+ 路径安全
router.post('/backups/:filename/restore', async (req: AuthRequest, res: Response) => {
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
    db.close();
    logger.info('[Restore] Database closed for safe restore');

    // Step 3: Delete old DB files
    try { unlinkSync(join(dbDir, 'store.db')); } catch {}
    try { unlinkSync(join(dbDir, 'store.db-wal')); } catch {}
    try { unlinkSync(join(dbDir, 'store.db-shm')); } catch {}

    // Step 4: Extract backup ZIP
    const zip = new AdmZip(filepath);
    if (!validateZipEntries(zip)) return res.status(400).json({ error: "ZIP contains unsafe paths" });
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
      const Database = (await import('better-sqlite3')).default;
      const testDb = new Database(restoredDb, { readonly: true });
      const storeCount = testDb.prepare('SELECT count(*) as c FROM stores').get().c;
      const userCount = testDb.prepare('SELECT count(*) as c FROM users').get().c;
      testDb.close();
      logger.info('[Restore] Verified: ' + storeCount + ' stores, ' + userCount + ' users');
    } catch (e: any) {
      logger.error('[Restore] DB verification failed:', e.message);
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
          execFileSync('taskkill', ['/F', '/PID', String(process.pid)], { windowsHide: true });
        } else {
          process.kill(process.pid, 'SIGTERM');
        }
      } catch {}
      // Fallback: force exit after 2s if SIGTERM didn't work
      setTimeout(() => process.exit(0), 2000);
    }, 500);
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// S9: 删除备份 — ADMIN + 路径安全
router.delete('/backups/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    unlinkSync(filepath);
    res.json({ message: '备份已删除' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// 自动备份配置 — ADMIN
router.get('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    if (!existsSync(configPath)) return res.json({ enabled: false, interval: 'daily', keepCount: 30 });
    res.json(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    mkdirSync(join(BASE_DIR, 'data'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ message: '自动备份设置已更新' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
  try { res.json(upgradeState); } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
        logger.info('[Update] Step 1: Starting backup...'); broadcastProgress('progress', { step: 1, total: 4, message: '正在备份数据' });
        const backupDir = join(BASE_DIR, 'backups');
        mkdirSync(backupDir, { recursive: true });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        db.pragma('wal_checkpoint(TRUNCATE)');
        const preZip = new AdmZip();
        preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db'), '', 'store.db');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-wal'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-wal'), '', 'store.db-wal');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-shm'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-shm'), '', 'store.db-shm');
        logger.info('[Update] Creating backup zip...'); preZip.writeZip(join(backupDir, 'pre-upgrade-' + now + '.zip')); logger.info('[Update] Backup zip created');

        // Step 1.5: Backup current code (for msl rollback)
        try {
          const codeBackupDir = join(backupDir, 'code-backups');
          mkdirSync(codeBackupDir, { recursive: true });
          const currentVer = (() => { try { return JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch { return 'unknown'; } })();
          const codeZip = new AdmZip();
          const codeBackupName = 'pre-upgrade-v' + currentVer + '-' + now + '.zip';
          // Backup src/
          const srcDir = join(BASE_DIR, 'src');
          if (existsSync(srcDir)) codeZip.addLocalFolder(srcDir, 'src');
          // Backup public/web-dist/
          const webDistDir = join(BASE_DIR, 'public', 'web-dist');
          if (existsSync(webDistDir)) codeZip.addLocalFolder(webDistDir, 'web-dist');
          // Backup startup scripts and tools
          for (const f of ['startup-check.js', 'msl.js', 'entrypoint.js', 'tsconfig.json', 'package.json']) {
            const fp = join(BASE_DIR, f);
            if (existsSync(fp)) codeZip.addLocalFile(fp, '', f);
          }
          codeZip.writeZip(join(codeBackupDir, codeBackupName));
          logger.info('[Upgrade] Code backup created:', codeBackupName);
          // Cleanup old code backups (keep last 3)
          try {
            const oldBackups = readdirSync(codeBackupDir).filter(f => f.startsWith('pre-upgrade-') && f.endsWith('.zip')).sort().reverse();
            for (const old of oldBackups.slice(3)) {
              try { unlinkSync(join(codeBackupDir, old)); logger.info('[Upgrade] Cleaned old backup:', old); } catch {}
            }
          } catch {}
        } catch (e) { logger.warn('[Upgrade] Code backup failed (non-fatal):', e.message); }

        await new Promise(r => setTimeout(r, 500));
        // Step 2: Extract
        upgradeState = { step: 2, message: '正在解压', complete: false };
        broadcastProgress('progress', { step: 2, total: 4, message: '正在解压' });
        const extractDir = join(BASE_DIR, 'uploads', 'extract-' + Date.now());
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(file.path);
        if (!validateZipEntries(zip)) return res.status(400).json({ error: "ZIP contains unsafe paths" });
        zip.extractAllTo(extractDir, true);
        await new Promise(r => setTimeout(r, 500));
        logger.info('[Upgrade] Step 3: Starting file copy...');
        // Step 3: Update files
        upgradeState = { step: 3, message: '解压并更新', complete: false };
        broadcastProgress('progress', { step: 3, total: 4, message: '解压并更新' });
        const copyDir = (src, dest) => {
          mkdirSync(dest, { recursive: true });
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            if (entry.isDirectory()) copyDir(srcPath, destPath);
            else copyFileSync(srcPath, destPath);
          }
        };
        // copyDir: copy files recursively (overwrite existing)
        // === 检测升级包格式 ===
        let workDir = extractDir;
        const ghDir = join(extractDir, 'multi-shop-link-deploy-main');
        if (existsSync(ghDir) && (existsSync(join(ghDir, 'src')) || existsSync(join(ghDir, 'public')))) {
          workDir = ghDir;
          logger.info('[Upgrade] Detected GitHub archive format');
        }
        // --- 清理清单机制 ---
        const cleanupJsonPath = join(workDir, 'cleanup.json');
        if (existsSync(cleanupJsonPath)) {
          try {
            const cleanup = JSON.parse(readFileSync(cleanupJsonPath, 'utf-8'));
            logger.info('[Upgrade] Processing cleanup.json:', cleanup.description || 'no description');
            if (Array.isArray(cleanup.deleteFiles)) {
              for (const f of cleanup.deleteFiles) {
                if (!validateCleanupPath(f)) { logger.warn('[Upgrade] BLOCKED unsafe deleteFiles path:', f); continue; }
                const target = join(BASE_DIR, f);
                if (existsSync(target)) {
                  try { unlinkSync(target); logger.info('[Upgrade] Deleted file:', f); } catch (e) { logger.warn('[Upgrade] Failed to delete', f, e.message); }
                }
              }
            }
            if (Array.isArray(cleanup.deleteDirs)) {
              for (const d of cleanup.deleteDirs) {
                if (!validateCleanupPath(d)) { logger.warn('[Upgrade] BLOCKED unsafe deleteDirs path:', d); continue; }
                const target = join(BASE_DIR, d);
                if (existsSync(target)) {
                  try { rmSync(target, { recursive: true, force: true }); logger.info('[Upgrade] Deleted dir:', d); } catch (e) { logger.warn('[Upgrade] Failed to delete dir', d, e.message); }
                }
              }
            }
            broadcastProgress('progress', { step: 3, total: 4, message: '清理旧文件完成' });
          } catch (e) {
            logger.warn('[Upgrade] Failed to process cleanup.json:', e.message);
          }
        }
        // === 更新 web-dist（安全替换：清理旧 hash 文件，避免堆积）===
        const webDist1 = join(workDir, 'web-dist');
        const webDist2 = join(workDir, 'public', 'web-dist');
        const webDistSrc = existsSync(webDist1) ? webDist1 : (existsSync(webDist2) ? webDist2 : null);
        if (webDistSrc) {
          const webDest = join(BASE_DIR, 'public', 'web-dist');
          safeReplaceWebDist(webDistSrc, webDest);
          logger.info('[Upgrade] web-dist updated (旧文件已清理)');
          broadcastProgress('progress', { step: 3, total: 4, message: '更新前端文件' });
        } else {
          broadcastProgress('error', { message: '升级失败: web-dist目录不存在' });
          return;
        }
        // === 更新服务端代码（原子替换，失败自动回滚）===
        const sSrc1 = join(workDir, 'server-src');
        const sSrc2 = join(workDir, 'src');
        const sSrc = existsSync(sSrc1) ? sSrc1 : (existsSync(sSrc2) ? sSrc2 : null);
        if (!sSrc) {
          broadcastProgress('error', { message: '升级失败: 服务端代码目录不存在' });
          return;
        }
        // 升级前备份（用于 npm install 失败时回滚）
        const upgradeBakDir = join(BASE_DIR, 'data', 'upgrade-bak-' + Date.now());
        try {
          mkdirSync(upgradeBakDir, { recursive: true });
          if (existsSync(join(BASE_DIR, 'src'))) cpSync(join(BASE_DIR, 'src'), join(upgradeBakDir, 'src'), { recursive: true, force: true });
          if (existsSync(join(BASE_DIR, 'public', 'web-dist'))) cpSync(join(BASE_DIR, 'public', 'web-dist'), join(upgradeBakDir, 'web-dist'), { recursive: true, force: true });
          if (existsSync(join(BASE_DIR, 'package.json'))) copyFileSync(join(BASE_DIR, 'package.json'), join(upgradeBakDir, 'package.json'));
          logger.info('[Upgrade] Pre-upgrade backup created:', upgradeBakDir);
        } catch (e: any) {
          logger.warn('[Upgrade] Pre-upgrade backup failed (continue):', e.message);
        }

        const srcDest = join(BASE_DIR, 'src');
        try {
          atomicReplaceSrc(sSrc, srcDest);
          logger.info('[Upgrade] server code updated (atomic)');
        } catch (e: any) {
          broadcastProgress('error', { message: '服务端代码替换失败: ' + e.message });
          return;
        }

        // === 更新启动脚本和容器工具 ===
        for (const f of ['startup-check.js', 'msl.js', 'entrypoint.js', 'tsconfig.json']) {
          const srcFile = join(workDir, f);
          if (existsSync(srcFile)) {
            try { copyFileSync(srcFile, join(BASE_DIR, f)); logger.info('[Upgrade] Updated:', f); } catch (e) { logger.warn('[Upgrade] Failed to update', f, ':', e.message); }
          }
        }

        broadcastProgress('progress', { step: 3, total: 4, message: '更新服务端代码' });
        // === 更新 package.json ===
        const pkgFile = join(workDir, 'package.json');
        if (existsSync(pkgFile)) {
          copyFileSync(pkgFile, join(BASE_DIR, 'package.json'));
          logger.info('[Upgrade] package.json updated');
        }
        // === npm install (失败必须中止并回滚) ===
        try {
          logger.info('[Upgrade] Running npm install...');
          broadcastProgress('progress', { step: 3, total: 4, message: '正在安装依赖' });
          execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], { cwd: BASE_DIR, timeout: 300000, stdio: 'pipe' });
          logger.info('[Upgrade] npm install completed');
        } catch (e: any) {
          logger.error('[Upgrade] npm install FAILED, rolling back:', e.message);
          broadcastProgress('progress', { step: 3, total: 4, message: '依赖安装失败，正在回滚...' });
          restoreFromBackup(upgradeBakDir);
          // 重跑 npm install 恢复依赖
          try { execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], { cwd: BASE_DIR, timeout: 300000, stdio: 'pipe' }); } catch {}
          broadcastProgress('error', { message: '依赖安装失败，已回滚到升级前状态: ' + e.message });
          try { rmSync(upgradeBakDir, { recursive: true, force: true }); } catch {}
          return;
        }
        // npm install 成功，删除升级备份
        try { rmSync(upgradeBakDir, { recursive: true, force: true }); } catch {}
        // === 后置脚本 ===
        const postUpgradeScript = join(workDir, 'post-upgrade.cjs');
        if (existsSync(postUpgradeScript)) {
          try {
            // 安全校验：路径白名单（仅允许安全字符）
            const safePathRegex = /^[a-zA-Z0-9._\-\/\\:]+$/;
            if (!safePathRegex.test(postUpgradeScript)) {
              throw new Error('post-upgrade 脚本路径包含不安全字符');
            }
            logger.info('[Upgrade] Running post-upgrade script...');
            broadcastProgress('progress', { step: 3, total: 4, message: '正在执行后置脚本' });
            execFileSync('node', [postUpgradeScript], { cwd: BASE_DIR, timeout: 120000, stdio: 'pipe' });
            logger.info('[Upgrade] Post-upgrade script completed');
          } catch (e) {
            logger.warn('[Upgrade] Post-upgrade script failed (non-fatal):', e.message);
          }
        }
        // === 更新版本号 ===
        try {
          const pkgPath = [join(workDir, 'apps', 'web', 'package.json'), join(workDir, 'apps', 'server', 'package.json'), join(workDir, 'package.json')].find(p => existsSync(p)) || join(workDir, 'package.json');
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            writeFileSync(join(BASE_DIR, 'data', 'version.json'), JSON.stringify({ version: pkg.version || '2.0.0' }, null, 2));
          }
        } catch {}
        // === 同步 src-seed（保证容器 down/up 后能恢复到升级后版本）===
        syncSrcSeed(join(BASE_DIR, 'src'));
        // 清理临时解压目录
        try { rmSync(extractDir, { recursive: true, force: true }); } catch {}
        logger.info('[Upgrade] Step 3: File copy complete, starting step 4...');
        await new Promise(r => setTimeout(r, 500));
        // Step 4: Restart
        upgradeState = { step: 4, message: '重启', complete: false };
        broadcastProgress('progress', { step: 4, total: 4, message: '重启', done: true });
        broadcastProgress('complete', { message: '升级完成' });
        // Auto-restart after upgrade
        setTimeout(() => {
          logger.info('[Upgrade] Sending SIGTERM for restart...');
          process.kill(process.pid, 'SIGTERM');
        }, 3000);
      } catch (err: any) {
        broadcastProgress('error', { message: '升级失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// 重启 — ADMIN
router.post('/restart', (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '正在重启...' });
    setTimeout(() => {
      logger.info('[Restart] Sending SIGTERM for restart...');
      process.kill(process.pid, 'SIGTERM');
    }, 500);
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});
// 通知设置 — ADMIN
router.get('/notification-settings', (req: AuthRequest, res: Response) => {
  if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
  try {
    const settings = getSettings();
    // 返回前先解密 token（数据库存储为密文）
    if (settings.pushplus_token) settings.pushplus_token = decryptToken(settings.pushplus_token);
    if (settings.wecom_secret) settings.wecom_secret = decryptToken(settings.wecom_secret);
    if (settings.iyuu_token) settings.iyuu_token = decryptToken(settings.iyuu_token);
    // 脱敏：只有 ADMIN 才能看到完整密钥
    if (!isAdmin(req.user.role)) {
      const masked = { ...settings };
      const sensitiveFields = ['pushplus_token', 'wecom_secret', 'iyuu_token'];
      for (const field of sensitiveFields) {
        if (masked[field]) {
          const val = String(masked[field]);
          masked[field] = val.substring(0, 4) + '****' + val.substring(val.length - 4);
        }
      }
      return res.json(masked);
    }
    res.json(settings);
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/notification-settings', async (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    const b = req.body;
    // SSRF 防护：校验 webhook/proxy URL
    if (b.wecom_proxy_url) {
      const urlCheck = await validateWebhookUrlAsync(b.wecom_proxy_url);
      if (!urlCheck.valid) return res.status(400).json({ error: '代理URL不安全: ' + urlCheck.error });
    }
    // 显式更新：只更新前端传来的字段，未传的字段保持原值
    const encPushplus = b.pushplus_token !== undefined ? encryptToken(b.pushplus_token || '') : undefined;
    const encSecret = b.wecom_secret !== undefined ? encryptToken(b.wecom_secret || '') : undefined;
    const encIyuu = b.iyuu_token !== undefined ? encryptToken(b.iyuu_token || '') : undefined;
    // 构建 SET 子句
    const sets: string[] = [];
    const params: any[] = [];
    if (b.method !== undefined) { sets.push('method=?'); params.push(b.method || 'none'); }
    if (encPushplus !== undefined) { sets.push('pushplus_token=?'); params.push(encPushplus); }
    if (b.wecom_corpid !== undefined) { sets.push('wecom_corpid=?'); params.push(b.wecom_corpid || ''); }
    if (b.wecom_agentid !== undefined) { sets.push('wecom_agentid=?'); params.push(b.wecom_agentid || ''); }
    if (encSecret !== undefined) { sets.push('wecom_secret=?'); params.push(encSecret); }
    if (b.wecom_userid !== undefined) { sets.push('wecom_userid=?'); params.push(b.wecom_userid || ''); }
    if (b.wecom_proxy_url !== undefined) { sets.push('wecom_proxy_url=?'); params.push(b.wecom_proxy_url || ''); }
    if (encIyuu !== undefined) { sets.push('iyuu_token=?'); params.push(encIyuu); }
    if (b.push_daily_report !== undefined) { sets.push('push_daily_report=?'); params.push(b.push_daily_report ? 1 : 0); }
    if (b.push_weekly_report !== undefined) { sets.push('push_weekly_report=?'); params.push(b.push_weekly_report ? 1 : 0); }
    if (b.push_monthly_report !== undefined) { sets.push('push_monthly_report=?'); params.push(b.push_monthly_report ? 1 : 0); }
    if (b.push_review_reminder !== undefined) { sets.push('push_review_reminder=?'); params.push(b.push_review_reminder ? 1 : 0); }
    if (b.push_alert !== undefined) { sets.push('push_alert=?'); params.push(b.push_alert ? 1 : 0); }
    if (sets.length === 0) return res.json({ message: '无更新' });
    sets.push("updated_at=datetime('now','localtime')");
    db.prepare('UPDATE notification_settings SET ' + sets.join(', ') + ' WHERE id=1').run(...params);
    res.json({ message: '通知设置已更新' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.post('/notification-settings/test', (req: AuthRequest, res: Response) => {
  try {
    if (!isStoreAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });

    const bodyConfig = req.body && req.body.config ? req.body.config : null;
    const type = req.query.type as string || 'daily';
    (() => {
      let title = '测试通知'; let content = '这是一条测试通知消息\n发送时间: ' + new Date().toLocaleString('zh-CN');
      if (type === 'daily') { title = '每日简报'; content = buildDailyReport(); }
      else if (type === 'weekly') { title = '每周简报'; content = buildWeeklyReport(); }
      else if (type === 'monthly') { title = '月度报告'; content = buildMonthlyReport(); }
      else if (type === 'review') { title = '待审核提醒'; content = buildReviewReminder(); }
      else if (type === 'alert') { title = '系统告警'; content = buildAlert('测试告警信息'); }
      return sendNotification(title, content, type, bodyConfig);
    })()
      .then(() => res.json({ message: '测试通知已发送' }))
      .catch((err: any) => res.status(500).json({ error: '发送失败: ' + err.message }));
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
            logger.info('[Cleanup] Removed:', item);
          } catch (e) { logger.error('[Cleanup] Failed to remove:', item, e); }
        }
      }
    }
    res.json({ message: '清理完成' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
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
router.get('/check-update', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    
    let currentVersion = '1.0.0';
    try { currentVersion = JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch {}
    
    const versionUrl = 'https://raw.githubusercontent.com/' + DEPLOY_REPO + '/main/data/version.json';
    const versionRes = await fetchWithProxy(versionUrl);
    if (!versionRes) return res.json({ currentVersion, latestVersion: null, error: '无法连接到更新服务器' });
    
    const latestData = await versionRes.json();
    const latestVersion = latestData.version;
    
    const hasUpdate = compareVersions(currentVersion, latestVersion) < 0;
    
    const diff = getVersionDiff(currentVersion, latestVersion);
    const isCompatible = diff.totalMinor <= MAX_MINOR_JUMP;
    let upgradePath = [];
    let warning = '';
    
    if (hasUpdate && !isCompatible) {
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
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// Execute update
router.post('/do-update', async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '更新已开始..' });
    
    (async () => {
      try {
        logger.info('[Update] Async function started');
        logger.info('[Update] BASE_DIR:', BASE_DIR);
        upgradeState = { step: 0, message: '', complete: false };
        
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
        } catch (backupErr) { logger.error('[Update] Backup error:', backupErr.message); }
        broadcastProgress('progress', { step: 1, total: 4, message: '数据库备份完成', done: true });
        await new Promise(r => setTimeout(r, 1000));
        

        // Step 1.5: Backup current code (for msl rollback)
        try {
          const codeBackupDir = join(backupDir, 'code-backups');
          mkdirSync(codeBackupDir, { recursive: true });
          const currentVer = (() => { try { return JSON.parse(readFileSync(join(BASE_DIR, 'data', 'version.json'), 'utf-8')).version; } catch { return 'unknown'; } })();
          const codeZip = new AdmZip();
          const codeBackupName = 'pre-upgrade-v' + currentVer + '-' + now + '.zip';
          const srcDirBackup = join(BASE_DIR, 'src');
          if (existsSync(srcDirBackup)) codeZip.addLocalFolder(srcDirBackup, 'src');
          const webDistDirBackup = join(BASE_DIR, 'public', 'web-dist');
          if (existsSync(webDistDirBackup)) codeZip.addLocalFolder(webDistDirBackup, 'web-dist');
          for (const f of ['startup-check.js', 'msl.js', 'entrypoint.js', 'tsconfig.json', 'package.json']) {
            const fp = join(BASE_DIR, f);
            if (existsSync(fp)) codeZip.addLocalFile(fp, '', f);
          }
          codeZip.writeZip(join(codeBackupDir, codeBackupName));
          logger.info('[Update] Code backup created:', codeBackupName);
          try {
            const oldBackups = readdirSync(codeBackupDir).filter(f => f.startsWith('pre-upgrade-') && f.endsWith('.zip')).sort().reverse();
            for (const old of oldBackups.slice(3)) {
              try { unlinkSync(join(codeBackupDir, old)); logger.info('[Update] Cleaned old backup:', old); } catch {}
            }
          } catch {}
        } catch (e) { logger.warn('[Update] Code backup failed (non-fatal):', e.message); }

        // Step 2: Download
        broadcastProgress('progress', { step: 2, total: 4, message: '正在下载更新' });
        const zipUrl = 'https://github.com/' + DEPLOY_REPO + '/archive/refs/heads/main.zip';
        const zipRes = await fetchWithProxy(zipUrl);
        if (!zipRes) throw new Error('无法下载更新包');
        const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
        broadcastProgress('progress', { step: 2, total: 4, message: '下载完成', done: true });
        await new Promise(r => setTimeout(r, 500));
        // Step 2.5: SHA256 integrity check
        const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
        logger.info('[Update] ZIP SHA256:', zipHash);
        broadcastProgress('progress', { step: 2, total: 4, message: '校验更新包完整性' });
        await new Promise(r => setTimeout(r, 500));
        
        // Step 3: Extract & Update
        broadcastProgress('progress', { step: 3, total: 4, message: '正在解压更新包' });
        const extractDir = join(BASE_DIR, 'uploads', 'extract-' + now);
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(zipBuffer);
        if (!validateZipEntries(zip)) return res.status(400).json({ error: "ZIP contains unsafe paths" });
        zip.extractAllTo(extractDir, true);
        let extractedFolder = join(extractDir, 'multi-shop-link-deploy-main');
        if (!existsSync(extractedFolder)) {
          const entries = readdirSync(extractDir, { withFileTypes: true }).filter(e => e.isDirectory());
          if (entries.length === 1) {
            extractedFolder = join(extractDir, entries[0].name);
            logger.info('[Update] Using extracted folder:', entries[0].name);
          } else {
            throw new Error('解压后找不到更新目录，可能更新包格式不正确');
          }
        }
        const realExtractedFolder = extractedFolder;
        // Check checksum.json if present in update package
        const checksumFile = join(realExtractedFolder, 'checksum.json');
        if (existsSync(checksumFile)) {
          try {
            const ckData = JSON.parse(readFileSync(checksumFile, 'utf8'));
            if (ckData.sha256 && ckData.sha256 !== zipHash) {
              throw new Error('SHA256 mismatch');
            }
            logger.info('[Update] Checksum verified OK');
          } catch (ckErr) {
            if (ckErr.message.includes('mismatch')) throw ckErr;
            logger.warn('[Update] checksum.json parse failed:', ckErr.message);
          }
        } else {
          logger.warn('[Update] No checksum.json, skip hash check');
        }

        // --- cleanup.json 清理清单 ---
        const cleanupJsonPath = join(realExtractedFolder, 'cleanup.json');
        if (existsSync(cleanupJsonPath)) {
          try {
            const cleanup = JSON.parse(readFileSync(cleanupJsonPath, 'utf-8'));
            logger.info('[Update] Processing cleanup.json:', cleanup.description || '');
          broadcastProgress('progress', { step: 3, total: 4, message: '清理旧文件' });
          await new Promise(r => setTimeout(r, 300));
            if (Array.isArray(cleanup.deleteFiles)) {
              for (const f of cleanup.deleteFiles) {
                if (!validateCleanupPath(f)) { logger.warn('[Update] BLOCKED unsafe deleteFiles path:', f); continue; }
                const target = join(BASE_DIR, f);
                if (existsSync(target)) {
                  try { unlinkSync(target); logger.info('[Update] Deleted:', f); } catch (e: any) { logger.warn('[Update] Failed to delete', f, e.message); }
                }
              }
            }
            if (Array.isArray(cleanup.deleteDirs)) {
              for (const d of cleanup.deleteDirs) {
                if (!validateCleanupPath(d)) { logger.warn('[Update] BLOCKED unsafe deleteDirs path:', d); continue; }
                const target = join(BASE_DIR, d);
                if (existsSync(target)) {
                  try { rmSync(target, { recursive: true, force: true }); logger.info('[Update] Deleted dir:', d); } catch (e: any) { logger.warn('[Update] Failed to delete dir', d, e.message); }
                }
              }
            }
          } catch (e: any) { logger.warn('[Update] Failed to process cleanup.json:', e.message); }
        }
        
        const publicDir = join(realExtractedFolder, 'public');
        const webDistInPkg = join(publicDir, 'web-dist');
        const webDistRootPkg = join(realExtractedFolder, 'web-dist');
        const webDistSrcUpdate = existsSync(webDistInPkg) ? webDistInPkg : (existsSync(webDistRootPkg) ? webDistRootPkg : null);
        if (webDistSrcUpdate) {
          const webDest = join(BASE_DIR, 'public', 'web-dist');
          safeReplaceWebDist(webDistSrcUpdate, webDest);
          logger.info('[Update] web-dist updated (旧文件已清理)');
          broadcastProgress('progress', { step: 3, total: 4, message: '更新前端文件' });
          await new Promise(r => setTimeout(r, 300));
        } else {
          throw new Error('更新包中找不到 web-dist 目录');
        }
        // === 更新服务端代码（原子替换，失败自动回滚）===
        const srcDir = join(realExtractedFolder, 'src');
        if (!existsSync(srcDir)) {
          throw new Error('更新包中找不到 src/ 目录，更新包格式不正确');
        }
        // 升级前备份
        const upgradeBakDir2 = join(BASE_DIR, 'data', 'upgrade-bak-' + Date.now());
        try {
          mkdirSync(upgradeBakDir2, { recursive: true });
          if (existsSync(join(BASE_DIR, 'src'))) cpSync(join(BASE_DIR, 'src'), join(upgradeBakDir2, 'src'), { recursive: true, force: true });
          if (existsSync(join(BASE_DIR, 'public', 'web-dist'))) cpSync(join(BASE_DIR, 'public', 'web-dist'), join(upgradeBakDir2, 'web-dist'), { recursive: true, force: true });
          if (existsSync(join(BASE_DIR, 'package.json'))) copyFileSync(join(BASE_DIR, 'package.json'), join(upgradeBakDir2, 'package.json'));
          logger.info('[Update] Pre-upgrade backup created:', upgradeBakDir2);
        } catch (e: any) { logger.warn('[Update] Pre-upgrade backup failed (continue):', e.message); }

        const destSrc = join(BASE_DIR, 'src');
        try {
          atomicReplaceSrc(srcDir, destSrc);
          logger.info('[Update] server-src updated (atomic)');
        } catch (e: any) {
          logger.error('[Update] src 替换失败，正在回滚:', e.message);
          restoreFromBackup(upgradeBakDir2);
          try { rmSync(upgradeBakDir2, { recursive: true, force: true }); } catch {}
          throw new Error('服务端代码替换失败: ' + e.message);
        }

        // === 更新启动脚本和容器工具 ===
        for (const f of ['startup-check.js', 'msl.js', 'entrypoint.js', 'tsconfig.json']) {
          const srcFile = join(realExtractedFolder, f);
          if (existsSync(srcFile)) {
            try { copyFileSync(srcFile, join(BASE_DIR, f)); logger.info('[Update] Updated:', f); } catch (e) { logger.warn('[Update] Failed to update', f, ':', e.message); }
          }
        }

        broadcastProgress('progress', { step: 3, total: 4, message: '更新服务端代码' });
        await new Promise(r => setTimeout(r, 300));
        const pkgFile = join(realExtractedFolder, 'package.json');
        const oldPkgContent = existsSync(join(BASE_DIR, 'package.json')) ? readFileSync(join(BASE_DIR, 'package.json'), 'utf8') : '';
        if (existsSync(pkgFile)) {
          copyFileSync(pkgFile, join(BASE_DIR, 'package.json'));
          logger.info('[Update] package.json updated');
          // 如果 package.json 变化，尝试 npm install（失败回滚）
          const newPkgContent = readFileSync(pkgFile, 'utf8');
          if (oldPkgContent && oldPkgContent !== newPkgContent) {
            try {
              logger.info('[Update] package.json changed, running npm install...');
              broadcastProgress('progress', { step: 3, total: 4, message: '正在安装依赖' });
              execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], { cwd: BASE_DIR, timeout: 300000, stdio: 'pipe' });
              logger.info('[Update] npm install completed');
            } catch (e: any) {
              logger.error('[Update] npm install FAILED, rolling back:', e.message);
              broadcastProgress('progress', { step: 3, total: 4, message: '依赖安装失败，正在回滚...' });
              restoreFromBackup(upgradeBakDir2);
              try { execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], { cwd: BASE_DIR, timeout: 300000, stdio: 'pipe' }); } catch {}
              try { rmSync(upgradeBakDir2, { recursive: true, force: true }); } catch {}
              throw new Error('依赖安装失败，已回滚: ' + e.message);
            }
          }
        }
        // 成功，删升级备份
        try { rmSync(upgradeBakDir2, { recursive: true, force: true }); } catch {}
        const versionFile = join(realExtractedFolder, 'data', 'version.json');
        if (existsSync(versionFile)) {
          copyFileSync(versionFile, join(BASE_DIR, 'data', 'version.json'));
          logger.info('[Update] version.json updated');
        }
        // === 同步 src-seed（保证容器 down/up 后能恢复到升级后版本）===
        syncSrcSeed(join(BASE_DIR, 'src'));
        const postUpgradeScript = join(realExtractedFolder, 'post-upgrade.cjs');
        if (existsSync(postUpgradeScript)) {
          try {
            // 安全校验：路径白名单（仅允许安全字符）
            const safePathRegex = /^[a-zA-Z0-9._\-\/\\:]+$/;
            if (!safePathRegex.test(postUpgradeScript)) {
              throw new Error('post-upgrade 脚本路径包含不安全字符');
            }
            broadcastProgress('progress', { step: 3, total: 4, message: '执行后置脚本' });
        await new Promise(r => setTimeout(r, 300));
        logger.info('[Update] Running post-upgrade script...');
            execFileSync('node', [postUpgradeScript], { cwd: BASE_DIR, timeout: 120000, stdio: 'pipe' });
            logger.info('[Update] Post-upgrade completed');
          } catch (e) { logger.warn('[Update] Post-upgrade failed (non-fatal):', e.message); }
        }
        try { rmSync(extractDir, { recursive: true, force: true }); } catch {}
        broadcastProgress('progress', { step: 3, total: 4, message: '更新完成', done: true });
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 4: Restart
        broadcastProgress('progress', { step: 4, total: 4, message: '正在重启' });
        broadcastProgress('complete', { message: '更新完成' });
        
        setTimeout(() => {
          logger.info('[Update] Restarting via process.exit...');
          process.exit(0);
        }, 3000);
        
      } catch (err) {
        logger.error('[Update] FAILED:', err.message);
        broadcastProgress('error', { message: '更新失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});


// ── 用户个人推送设置（改造版） ──
import { encryptToken, decryptToken, checkTestRateLimit, isContentTypeAllowed, sendPushPlus, sendWeCom, sendIyuu } from '../notify.js';
import { getVapidPublicKey, saveSubscription, removeSubscription, getUserSubscriptions, sendPushNotification, getJPushConfig, setJPushConfig } from '../push-notify.js';
import logger from '../logger.js';

// GET: 读取自己的设置（解密返回）
router.get('/user-notification-settings', (req: AuthRequest, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM user_notification_settings WHERE user_id = ?').get(req.user.id) as any;
    if (!row) return res.json({});
    const result = { ...row };
    if (result.pushplus_token) result.pushplus_token = decryptToken(result.pushplus_token);
    if (result.wecom_secret) result.wecom_secret = decryptToken(result.wecom_secret);
    if (result.iyuu_token) result.iyuu_token = decryptToken(result.iyuu_token);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// PUT: 保存自己的设置（加密存储，角色校验）
router.put('/user-notification-settings', async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user.role;
    const b = req.body;
    // SSRF 防护：校验 webhook/proxy URL
    if (b.wecom_proxy_url) {
      const urlCheck = await validateWebhookUrlAsync(b.wecom_proxy_url);
      if (!urlCheck.valid) return res.status(400).json({ error: '代理URL不安全: ' + urlCheck.error });
    }
    if (!isAdmin(role) && (b.wecom_corpid || b.wecom_secret)) {
      return res.status(403).json({ error: '企业微信仅限系统管理员配置' });
    }
    // 所有推送开关字段
    const pushFields = ['push_daily_report','push_weekly_report','push_monthly_report','push_review_reminder','push_alert',
      'push_bookkeeping_notify','push_inventory_notify','push_openclose_notify','push_purchase_notify','push_salary_notify','push_dividend_notify',
      'push_health_cert','push_staff','push_store','push_entry','push_payroll','push_dividend','push_inventory','push_shift','push_purchase',
      'push_salary_confirm','push_inventory_alert','push_store_alert'];
    // 加密 token（空字符串也会被加密为空串）
    const encPushplus = b.pushplus_token !== undefined ? encryptToken(b.pushplus_token || '') : undefined;
    const encSecret = b.wecom_secret !== undefined ? encryptToken(b.wecom_secret || '') : undefined;
    const encIyuu = b.iyuu_token !== undefined ? encryptToken(b.iyuu_token || '') : undefined;
    const existing = db.prepare('SELECT user_id FROM user_notification_settings WHERE user_id = ?').get(req.user.id);
    if (existing) {
      const sets: string[] = [];
      const params: any[] = [];
      if (encPushplus !== undefined) { sets.push('pushplus_token=?'); params.push(encPushplus); }
      if (b.wecom_corpid !== undefined) { sets.push('wecom_corpid=?'); params.push(b.wecom_corpid || ''); }
      if (b.wecom_agentid !== undefined) { sets.push('wecom_agentid=?'); params.push(b.wecom_agentid || ''); }
      if (encSecret !== undefined) { sets.push('wecom_secret=?'); params.push(encSecret); }
      if (b.wecom_userid !== undefined) { sets.push('wecom_userid=?'); params.push(b.wecom_userid || ''); }
      if (b.wecom_proxy_url !== undefined) { sets.push('wecom_proxy_url=?'); params.push(b.wecom_proxy_url || ''); }
      if (encIyuu !== undefined) { sets.push('iyuu_token=?'); params.push(encIyuu); }
      if (b.method !== undefined) { sets.push('method=?'); params.push(b.method || 'none'); }
      for (const f of pushFields) { if (b[f] !== undefined) { sets.push(f + '=?'); params.push(b[f] ? 1 : 0); } }
      if (sets.length === 0) return res.json({ message: '无更新' });
      sets.push('updated_at=?'); params.push(new Date().toISOString());
      params.push(req.user.id);
      db.prepare('UPDATE user_notification_settings SET ' + sets.join(', ') + ' WHERE user_id=?').run(...params);
    } else {
      // INSERT：用默认值 + 前端传来的值
      const cols = ['user_id'];
      const vals: any[] = [req.user.id];
      if (encPushplus !== undefined) { cols.push('pushplus_token'); vals.push(encPushplus); }
      if (b.wecom_corpid !== undefined) { cols.push('wecom_corpid'); vals.push(b.wecom_corpid || ''); }
      if (b.wecom_agentid !== undefined) { cols.push('wecom_agentid'); vals.push(b.wecom_agentid || ''); }
      if (encSecret !== undefined) { cols.push('wecom_secret'); vals.push(encSecret); }
      if (b.wecom_userid !== undefined) { cols.push('wecom_userid'); vals.push(b.wecom_userid || ''); }
      if (b.wecom_proxy_url !== undefined) { cols.push('wecom_proxy_url'); vals.push(b.wecom_proxy_url || ''); }
      if (encIyuu !== undefined) { cols.push('iyuu_token'); vals.push(encIyuu); }
      if (b.method !== undefined) { cols.push('method'); vals.push(b.method || 'none'); }
      for (const f of pushFields) { if (b[f] !== undefined) { cols.push(f); vals.push(b[f] ? 1 : 0); } }
      cols.push('updated_at'); vals.push(new Date().toISOString());
      db.prepare('INSERT INTO user_notification_settings (' + cols.join(',') + ') VALUES (' + cols.map(()=>'?').join(',') + ')').run(...vals);
    }
    res.json({ message: '推送设置已保存' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// POST test: 测试推送（频率限制 + 角色校验）
router.post('/user-notification-settings/test', async (req: AuthRequest, res: Response) => {
  try {
    const limitErr = checkTestRateLimit(req.user.id);
    if (limitErr) return res.status(429).json({ error: limitErr });
    const config = req.body?.config || {};
    const channel = (req.query.channel as string) || '';
    if (!isAdmin(req.user.role) && channel === 'wecom') {
      return res.status(403).json({ error: '企业微信仅限系统管理员配置' });
    }
    const title = '测试通知';
    const content = '这是一条个人推送测试\n发送时间: ' + new Date().toLocaleString('zh-CN');
    const results: string[] = [];
    const errors: string[] = [];
    const sendOne = async (key: string, fn: () => Promise<void>) => {
      try { await fn(); results.push(key); } catch (e: any) { errors.push(key + ': ' + e.message); }
    };
    if (channel === 'pushplus' || (!channel && config.pushplus_token)) await sendOne('PushPlus', () => sendPushPlus(title, content, '', config));
    if (channel === 'wecom' || (!channel && config.wecom_corpid)) await sendOne('企业微信', () => sendWeCom(title, content, config));
    if (channel === 'iyuu' || (!channel && config.iyuu_token)) await sendOne('爱语飞飞', () => sendIyuu(title, content, config));
    if (results.length === 0 && errors.length === 0) res.status(400).json({ error: '请先配置至少一个推送渠道' });
    else if (errors.length > 0 && results.length === 0) res.status(500).json({ error: '推送失败: ' + errors.join('; ') });
    else res.json({ results, errors });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// ── 推送订阅 API ──
router.get('/push/vapid-key', (req: AuthRequest, res: Response) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/push/subscribe', (req: AuthRequest, res: Response) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: '参数不完整' });
    saveSubscription(req.user.id, { endpoint, keys });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.post('/push/unsubscribe', (req: AuthRequest, res: Response) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: '参数不完整' });
    removeSubscription(req.user.id, endpoint);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.post('/push/test', async (req: AuthRequest, res: Response) => {
  try {
    const subs = getUserSubscriptions(req.user.id);
    if (subs.length === 0) {
      return res.status(400).json({ error: '未订阅浏览器推送，请先开启推送通知' });
    }
    await sendPushNotification(req.user.id, '测试推送', '这是一条测试推送消息\n发送时间: ' + new Date().toLocaleString('zh-CN'));
    res.json({ success: true, message: '测试推送已发送' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// JPush device registration
router.post('/push/jpush-register', (req: AuthRequest, res: Response) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId required' });
    db.prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)').run(req.user.id, 'jpush:' + registrationId, 'jpush', '');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

// JPush config (admin only)
router.get('/push/jpush-config', requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const cfg = getJPushConfig();
    res.json({ appKey: cfg?.appKey || '', masterSecret: cfg?.masterSecret ? '***' : '' });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

router.put('/push/jpush-config', requireAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { appKey, masterSecret } = req.body;
    if (!appKey || !masterSecret) return res.status(400).json({ error: '参数不完整' });
    setJPushConfig(appKey, masterSecret);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: process.env.NODE_ENV === "production" ? "服务器内部错误" : err.message }); }
});

export default router;

