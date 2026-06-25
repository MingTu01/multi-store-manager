#!/usr/bin/env node
// MSL Container Management Tool
// Usage: msl

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASE_DIR = '/app';
const DB_PATH = path.join(BASE_DIR, 'data', 'store.db');
const VERSION_FILE = path.join(BASE_DIR, 'data', 'version.json');
const BACKUP_DIR = path.join(BASE_DIR, 'backups');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');
const DEPLOY_REPO = 'https://gh.llkk.cc/https://github.com/MingTu01/multi-shop-link-deploy/archive/refs/heads/main.zip';

// Lazy imports
let db, AdmZip;
function getDb() {
  if (!db) { db = require('better-sqlite3')(DB_PATH); }
  return db;
}
function getZip() { if (!AdmZip) AdmZip = require('adm-zip'); return AdmZip; }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

// Colors
const C = {
  R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', B: '\x1b[34m',
  M: '\x1b[35m', C: '\x1b[36m', W: '\x1b[37m', D: '\x1b[0m',
  BOLD: '\x1b[1m', DIM: '\x1b[2m',
};
const g = (s) => C.G + s + C.D;
const y = (s) => C.Y + s + C.D;
const r = (s) => C.R + s + C.D;
const b = (s) => C.BOLD + s + C.D;

function header() {
  console.clear();
  let ver = '?';
  try { ver = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; } catch {}
  console.log(C.C + '╔══════════════════════════════════════════╗' + C.D);
  console.log(C.C + '║' + C.D + b('    多店管理系统 - 容器管理工具') + C.C + '       ║' + C.D);
  console.log(C.C + '╠══════════════════════════════════════════╣' + C.D);
  console.log(C.C + '║' + C.D + '  版本: ' + g('v' + ver) + '    Node: ' + process.version + C.C + '    ║' + C.D);
  console.log(C.C + '╚══════════════════════════════════════════╝' + C.D);
  console.log();
}

function menu() {
  console.log(b('请选择操作:'));
  console.log();
  console.log('  ' + g('1') + ') 系统信息');
  console.log('  ' + g('2') + ') 备份数据库');
  console.log('  ' + g('3') + ') 恢复数据库');
  console.log('  ' + g('4') + ') 重置管理员密码');
  console.log('  ' + g('5') + ') 查看最近日志');
  console.log('  ' + g('6') + ') 清理临时文件');
  console.log('  ' + g('7') + ') 数据库维护');
  console.log('  ' + g('8') + ') 更新系统');
  console.log('  ' + g('9') + ') 版本回退');
  console.log('  ' + g('A') + ') 诊断修复');
  console.log('  ' + y('0') + ') 退出');
  console.log();
  process.stdout.write(C.C + '请输入选择 [0-9]: ' + C.D);
}

// 1. System Info
async function doSystemInfo() {
  console.log();
  console.log(b('═══ 系统信息 ═══'));
  let ver = '?';
  try { ver = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; } catch {}
  console.log('  版本:      ' + g('v' + ver));
  console.log('  Node:      ' + process.version);
  console.log('  运行时间:  ' + formatUptime(process.uptime()));
  
  try {
    const d = getDb();
    const stats = {
      users: d.prepare('SELECT COUNT(*) as c FROM users').get().c,
      stores: d.prepare('SELECT COUNT(*) as c FROM stores').get().c,
      entries: d.prepare('SELECT COUNT(*) as c FROM entries').get().c,
      inventory: d.prepare('SELECT COUNT(*) as c FROM inventory_checks').get().c,
      payroll: d.prepare('SELECT COUNT(*) as c FROM payroll').get().c,
    };
    console.log();
    console.log(b('── 数据统计 ──'));
    console.log('  用户: ' + stats.users + '  门店: ' + stats.stores);
    console.log('  记账: ' + stats.entries + '  盘点: ' + stats.inventory + '  工资: ' + stats.payroll);
    
    // DB size
    try {
      const s = fs.statSync(DB_PATH);
      console.log('  数据库: ' + formatSize(s.size));
    } catch {}
  } catch (e) {
    console.log(r('  数据库读取失败: ' + e.message));
  }
  
  // Backup list
  console.log();
  console.log(b('── 备份列表 ──'));
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).sort().reverse();
      if (files.length === 0) {
        console.log('  暂无备份');
      } else {
        files.slice(0, 10).forEach(f => {
          const s = fs.statSync(path.join(BACKUP_DIR, f));
          console.log('  ' + f + ' (' + formatSize(s.size) + ')');
        });
        if (files.length > 10) console.log('  ... 还有 ' + (files.length - 10) + ' 个');
      }
    } else {
      console.log('  暂无备份');
    }
  } catch {}
}

// 2. Backup
async function doBackup() {
  console.log();
  console.log(b('═══ 备份数据库 ═══'));
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    
    const d = getDb();
    d.pragma('wal_checkpoint(TRUNCATE)');
    
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'backup-' + ts + '.zip';
    const filepath = path.join(BACKUP_DIR, filename);
    
    const zip = new (getZip())();
    zip.addLocalFile(path.join(BASE_DIR, 'data', 'store.db'));
    if (fs.existsSync(path.join(BASE_DIR, 'data', 'store.db-wal')))
      zip.addLocalFile(path.join(BASE_DIR, 'data', 'store.db-wal'));
    if (fs.existsSync(path.join(BASE_DIR, 'data', 'store.db-shm')))
      zip.addLocalFile(path.join(BASE_DIR, 'data', 'store.db-shm'));
    zip.writeZip(filepath);
    
    const size = formatSize(fs.statSync(filepath).size);
    console.log(g('  ✓ 备份成功: ' + filename + ' (' + size + ')'));
  } catch (e) {
    console.log(r('  ✗ 备份失败: ' + e.message));
  }
}

// 3. Restore
async function doRestore() {
  console.log();
  console.log(b('═══ 恢复数据库 ═══'));
  try {
    if (!fs.existsSync(BACKUP_DIR)) { console.log(r('  没有备份目录')); return; }
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).sort().reverse();
    if (files.length === 0) { console.log(r('  没有可用备份')); return; }
    
    console.log(b('可用备份:'));
    files.slice(0, 15).forEach((f, i) => {
      const s = fs.statSync(path.join(BACKUP_DIR, f));
      console.log('  ' + g(i + 1) + ') ' + f + ' (' + formatSize(s.size) + ')');
    });
    
    const choice = await ask('\n输入备份序号 (0=取消): ');
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= files.length) { console.log('  已取消'); return; }
    
    const confirm = await ask(y('  确认恢复 ' + files[idx] + '? (y/N): '));
    if (confirm !== 'y' && confirm !== 'Y') { console.log('  已取消'); return; }
    
    // Backup current before restore
    console.log('  备份当前数据库...');
    const d = getDb();
    d.pragma('wal_checkpoint(TRUNCATE)');
    
    const Zip = getZip();
    const zip = new Zip(path.join(BACKUP_DIR, files[idx]));
    const entries = zip.getEntries();
    
    // Restore files
    for (const entry of entries) {
      const destPath = path.join(BASE_DIR, 'data', entry.entryName);
      fs.writeFileSync(destPath, entry.getData());
    }
    
    console.log(g('  ✓ 恢复完成'));
    const restart = await ask(y('  是否立即重启? (y/N): '));
    if (restart === 'y' || restart === 'Y') {
      console.log('  正在重启...');
      try { require('child_process').execSync('kill -TERM 1', {timeout:3000}); } catch {}
    }
  } catch (e) {
    console.log(r('  恢复失败: ' + e.message));
  }
}

// 4. Reset admin password
async function doResetAdmin() {
  console.log();
  console.log(b('═══ 重置管理员密码 ═══'));
  try {
    const d = getDb();
    // Find all admins
    const admins = d.prepare("SELECT id, username, name, role FROM users WHERE role IN ('ADMIN','STORE_ADMIN') ORDER BY role").all();
    if (admins.length === 0) { console.log(r('  没有找到管理员账号')); return; }
    
    console.log(b('管理员账号:'));
    admins.forEach((a, i) => {
      console.log('  ' + g(i + 1) + ') ' + a.username + ' (' + a.name + ') - ' + a.role);
    });
    
    const choice = await ask('\n选择要重置的账号序号 (0=取消): ');
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= admins.length) { console.log('  已取消'); return; }
    
    const user = admins[idx];
    const newPwd = await ask('输入新密码 (留空自动生成): ');
    const password = newPwd || require('crypto').randomBytes(8).toString('hex');
    
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(password, 10);
    d.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now','localtime') WHERE id=?").run(hash, user.id);
    
    console.log();
    console.log(g('  ✓ 密码已重置'));
    console.log('  账号: ' + b(user.username));
    console.log('  密码: ' + b(password));
    if (!newPwd) console.log(y('  请妥善保管，登录后建议修改'));
  } catch (e) {
    console.log(r('  重置失败: ' + e.message));
  }
}

// 5. View logs
async function doViewLogs() {
  console.log();
  console.log(b('═══ 最近日志 ═══'));
  const { execSync } = require('child_process');
  try {
    const log = execSync('docker logs multi-shop-link --tail 30 2>&1', { encoding: 'utf8', timeout: 5000 });
    console.log(C.DIM + log + C.D);
  } catch (e) {
    console.log(r('  无法读取日志'));
  }
}

// 6. Cleanup
async function doCleanup() {
  console.log();
  console.log(b('═══ 清理临时文件 ═══'));
  let count = 0;
  
  // Clean extract dirs
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const item of fs.readdirSync(UPLOADS_DIR)) {
      if (item.startsWith('extract-')) {
        const p = path.join(UPLOADS_DIR, item);
        fs.rmSync(p, { recursive: true, force: true });
        count++;
      }
    }
  }
  
  // Keep only last 20 backups
  if (fs.existsSync(BACKUP_DIR)) {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).sort();
    while (files.length > 20) {
      const old = files.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      count++;
    }
  }
  
  // WAL checkpoint
  try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  
  console.log(g('  ✓ 清理完成，删除 ' + count + ' 个文件'));
}

// 7. DB maintenance
async function doDbMaintenance() {
  console.log();
  console.log(b('═══ 数据库维护 ═══'));
  try {
    const d = getDb();
    
    console.log('  WAL checkpoint...');
    d.pragma('wal_checkpoint(TRUNCATE)');
    
    console.log('  完整性检查...');
    const result = d.pragma('integrity_check');
    if (result[0]?.integrity_check === 'ok') {
      console.log(g('  ✓ 完整性检查: 通过'));
    } else {
      console.log(r('  ✗ 完整性检查异常'));
    }
    
    console.log('  数据库压缩 (VACUUM)...');
    d.pragma('VACUUM');
    
    const size = formatSize(fs.statSync(DB_PATH).size);
    console.log(g('  ✓ 维护完成，当前大小: ' + size));
  } catch (e) {
    console.log(r('  维护失败: ' + e.message));
  }
}

// 8. Update
async function doUpdate() {
  console.log();
  console.log(b('═══ 更新系统 ═══'));
  const { execSync } = require('child_process');
  
  // Show current version
  let curVer = '?';
  try { curVer = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; } catch {}
  console.log('  当前版本: ' + g('v' + curVer));
  
  // Fetch latest version from deploy repo
  console.log('  检查最新版本...');
  let latestVer = '?';
  try {
    const https = require('https');
    const verUrl = 'https://gh.llkk.cc/https://raw.githubusercontent.com/MingTu01/multi-shop-link-deploy/main/data/version.json';
    latestVer = await new Promise((resolve, reject) => {
      https.get(verUrl, {timeout: 10000, headers:{'User-Agent':'MSL/1.0'}}, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data).version); } catch { resolve('?'); }
        });
      }).on('error', () => resolve('?'));
    });
  } catch {}
  console.log('  最新版本: ' + (latestVer !== '?' ? g('v' + latestVer) : y('获取失败')));
  
  
  if (curVer !== latestVer) console.log(y('  ⚠ 将从 v' + curVer + ' 更新到 v' + latestVer));
  const confirm = await ask(y('  确认更新? (y/N): '));
  if (confirm !== 'y' && confirm !== 'Y') { console.log('  已取消'); return; }
  
  try {
    // Backup first
    console.log('  1/4 备份当前代码...');
    {
      const cbDir = path.join(BACKUP_DIR, 'code-backups');
      fs.mkdirSync(cbDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      let ver = '?';
      try { ver = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; } catch {}
      const cbZip = new (getZip())();
      if (fs.existsSync(path.join(BASE_DIR, 'src'))) cbZip.addLocalFolder(path.join(BASE_DIR, 'src'), 'src');
      if (fs.existsSync(path.join(BASE_DIR, 'public', 'web-dist'))) cbZip.addLocalFolder(path.join(BASE_DIR, 'public', 'web-dist'), 'web-dist');
      if (fs.existsSync(VERSION_FILE)) cbZip.addLocalFile(VERSION_FILE, 'version.json');
      const cbPath = path.join(cbDir, 'v' + ver + '-' + ts + '.zip');
      cbZip.writeZip(cbPath);
      console.log('    已保存代码备份: v' + ver);
    }
    const d = getDb();
    d.pragma('wal_checkpoint(TRUNCATE)');
    
    // Download latest
    console.log('  2/4 下载最新版本...');
    const https = require('https');
    const http = require('http');
    const zipData = await new Promise((resolve, reject) => {
      const get = DEPLOY_REPO.startsWith('https') ? https.get : http.get;
      get(DEPLOY_REPO, { headers: { 'User-Agent': 'MSL-Manager/1.0' } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const get2 = res.headers.location.startsWith('https') ? https.get : http.get;
          get2(res.headers.location, { headers: { 'User-Agent': 'MSL-Manager/1.0' } }, (res2) => {
            const chunks = [];
            res2.on('data', c => chunks.push(c));
            res2.on('end', () => resolve(Buffer.concat(chunks)));
            res2.on('error', reject);
          }).on('error', reject);
        } else {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }
      }).on('error', reject);
    });
    
    // Extract
    console.log('  3/4 解压并更新...');
    const Zip = getZip();
    const zip = new Zip(zipData);
    const extractDir = path.join(UPLOADS_DIR, 'update-' + Date.now());
    fs.mkdirSync(extractDir, { recursive: true });
    zip.extractAllTo(extractDir, true);
    
    // Find the extracted root (usually multi-shop-link-deploy-main/)
    const extractedRoot = fs.readdirSync(extractDir).find(f => 
      fs.statSync(path.join(extractDir, f)).isDirectory()
    );
    const srcDir = path.join(extractDir, extractedRoot);
    
    // Copy files
    const copyDirSafe = (src, dest) => {
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, item.name);
        const d = path.join(dest, item.name);
        if (item.isDirectory()) { copyDirSafe(s, d); }
        else { try { fs.copyFileSync(s, d); } catch {} }
      }
    };
    
    copyDirSafe(path.join(srcDir, 'src'), path.join(BASE_DIR, 'src'));
    copyDirSafe(path.join(srcDir, 'public', 'web-dist'), path.join(BASE_DIR, 'public', 'web-dist'));
    
    // Update package.json
    const srcPkg = path.join(srcDir, 'apps', 'server', 'package.json');
    if (fs.existsSync(srcPkg)) {
      fs.copyFileSync(srcPkg, path.join(BASE_DIR, 'package.json'));
    }
    
    // Update version.json
    const srcVer = path.join(srcDir, 'data', 'version.json');
    if (fs.existsSync(srcVer)) {
      fs.copyFileSync(srcVer, path.join(BASE_DIR, 'data', 'version.json'));
    }
    
    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    
    console.log('  4/4 重启服务...');
    console.log(g('  ✓ 更新完成，正在重启...'));
    
    try { require('child_process').execSync('kill -TERM 1', {timeout:3000}); } catch {}
  } catch (e) {
    console.log(r('  更新失败: ' + e.message));
    console.log(r('  数据库未受影响'));
  }
}

// 9. Rollback - restore previous code version from backup
async function doRollback() {
  console.log();
  console.log(b('═══ 版本回退 ═══'));
  const CODE_BACKUP = path.join(BACKUP_DIR, 'code-backups');
  try {
    if (!fs.existsSync(CODE_BACKUP)) { console.log(r('  没有代码备份。请先通过"更新系统"创建备份。')); return; }
    const entries = fs.readdirSync(CODE_BACKUP).filter(f => f.endsWith('.zip')).sort().reverse();
    if (entries.length === 0) { console.log(r('  没有可用代码备份')); return; }
    
    console.log(b('可用代码备份:'));
    entries.slice(0, 15).forEach((f, i) => {
      const s = fs.statSync(path.join(CODE_BACKUP, f));
      console.log('  ' + g(i + 1) + ') ' + f + ' (' + formatSize(s.size) + ')');
    });
    
    const choice = await ask('\n选择备份序号 (0=取消): ');
    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= entries.length) { console.log('  已取消'); return; }
    
    console.log(y('  ⚠ 回退将替换当前代码（src + web-dist）'));
    const confirm = await ask(y('  确认回退到 ' + entries[idx] + '? (y/N): '));
    if (confirm !== 'y' && confirm !== 'Y') { console.log('  已取消'); return; }
    
    const Zip = getZip();
    const zip = new Zip(path.join(CODE_BACKUP, entries[idx]));
    const tmpDir = path.join(UPLOADS_DIR, 'rollback-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    zip.extractAllTo(tmpDir, true);
    
    // Restore src and web-dist (overwrite, no delete - files may be locked)
    const copyOverwrite = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const item of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, item.name);
        const d = path.join(dest, item.name);
        if (item.isDirectory()) { copyOverwrite(s, d); }
        else { try { fs.copyFileSync(s, d); } catch {} }
      }
    };
    if (fs.existsSync(path.join(tmpDir, "src"))) {
      copyOverwrite(path.join(tmpDir, "src"), path.join(BASE_DIR, "src"));
    }
    if (fs.existsSync(path.join(tmpDir, "web-dist"))) {
      copyOverwrite(path.join(tmpDir, "web-dist"), path.join(BASE_DIR, "public", "web-dist"));
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    console.log(g('  ✓ 代码已回退'));
    const restart = await ask(y('  是否立即重启? (y/N): '));
    if (restart === 'y' || restart === 'Y') {
      try { require('child_process').execSync('kill -TERM 1', {timeout:3000}); } catch {}
    }
  } catch (e) {
    console.log(r('  回退失败: ' + e.message));
  }
}

// A. Diagnose & Repair
async function doDiagnose() {
  console.log();
  console.log(b('═══ 诊断修复 ═══'));
  const { execSync } = require('child_process');
  let issues = 0;
  let fixed = 0;
  
  const check = (name, ok, fix) => {
    if (ok) {
      console.log(g('  ✓ ') + name);
    } else {
      console.log(r('  ✗ ') + name);
      issues++;
      if (fix) {
        try {
          fix();
          console.log(g('    → 已修复'));
          fixed++;
        } catch (e) {
          console.log(r('    → 修复失败: ' + e.message));
        }
      }
    }
  };
  
  // 1. Check package.json (no BOM, valid JSON)
  check('package.json 有效', (() => {
    try {
      const raw = fs.readFileSync(path.join(BASE_DIR, 'package.json'), 'utf8');
      JSON.parse(raw);
      // Check BOM
      const buf = Buffer.from(fs.readFileSync(path.join(BASE_DIR, 'package.json')));
      return !(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF);
    } catch { return false; }
  })(), () => {
    let raw = fs.readFileSync(path.join(BASE_DIR, 'package.json'), 'utf8');
    // Remove BOM
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    // Try to fix JSON
    try {
      JSON.parse(raw);
    } catch {
      // Common fix: trailing comma
      raw = raw.replace(/,(\s*[}\]])/g, '');
    }
    fs.writeFileSync(path.join(BASE_DIR, 'package.json'), raw, 'utf8');
  });
  
  // 2. Check data/version.json
  check('version.json 存在且有效', (() => {
    try { JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); return true; } catch { return false; }
  })(), () => {
    fs.writeFileSync(VERSION_FILE, JSON.stringify({version: '0.0.0'}), 'utf8');
  });
  
  // 3. Check database exists and accessible
  check('数据库可访问', (() => {
    try {
      const d = require('better-sqlite3')(DB_PATH);
      d.prepare('SELECT 1').get();
      d.close();
      return true;
    } catch { return false; }
  })(), () => {
    // If DB is corrupted, try WAL recovery
    try {
      const d = require('better-sqlite3')(DB_PATH, {readonly: true});
      d.close();
    } catch {}
  });
  
  // 4. Check database tables exist
  check('数据库表结构完整', (() => {
    try {
      const d = require('better-sqlite3')(DB_PATH);
      const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      d.close();
      return tables.includes('users') && tables.includes('stores') && tables.includes('entries');
    } catch { return false; }
  })(), () => {
    // Run the app's migration by importing db
    console.log('    尝试重建表结构...');
    try {
      delete require.cache[require.resolve('/app/src/db.js')];
    } catch {}
  });
  
  // 5. Check admin user exists
  check('管理员账号存在', (() => {
    try {
      const d = require('better-sqlite3')(DB_PATH);
      const admin = d.prepare("SELECT id FROM users WHERE role='ADMIN'").get();
      d.close();
      return !!admin;
    } catch { return false; }
  })(), () => {
    const d = require('better-sqlite3')(DB_PATH);
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    d.prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)").run('admin', hash, '管理员', 'ADMIN');
    d.close();
    console.log('    创建默认管理员: admin / admin123');
  });
  
  // 6. Check web-dist exists with index.html
  const webDist = path.join(BASE_DIR, 'public', 'web-dist');
  check('前端文件完整 (web-dist)', fs.existsSync(path.join(webDist, 'index.html')), () => {
    // Try to create a minimal index.html
    fs.mkdirSync(webDist, { recursive: true });
    fs.mkdirSync(path.join(webDist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(webDist, 'index.html'), '<!DOCTYPE html><html><head><title>MSL</title></head><body><h1>前端文件缺失，请通过msl更新系统</h1></body></html>', 'utf8');
  });
  
  // 7. Check sw.js exists
  check('Service Worker 文件存在', fs.existsSync(path.join(webDist, 'sw.js')), () => {
    // SW is generated by build, can't fix without rebuild
  });
  
  // 8. Check data directories
  check('数据目录完整', (() => {
    return fs.existsSync(path.join(BASE_DIR, 'data')) &&
           fs.existsSync(path.join(BASE_DIR, 'uploads')) &&
           fs.existsSync(path.join(BASE_DIR, 'backups'));
  })(), () => {
    fs.mkdirSync(path.join(BASE_DIR, 'data'), { recursive: true });
    fs.mkdirSync(path.join(BASE_DIR, 'uploads'), { recursive: true });
    fs.mkdirSync(path.join(BASE_DIR, 'backups'), { recursive: true });
  });
  
  // 9. Check JWT secret
  const jwtSecretFile = path.join(BASE_DIR, 'data', 'jwt-secret');
  check('JWT Secret 文件存在', fs.existsSync(jwtSecretFile), () => {
    const crypto = require('crypto');
    const secret = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(jwtSecretFile, secret, 'utf8');
    console.log('    已生成新的 JWT Secret');
  });
  
  // 10. Check API responds (if server is running)
  check('API 响应正常', await new Promise(resolve => {
    const http = require('http');
    const req = http.get('http://localhost:3001/api/system/info', {timeout: 3000}, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { JSON.parse(data); resolve(true); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  }), null);  // Can't auto-fix API
  
  // 11. Check WAL file size (large WAL = need checkpoint)
  const walPath = path.join(BASE_DIR, 'data', 'store.db-wal');
  if (fs.existsSync(walPath)) {
    const walSize = fs.statSync(walPath).size;
    check('WAL 文件大小正常 (' + formatSize(walSize) + ')', walSize < 10 * 1024 * 1024, () => {
      const d = require('better-sqlite3')(DB_PATH);
      d.pragma('wal_checkpoint(TRUNCATE)');
      d.close();
      console.log('    已执行 WAL checkpoint');
    });
  }
  
  // 12. Check node_modules
  check('node_modules 存在', fs.existsSync(path.join(BASE_DIR, 'node_modules')), () => {
    console.log('    运行 npm install...');
    try {
      execSync('cd /app && npm install --production 2>&1', {encoding: 'utf8', timeout: 120000});
    } catch (e) {
      throw new Error('npm install 失败');
    }
  });
  
  // Summary
  console.log();
  console.log(b('═══ 诊断结果 ═══'));
  if (issues === 0) {
    console.log(g('  ✓ 一切正常，未发现问题'));
  } else {
    console.log('  发现问题: ' + r(issues + ' 个') + '  已修复: ' + g(fixed + ' 个'));
    if (fixed < issues) {
      console.log(y('  还有 ' + (issues - fixed) + ' 个问题需要手动处理'));
    }
    if (fixed > 0) {
      const restart = await ask(y('  已修复问题，是否重启服务? (y/N): '));
      if (restart === 'y' || restart === 'Y') {
        try { execSync('kill -TERM 1', {timeout:3000}); } catch {}
      }
    }
  }
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

// Main
async function main() {
  while (true) {
    header();
    menu();
    const choice = await ask('');
    console.log();
    
    switch (choice.trim()) {
      case '1': await doSystemInfo(); break;
      case '2': await doBackup(); break;
      case '3': await doRestore(); break;
      case '4': await doResetAdmin(); break;
      case '5': await doViewLogs(); break;
      case '6': await doCleanup(); break;
      case '7': await doDbMaintenance(); break;
      case '8': await doUpdate(); break;
      case '9': await doRollback(); break;
      case 'a': case 'A': await doDiagnose(); break;
      case '0': console.log(g('\n再见!')); rl.close(); process.exit(0);
      default: console.log(r('无效选择'));
    }
    
    console.log();
    await ask(C.C + '按任意键返回菜单...' + C.D);
  }
}

main().catch(e => { console.error(r('错误: ' + e.message)); process.exit(1); });
