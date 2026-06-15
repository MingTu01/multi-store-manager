import { Router, Response } from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { join } from 'path';
const BASE_DIR = join(__dirname, '..', '..');
import { exec } from 'child_process';
import { readdirSync, statSync, unlinkSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import os from 'os';
import multer from 'multer';
import AdmZip from 'adm-zip';
import db from '../db.js';
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

// S30: 系统信息 — 仅 ADMIN
router.get('/info', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
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
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const backupDir = join(BASE_DIR, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'manual-' + now + '.zip';
    db.pragma('wal_checkpoint(TRUNCATE)');
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
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const stats = statSync(filepath);
    res.json({ filename: req.params.filename, size: (stats.size / 1024).toFixed(1) + ' KB', sizeBytes: stats.size, date: stats.mtime.toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9: 备份列表 — ADMIN
router.get('/backups', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
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
  if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
  const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
  if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
  res.download(filepath, req.params.filename);
});

// 上传备份 — ADMIN
router.post('/backups/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
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
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const dbDir = join(BASE_DIR, 'data');
    // S2: 使用 JSON.stringify 安全转义路径，防止代码注入
    const safeDbDir = JSON.stringify(dbDir);
    const safeFilepath = JSON.stringify(filepath);
    const restoreScript = [
      'const fs=require("fs"),path=require("path"),{spawn}=require("child_process");',
      'const dir=' + safeDbDir + ';',
      'const zipPath=' + safeFilepath + ';',
      'setTimeout(()=>{',
      '  try{fs.unlinkSync(path.join(dir,"store.db"));}catch{}',
      '  try{fs.unlinkSync(path.join(dir,"store.db-wal"));}catch{}',
      '  try{fs.unlinkSync(path.join(dir,"store.db-shm"));}catch{}',
      '  const AdmZip=require("adm-zip");',
      '  const zip=new AdmZip(zipPath);',
      '  zip.extractAllTo(dir,true);',
      '  console.log("Restore complete");',
      '  setTimeout(()=>{',
      '    const child=spawn(process.execPath,["--import","tsx","src/index.ts"],',
      '      {detached:true,stdio:"ignore",cwd:dir.replace(/\\\\data$/,"")});',
      '    child.unref();process.exit(1);',
      '  },1000);',
      '},1000);'
    ].join('\n');
    const restorePath = join(BASE_DIR, 'data', '_restore.js');
    writeFileSync(restorePath, restoreScript);
    res.json({ message: '备份恢复成功，服务器即将重启...' });
    setTimeout(() => {
      ;
      const cmd = process.platform === 'win32'
        ? 'start /b cmd /c "cd /d ' + BASE_DIR + ' && node data/_restore.js"'
        : 'cd ' + BASE_DIR + ' && nohup node data/_restore.js > /dev/null 2>&1 &';
      exec(cmd, { cwd: BASE_DIR, windowsHide: true });
      setTimeout(() => process.exit(0), 500);
    }, 200);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// S9: 删除备份 — ADMIN + 路径安全
router.delete('/backups/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = safePath(join(BASE_DIR, 'backups'), req.params.filename);
    if (!filepath || !existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    unlinkSync(filepath);
    res.json({ message: '备份已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 自动备份配置 — ADMIN
router.get('/auto-backup', (req: AuthRequest, res: Response, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' }); if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' }); next(); }),
router.get('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    if (!existsSync(configPath)) return res.json({ enabled: false, interval: 'daily', keepCount: 30 });
    res.json(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
    mkdirSync(join(BASE_DIR, 'data'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ message: '自动备份设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 升级相关 — ADMIN
router.get('/upgrade/stream', (req: AuthRequest, res: Response) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

router.get('/upgrade/status', (req: AuthRequest, res: Response) => {
  if (req.user.role !== 'admin' && req.user.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
  try { res.json(upgradeState); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/upgrade/validate', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
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
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传升级包' });
    res.json({ message: '升级已开始', status: 'processing' });
    (async () => {
      try {
        upgradeState = { step: 1, message: '正在备份数据库...', complete: false }; broadcastProgress('progress', { step: 1, total: 5, message: '正在备份数据库...' });
        const backupDir = join(BASE_DIR, 'backups');
        mkdirSync(backupDir, { recursive: true });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        db.pragma('wal_checkpoint(TRUNCATE)');
        const preZip = new AdmZip();
        preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db'), '', 'store.db');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-wal'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-wal'), '', 'store.db-wal');
        if (existsSync(join(BASE_DIR, 'data', 'store.db-shm'))) preZip.addLocalFile(join(BASE_DIR, 'data', 'store.db-shm'), '', 'store.db-shm');
        preZip.writeZip(join(backupDir, 'pre-upgrade-' + now + '.zip'));
        upgradeState = { step: 1, message: '数据库备份完成', complete: false }; broadcastProgress('progress', { step: 1, total: 5, message: '数据库备份完成', done: true });
        await new Promise(r => setTimeout(r, 500));
        upgradeState = { step: 2, message: '正在解压升级包...', complete: false }; broadcastProgress('progress', { step: 2, total: 5, message: '正在解压升级包...' });
        const extractDir = join(BASE_DIR, 'uploads', 'extract-' + Date.now());
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(file.path);
        zip.extractAllTo(extractDir, true);
        upgradeState = { step: 2, message: '升级包解压完成', complete: false }; broadcastProgress('progress', { step: 2, total: 5, message: '升级包解压完成', done: true });
        await new Promise(r => setTimeout(r, 500));
        upgradeState = { step: 3, message: '正在更新版本信息...', complete: false }; broadcastProgress('progress', { step: 3, total: 5, message: '正在更新版本信息...' });
        try {
          const pkgPath = [join(extractDir, 'apps', 'web', 'package.json'), join(extractDir, 'apps', 'server', 'package.json'), join(extractDir, 'package.json')].find(p => existsSync(p)) || join(extractDir, 'package.json');
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            writeFileSync(join(BASE_DIR, 'data', 'version.json'), JSON.stringify({ version: pkg.version || '2.0.0' }, null, 2));
          }
        } catch {}
        upgradeState = { step: 3, message: '版本信息已更新', complete: false }; broadcastProgress('progress', { step: 3, total: 5, message: '版本信息已更新', done: true });
        await new Promise(r => setTimeout(r, 500));
        upgradeState = { step: 4, message: '正在覆盖文件...', complete: false }; broadcastProgress('progress', { step: 4, total: 5, message: '正在覆盖文件...' });
        const copyDir = (src: string, dest: string) => {
          mkdirSync(dest, { recursive: true });
          for (const entry of readdirSync(src, { withFileTypes: true })) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);
            if (entry.isDirectory()) copyDir(srcPath, destPath);
            else copyFileSync(srcPath, destPath);
          }
        };
        const webDist = join(extractDir, 'web-dist');
        const serverSrc = join(extractDir, 'server-src');
        console.log('[Upgrade] Extract dir:', extractDir);
        console.log('[Upgrade] web-dist exists:', existsSync(webDist), '→', join(BASE_DIR, 'public', 'web-dist'));
        console.log('[Upgrade] server-src exists:', existsSync(serverSrc), '→', join(BASE_DIR, 'src'));
        if (existsSync(webDist)) {
          copyDir(webDist, join(BASE_DIR, 'public', 'web-dist'));
          console.log('[Upgrade] web-dist copied successfully');
        } else {
          console.log('[Upgrade] ERROR: web-dist not found in ZIP!');
          broadcastProgress('error', { message: '升级失败: web-dist目录不存在' });
          return;
        }
        if (existsSync(serverSrc)) {
          copyDir(serverSrc, join(BASE_DIR, 'src'));
          console.log('[Upgrade] server-src copied successfully');
        } else {
          console.log('[Upgrade] ERROR: server-src not found in ZIP!');
          broadcastProgress('error', { message: '升级失败: server-src目录不存在' });
          return;
        }
        upgradeState = { step: 4, message: '文件覆盖完成', complete: false }; broadcastProgress('progress', { step: 4, total: 5, message: '文件覆盖完成', done: true });
        await new Promise(r => setTimeout(r, 500));
        upgradeState = { step: 5, message: '升级完成', complete: true }; broadcastProgress('progress', { step: 5, total: 5, message: '升级完成', done: true });
        broadcastProgress('ready', { message: '升级已完成，正在重启服务...' });
        // Auto-restart after upgrade - send SIGTERM to self
        setTimeout(() => {
          console.log('[Upgrade] Sending SIGTERM for restart...');
          process.kill(process.pid, 'SIGTERM');
        }, 2000);
      } catch (err: any) {
        broadcastProgress('error', { message: '升级失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// 重启 — ADMIN
router.post('/restart', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '正在重启...' });
    setTimeout(() => {
      console.log('[Restart] Sending SIGTERM for restart...');
      process.kill(process.pid, 'SIGTERM');
    }, 500);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
// 通知设置 — ADMIN
router.get('/notification-settings', (req: AuthRequest, res: Response) => {
  if (!['admin', 'ADMIN', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
  try { res.json(getSettings()); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/notification-settings', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const s = getSettings();
    Object.assign(s, req.body);
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
    if (!['admin', 'ADMIN', 'STORE_ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
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
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const uploadsDir = join(BASE_DIR, 'uploads');
    if (existsSync(uploadsDir)) {
      const items = readdirSync(uploadsDir);
      for (const item of items) {
        if (item.startsWith('extract-')) {
          const extractPath = join(uploadsDir, item);
          try {
            fs.rmSync(extractPath, { recursive: true, force: true });
            console.log('[Cleanup] Removed:', item);
          } catch (e) { console.error('[Cleanup] Failed to remove:', item, e); }
        }
      }
    }
    res.json({ message: '娓呯悊瀹屾垚' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
