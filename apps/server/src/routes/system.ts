import { Router, Response } from 'express';
import { join } from 'path';
import { readdirSync, statSync, unlinkSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import os from 'os';
import multer from 'multer';
import AdmZip from 'adm-zip';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { getSettings, sendNotification } from '../notify.js';

const router = Router();
const upload = multer({ dest: join(process.cwd(), 'uploads') });

// SSE clients for upgrade progress
const sseClients: Set<Response> = new Set();
// Upgrade state
let upgradeState = { step: 0, message: '', complete: false };


function broadcastProgress(event: string, data: any) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

router.get('/upgrade/stream', (req: AuthRequest, res: Response) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// === System Info ===
router.get('/info', (req: AuthRequest, res: Response) => {
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
    const storeCount = (db.prepare('SELECT COUNT(*) as count FROM stores').get() as any).count;
    const entryCount = (db.prepare('SELECT COUNT(*) as count FROM entries').get() as any).count;
    const dbSize = existsSync(join(process.cwd(), 'data', 'store.db')) ? statSync(join(process.cwd(), 'data', 'store.db')).size : 0;
    const cpus = os.cpus();
    const cpuUsage = cpus.length > 0 ? Math.round(cpus.reduce((s: number, c: any) => s + (c.times.user + c.times.nice + c.times.sys + c.times.irq) / (c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle) * 100, 0) / cpus.length) : 0;
    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    let version = '1.0.0';
    try { version = JSON.parse(readFileSync(join(process.cwd(), 'data', 'version.json'), 'utf-8')).version; } catch {}
    res.json({ version, userCount, storeCount, entryCount, dbSize: (dbSize / 1024 / 1024).toFixed(2) + ' MB', uptime: process.uptime(), cpu: cpuUsage + '%', memory: Math.round(usedMem / 1048576) + ' / ' + Math.round(totalMem / 1048576) + ' MB', nodeVersion: process.version });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Backup ===
router.post('/backup', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const backupDir = join(process.cwd(), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'manual-' + now + '.zip';
    // Checkpoint WAL to ensure all data is in main db file
    db.pragma('wal_checkpoint(TRUNCATE)');
    // Copy all DB files (db + wal + shm)
    const dbDir = join(process.cwd(), 'data');
    const zipPath = join(backupDir, filename);
    const archiver = require('adm-zip');
    const zip = new archiver();
    zip.addLocalFile(join(dbDir, 'store.db'), '', 'store.db');
    if (existsSync(join(dbDir, 'store.db-wal'))) zip.addLocalFile(join(dbDir, 'store.db-wal'), '', 'store.db-wal');
    if (existsSync(join(dbDir, 'store.db-shm'))) zip.addLocalFile(join(dbDir, 'store.db-shm'), '', 'store.db-shm');
    zip.writeZip(zipPath);
    const size = statSync(zipPath).size;
    res.json({ filename, size: (size / 1024).toFixed(1) + ' KB', message: '备份成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/backup-info/:filename', (req: AuthRequest, res: Response) => {
  try {
    const filepath = join(process.cwd(), 'backups', req.params.filename);
    if (!existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const stats = statSync(filepath);
    res.json({ 
      filename: req.params.filename,
      size: (stats.size / 1024).toFixed(1) + ' KB',
      sizeBytes: stats.size,
      date: stats.mtime.toISOString(),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/backups', (req: AuthRequest, res: Response) => {
  try {
    const backupDir = join(process.cwd(), 'backups');
    if (!existsSync(backupDir)) return res.json({ backups: [] });
    const files = readdirSync(backupDir).filter(f => f.endsWith('.zip')).map(f => {
      const stats = statSync(join(backupDir, f));
      return { filename: f, size: (stats.size / 1024).toFixed(1) + ' KB', date: stats.mtime.toISOString() };
    }).sort((a: any, b: any) => b.date.localeCompare(a.date));
    res.json({ backups: files });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/backups/:filename/download', (req: AuthRequest, res: Response) => {
  const filepath = join(process.cwd(), 'backups', req.params.filename);
  if (!existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
  res.download(filepath, req.params.filename);
});

// === Upload Backup ===
router.post('/backups/upload', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传备份文件' });
    if (!file.originalname.endsWith('.db')) return res.status(400).json({ error: '请上传.db格式的备份文件' });
    
    const backupDir = join(process.cwd(), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'uploaded-' + now + '.db';
    
    copyFileSync(file.path, join(backupDir, filename));
    unlinkSync(file.path);
    
    res.json({ filename, message: '备份上传成功' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/backups/:filename/restore', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = join(process.cwd(), 'backups', req.params.filename);
    if (!existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    const dbDir = join(process.cwd(), 'data');
    // Write a restore script that runs AFTER server exits (can safely delete locked files)
    const restoreScript = `const fs=require('fs'),path=require('path'),{spawn}=require('child_process');const dir='${dbDir.replace(/\\/g, '\\\\')}';setTimeout(()=>{try{fs.unlinkSync(path.join(dir,'store.db'));}catch{}try{fs.unlinkSync(path.join(dir,'store.db-wal'));}catch{}try{fs.unlinkSync(path.join(dir,'store.db-shm'));}catch{}const AdmZip=require('adm-zip');const zip=new AdmZip('${filepath.replace(/\\/g, '\\\\')}');zip.extractAllTo(dir,true);console.log('Restore complete');setTimeout(()=>{const child=spawn(process.execPath,['--import','tsx','src/index.ts'],{detached:true,stdio:'ignore',cwd:dir.replace(/\\\\data$/,'')});child.unref();process.exit(0);},1000);},1000);`;
    const restorePath = join(process.cwd(), 'data', '_restore.js');
    const fs = require('fs');
    fs.writeFileSync(restorePath, restoreScript);
    res.json({ message: '备份恢复成功，服务器即将重启...' });
    
    // Launch restore script as independent process, then exit
    setTimeout(() => {
      const { exec } = require('child_process');
      const cmd = process.platform === 'win32'
        ? 'start /b cmd /c "cd /d ' + process.cwd() + ' && node data/_restore.js"'
        : 'cd ' + process.cwd() + ' && nohup node data/_restore.js > /dev/null 2>&1 &';
      exec(cmd, { cwd: process.cwd(), windowsHide: true });
      setTimeout(() => process.exit(0), 500);
    }, 200);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete('/backups/:filename', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const filepath = join(process.cwd(), 'backups', req.params.filename);
    if (!existsSync(filepath)) return res.status(404).json({ error: '备份不存在' });
    unlinkSync(filepath);
    res.json({ message: '备份已删除' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Auto Backup ===
router.get('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    const configPath = join(process.cwd(), 'data', 'auto-backup.json');
    if (!existsSync(configPath)) return res.json({ enabled: false, interval: 'daily', keepCount: 30 });
    res.json(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/auto-backup', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const configPath = join(process.cwd(), 'data', 'auto-backup.json');
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ message: '自动备份设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Upgrade Validate ===

router.get('/upgrade/status', (req: AuthRequest, res: Response) => {
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
      const pkgEntry = zip.getEntries().find(e => e.entryName === 'package.json');
      if (pkgEntry) { const pkg = JSON.parse(pkgEntry.getData().toString('utf8')); version = pkg.version || '未知'; }
    } catch (e: any) { return res.status(400).json({ error: '无法解析升级包: ' + e.message }); }
    res.json({ version, file: file.originalname, valid: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Upgrade Execute ===
router.post('/upgrade', upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: '请上传升级包' });

    // Return immediately, process in background
    res.json({ message: '升级已开始', status: 'processing' });

    // Background upgrade process
    (async () => {
      try {
        // Step 1: Backup DB
        upgradeState = { step: 1, message: '正在备份数据库...', complete: false }; broadcastProgress('progress', { step: 1, total: 5, message: '正在备份数据库...' });
        const backupDir = join(process.cwd(), 'backups');
        mkdirSync(backupDir, { recursive: true });
        const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        db.pragma('wal_checkpoint(TRUNCATE)');
        const AdmZip2 = require('adm-zip');
        const preZip = new AdmZip2();
        preZip.addLocalFile(join(process.cwd(), 'data', 'store.db'), '', 'store.db');
        if (existsSync(join(process.cwd(), 'data', 'store.db-wal'))) preZip.addLocalFile(join(process.cwd(), 'data', 'store.db-wal'), '', 'store.db-wal');
        if (existsSync(join(process.cwd(), 'data', 'store.db-shm'))) preZip.addLocalFile(join(process.cwd(), 'data', 'store.db-shm'), '', 'store.db-shm');
        preZip.writeZip(join(backupDir, 'pre-upgrade-' + now + '.zip'));
        upgradeState = { step: 1, message: '数据库备份完成', complete: false }; broadcastProgress('progress', { step: 1, total: 5, message: '数据库备份完成', done: true });
        await new Promise(r => setTimeout(r, 500));

        // Step 2: Extract ZIP
        upgradeState = { step: 2, message: '正在解压升级包...', complete: false }; broadcastProgress('progress', { step: 2, total: 5, message: '正在解压升级包...' });
        const extractDir = join(process.cwd(), 'uploads', 'extract-' + Date.now());
        mkdirSync(extractDir, { recursive: true });
        const zip = new AdmZip(file.path);
        zip.extractAllTo(extractDir, true);
        upgradeState = { step: 2, message: '升级包解压完成', complete: false }; broadcastProgress('progress', { step: 2, total: 5, message: '升级包解压完成', done: true });
        await new Promise(r => setTimeout(r, 500));

        // Step 3: Update version
        upgradeState = { step: 3, message: '正在更新版本信息...', complete: false }; broadcastProgress('progress', { step: 3, total: 5, message: '正在更新版本信息...' });
        try {
          const pkgPath = join(extractDir, 'package.json');
          if (existsSync(pkgPath)) {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            writeFileSync(join(process.cwd(), 'data', 'version.json'), JSON.stringify({ version: pkg.version || '2.0.0' }, null, 2));
          }
        } catch {}
        upgradeState = { step: 3, message: '版本信息已更新', complete: false }; broadcastProgress('progress', { step: 3, total: 5, message: '版本信息已更新', done: true });
        await new Promise(r => setTimeout(r, 500));

        // Step 4: Copy files
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
        if (existsSync(webDist)) copyDir(webDist, join(process.cwd(), '..', 'web', 'dist'));
        const serverSrc = join(extractDir, 'server-src');
        if (existsSync(serverSrc)) copyDir(serverSrc, join(process.cwd(), 'src'));
        upgradeState = { step: 4, message: '文件覆盖完成', complete: false }; broadcastProgress('progress', { step: 4, total: 5, message: '文件覆盖完成', done: true });
        await new Promise(r => setTimeout(r, 500));

        // Step 5: Ready to restart
        upgradeState = { step: 5, message: '升级完成', complete: true }; broadcastProgress('progress', { step: 5, total: 5, message: '升级完成', done: true });
        broadcastProgress('ready', { message: '升级已完成' });

      } catch (err: any) {
        broadcastProgress('error', { message: '升级失败: ' + err.message });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Restart Server ===
router.post('/restart', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    res.json({ message: '正在重启...' });
    
    // Restart server - cross-platform
    setTimeout(() => {
      const { exec } = require('child_process');
      const cmd = process.platform === 'win32'
        ? 'start /b cmd /c "cd /d ' + process.cwd() + ' && node --import tsx src/index.ts"'
        : 'cd ' + process.cwd() + ' && nohup node --import tsx src/index.ts > /dev/null 2>&1 &';
      exec(cmd, { cwd: process.cwd(), windowsHide: true });
      setTimeout(() => process.exit(0), 500);
    }, 200);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// === Notification Settings ===
router.get('/notification-settings', (req: AuthRequest, res: Response) => {
  try { res.json(getSettings()); } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/notification-settings', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const s = getSettings();
    Object.assign(s, req.body);
    const configPath = join(process.cwd(), 'data', 'notification-settings.json');
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    writeFileSync(configPath, JSON.stringify(s, null, 2));
    res.json({ message: '通知设置已更新' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/notification-settings/test', (req: AuthRequest, res: Response) => {
  try {
    if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    const type = req.query.type as string || 'daily';
    sendNotification('测试通知', '这是一条测试通知消息\n发送时间: ' + new Date().toLocaleString('zh-CN'), type)
      .then(() => res.json({ message: '测试通知已发送' }))
      .catch((err: any) => res.status(500).json({ error: '发送失败: ' + err.message }));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;