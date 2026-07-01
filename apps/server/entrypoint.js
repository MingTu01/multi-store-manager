#!/usr/bin/env node
/**
 * MSL Container Entrypoint (Node.js)
 * Replaces startup.sh to avoid BOM/CRLF corruption issues.
 * 
 * Flow:
 * 1. Run startup-check.js diagnostics
 * 2. Check and install dependencies if needed
 * 3. Start the main application
 * 4. If app crashes 3 times in 30s, enter recovery mode (msl.js)
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_DIR = '/app';
const MAX_CRASHES = 3;
const CRASH_WINDOW = 30000; // 30 seconds

// --- Step 1: Run startup diagnostics ---
console.log('');
console.log('========================================');
console.log('  MSL Container Starting...');
console.log('  Time: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
console.log('  TZ: ' + (process.env.TZ || 'not set'));
console.log('  Node: ' + process.version);
console.log('========================================');
console.log('');

// Ensure msl command exists
const mslBin = '/usr/local/bin/msl';
if (!fs.existsSync(mslBin)) {
  fs.writeFileSync(mslBin, '#!/bin/sh\nnode /app/msl.js\n', 'utf8');
  fs.chmodSync(mslBin, '755');
  console.log('[Startup] Created msl command');
}

// --- Step 0: 同步 web-dist（解决 Docker volume 缓存旧前端文件问题）---
// 镜像构建时备份了 /app/web-dist-seed，每次启动比较 seed 和 volume 里的 index.html
// 不一致说明镜像更新了但 volume 还是旧文件，自动用 seed 覆盖
// 用 Node.js fs API，避免 shell glob 不展开的问题
function rmrfDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
      else fs.unlinkSync(target);
    } catch (e) {
      console.log('[Startup] 清理失败:', entry.name, e.message);
    }
  }
}
function cpDirContents(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      cpDirContents(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
const seedDir = '/app/web-dist-seed';
const webDistDir = '/app/public/web-dist';

// 校验 web-dist 完整性：index.html 存在 + index.html 引用的主 bundle 文件都真实存在
// 任何一个缺失都说明 volume 被旧文件污染，需要强制从 seed 同步
function checkWebDistIntegrity(dir) {
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: 'index.html 不存在' };
  }
  let indexContent = '';
  try {
    indexContent = fs.readFileSync(indexPath, 'utf8');
  } catch (e) {
    return { ok: false, reason: 'index.html 读取失败: ' + e.message };
  }
  // 提取所有 assets/*.js 引用，验证主 bundle 是否存在
  const refs = indexContent.match(/assets\/[A-Za-z0-9_.\-]+\.js/g) || [];
  if (refs.length === 0) {
    return { ok: false, reason: 'index.html 未引用任何 JS bundle' };
  }
  for (const ref of refs) {
    const refPath = path.join(dir, ref);
    if (!fs.existsSync(refPath)) {
      return { ok: false, reason: '引用的文件不存在: ' + ref };
    }
  }
  return { ok: true, refs: refs.length };
}

if (fs.existsSync(seedDir) && fs.existsSync(path.join(seedDir, 'index.html'))) {
  try {
    const seedIndex = fs.readFileSync(path.join(seedDir, 'index.html'), 'utf8');
    let volIndex = '';
    try { volIndex = fs.readFileSync(path.join(webDistDir, 'index.html'), 'utf8'); } catch {}

    // 双重校验：index.html 内容一致 + volume 引用的文件都真实存在
    const volCheck = checkWebDistIntegrity(webDistDir);
    const needSync = (seedIndex !== volIndex) || !volCheck.ok;

    if (needSync) {
      console.log('[Startup] 检测到 web-dist 需要同步，原因:', !volCheck.ok ? volCheck.reason : 'index.html 内容不一致');
      console.log('[Startup] seed index.html:', seedIndex.length, 'bytes');
      console.log('[Startup] volume index.html:', volIndex ? (volIndex.length + ' bytes') : '不存在');
      // 1. 清空 volume 里的旧文件
      rmrfDirContents(webDistDir);
      console.log('[Startup] 旧文件已清空');
      // 2. 从 seed 拷贝新文件
      cpDirContents(seedDir, webDistDir);
      console.log('[Startup] 新文件已拷贝');
      // 3. 验证
      const afterCheck = checkWebDistIntegrity(webDistDir);
      if (afterCheck.ok) {
        console.log('[Startup] web-dist 已从镜像同步完成，校验通过 (' + afterCheck.refs + ' 个 JS 引用)');
      } else {
        console.error('[Startup] ERROR: 同步后校验失败: ' + afterCheck.reason);
      }
    } else {
      console.log('[Startup] web-dist 完整性校验通过 (' + volCheck.refs + ' 个 JS 引用)，跳过同步');
    }
  } catch (e) {
    console.error('[Startup] web-dist 同步检查失败:', e.message);
  }
} else {
  console.log('[Startup] web-dist-seed 不存在，跳过同步（旧版镜像兼容）');
}

// --- Step 0.5: 同步 src（解决容器 down/up 后 src 回退到镜像旧版本问题）---
// src-seed 放在 /app/data/src-seed（命名 volume，持久化），不在镜像层
// 原因：如果 src-seed 在镜像层，容器 down/up 后会与 src 一起回退，无法起到恢复作用
// 工作流程：
//   首次启动：data/src-seed 不存在 → 用当前镜像 src 初始化
//   在线升级：system.ts syncSrcSeed 把新 src 复制到 data/src-seed → src 也更新 → 一致
//   容器 down/up：src 回退到镜像版本，data/src-seed 保留升级后版本 → 不一致 → 从 data/src-seed 恢复
const srcSeedDir = '/app/data/src-seed';
const srcDir = '/app/src';

function readDataVersion() {
  // 读取 /app/data/version.json（升级时由 system.ts 更新为最新版本）
  const verFile = path.join('/app/data', 'version.json');
  if (fs.existsSync(verFile)) {
    try {
      const v = JSON.parse(fs.readFileSync(verFile, 'utf8'));
      return v.version || '';
    } catch {}
  }
  return '';
}

function checkSrcIntegrity(dir) {
  // 校验 src 目录完整性：关键入口文件必须存在
  const indexPath = path.join(dir, 'index.ts');
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: 'src/index.ts 不存在' };
  }
  const dbPath = path.join(dir, 'db.ts');
  if (!fs.existsSync(dbPath)) {
    return { ok: false, reason: 'src/db.ts 不存在' };
  }
  const appPath = path.join(dir, 'app.ts');
  if (!fs.existsSync(appPath)) {
    return { ok: false, reason: 'src/app.ts 不存在' };
  }
  return { ok: true };
}

function syncSrcFromSeed() {
  console.log('[Startup] 开始从 data/src-seed 同步 src...');
  // 1. 清空当前 src
  rmrfDirContents(srcDir);
  console.log('[Startup] 旧 src 已清空');
  // 2. 从 seed 拷贝
  cpDirContents(srcSeedDir, srcDir);
  console.log('[Startup] 新 src 已拷贝');
  // 3. 验证
  const afterCheck = checkSrcIntegrity(srcDir);
  if (afterCheck.ok) {
    console.log('[Startup] src 已从 data/src-seed 同步完成，校验通过');
  } else {
    console.error('[Startup] ERROR: src 同步后校验失败: ' + afterCheck.reason);
  }
}

function initSrcSeed() {
  // 首次启动：用当前镜像 src 初始化 data/src-seed
  console.log('[Startup] 首次启动，初始化 data/src-seed（从镜像 src 复制）');
  try {
    fs.mkdirSync(srcSeedDir, { recursive: true });
    cpDirContents(srcDir, srcSeedDir);
    // 写入版本标记
    const ver = readDataVersion();
    fs.writeFileSync(path.join(srcSeedDir, 'version.json'), JSON.stringify({ version: ver, syncedAt: new Date().toISOString(), source: 'image-init' }, null, 2));
    console.log('[Startup] data/src-seed 初始化完成，版本:', ver);
  } catch (e) {
    console.error('[Startup] data/src-seed 初始化失败:', e.message);
  }
}

// 主同步逻辑
if (fs.existsSync(srcDir) && existsSync(path.join(srcDir, 'index.ts'))) {
  // 确保 data 目录存在（volume mount）
  if (!fs.existsSync('/app/data')) {
    fs.mkdirSync('/app/data', { recursive: true });
  }

  if (!fs.existsSync(srcSeedDir) || !fs.existsSync(path.join(srcSeedDir, 'index.ts'))) {
    // 首次启动：data/src-seed 不存在，用镜像 src 初始化
    initSrcSeed();
  } else {
    // data/src-seed 已存在，检查是否需要同步
    try {
      const srcCheck = checkSrcIntegrity(srcDir);
      let needSync = false;
      let syncReason = '';

      if (!srcCheck.ok) {
        // src 完整性校验失败（关键文件缺失）→ 必须从 seed 恢复
        needSync = true;
        syncReason = 'src 完整性校验失败: ' + srcCheck.reason;
      } else {
        // 比较 src-seed/index.ts 和 src/index.ts 的内容
        // 如果不一致，说明容器 down/up 后 src 回退到了镜像版本，而 src-seed 保存的是最新升级版本
        const seedIndexContent = fs.readFileSync(path.join(srcSeedDir, 'index.ts'), 'utf8');
        const srcIndexContent = fs.readFileSync(path.join(srcDir, 'index.ts'), 'utf8');
        if (seedIndexContent !== srcIndexContent) {
          needSync = true;
          syncReason = 'src 与 data/src-seed 内容不一致（容器可能 down/up 过，src 回退到镜像版本）';
        }
      }

      // 读取版本信息用于日志
      let seedVersion = '';
      try { seedVersion = JSON.parse(fs.readFileSync(path.join(srcSeedDir, 'version.json'), 'utf8')).version || ''; } catch {}
      const dataVersion = readDataVersion();

      if (needSync) {
        console.log('[Startup] 检测到 src 需要同步，原因:', syncReason);
        if (seedVersion) console.log('[Startup] data/src-seed 版本:', seedVersion);
        if (dataVersion) console.log('[Startup] data/version.json 版本:', dataVersion);
        syncSrcFromSeed();
      } else {
        console.log('[Startup] src 完整性校验通过，与 data/src-seed 一致，跳过同步' + (seedVersion ? '（版本: ' + seedVersion + '）' : ''));
      }
    } catch (e) {
      console.error('[Startup] src 同步检查失败:', e.message);
    }
  }
} else {
  console.log('[Startup] src 目录不存在或缺少 index.ts，跳过同步');
}

// Run startup-check.js
console.log('[Startup] Running diagnostic checks...');
try {
  execSync('node /app/startup-check.js', { stdio: 'inherit', timeout: 30000 });
} catch (e) {
  console.error('[Startup] Diagnostic check failed (non-fatal):', e.message);
}

// --- Step 2: Check dependencies ---
const NEED_INSTALL = (() => {
  const nm = path.join(BASE_DIR, 'node_modules');
  if (!fs.existsSync(nm)) return true;
  const critical = ['tsx', 'express', 'better-sqlite3', 'sanitize-html'];
  for (const pkg of critical) {
    if (!fs.existsSync(path.join(nm, pkg))) {
      console.log('[Startup] Critical dependency missing: ' + pkg);
      return true;
    }
  }
  return false;
})();

if (NEED_INSTALL) {
  console.log('[Startup] Running npm install...');
  try {
    execSync('npm install --registry=https://registry.npmmirror.com', {
      cwd: BASE_DIR, stdio: 'inherit', timeout: 120000
    });
    console.log('[Startup] npm install completed');
  } catch (e) {
    console.error('[Startup] npm install failed:', e.message);
  }
} else {
  console.log('[Startup] node_modules OK, skipping npm install');
}

// --- Step 3: Start the application with crash recovery + auto-rollback ---
console.log('');
console.log('[Startup] Starting application...');
console.log('');

let crashCount = 0;
let crashTimes = [];
let rollbackAttempted = false;

// 自动回滚：从 backups/code-backups 找最近的 pre-upgrade-*.zip 恢复
function attemptAutoRollback() {
  if (rollbackAttempted) return false; // 只回滚一次
  rollbackAttempted = true;
  const backupDir = path.join(BASE_DIR, 'backups', 'code-backups');
  if (!fs.existsSync(backupDir)) {
    console.error('[Rollback] No code-backups directory');
    return false;
  }
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('pre-upgrade-') && f.endsWith('.zip'))
    .sort().reverse();
  if (backups.length === 0) {
    console.error('[Rollback] No pre-upgrade backup found');
    return false;
  }
  const latest = backups[0];
  const zipPath = path.join(backupDir, latest);
  console.error('[Rollback] Restoring from backup:', latest);
  try {
    // 用 AdmZip 解压并恢复 src 和 web-dist
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    // 恢复 src
    if (zip.getEntry('src/') || zip.getEntries().some(e => e.entryName.startsWith('src/'))) {
      const srcDir = path.join(BASE_DIR, 'src');
      // 清空旧 src
      try { execSync('rm -rf ' + srcDir + '/*', { stdio: 'pipe' }); } catch {}
      zip.extractEntryTo('src/', BASE_DIR, false, false);
      console.error('[Rollback] src restored');
    }
    // 恢复 web-dist
    if (zip.getEntries().some(e => e.entryName.startsWith('web-dist/'))) {
      const webDistDir = path.join(BASE_DIR, 'public', 'web-dist');
      try { execSync('rm -rf ' + webDistDir + '/*', { stdio: 'pipe' }); } catch {}
      zip.extractEntryTo('web-dist/', path.join(BASE_DIR, 'public'), false, false);
      console.error('[Rollback] web-dist restored');
    }
    // 恢复 package.json
    const pkgEntry = zip.getEntry('package.json');
    if (pkgEntry) {
      fs.writeFileSync(path.join(BASE_DIR, 'package.json'), pkgEntry.getData().toString('utf8'));
      console.error('[Rollback] package.json restored');
    }
    // 重新 npm install
    try {
      execSync('npm install --omit=dev --ignore-scripts', { cwd: BASE_DIR, stdio: 'pipe', timeout: 120000 });
      console.error('[Rollback] npm install completed');
    } catch (e) {
      console.error('[Rollback] npm install failed:', e.message);
    }
    console.error('[Rollback] Restore complete, restarting...');
    return true;
  } catch (e) {
    console.error('[Rollback] Failed:', e.message);
    return false;
  }
}

function startApp() {
  const child = spawn('node', ['--import', 'tsx', 'src/index.ts'], {
    cwd: BASE_DIR,
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('exit', (code, signal) => {
    const now = Date.now();
    crashTimes.push(now);
    // Keep only crashes within the window
    crashTimes = crashTimes.filter(t => now - t < CRASH_WINDOW);
    crashCount = crashTimes.length;

    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      // Normal shutdown
      console.log('[Startup] Application stopped (signal: ' + signal + ')');
      process.exit(0);
    }

    if (crashCount >= MAX_CRASHES) {
      console.error('');
      console.error('========================================');
      console.error('  APPLICATION CRASHED ' + crashCount + ' TIMES');
      console.error('  Attempting auto-rollback...');
      console.error('========================================');
      console.error('');
      // 尝试自动回滚
      const rolledBack = attemptAutoRollback();
      if (rolledBack) {
        // 回滚成功，重置计数，重启
        crashTimes = [];
        crashCount = 0;
        setTimeout(startApp, 3000);
      } else {
        console.error('  Auto-rollback failed or no backup available');
        console.error('  Waiting 60s before retry...');
        console.error('  Use "docker exec -it <container> node /app/msl.js" for recovery');
        // Sleep 60s then retry (avoids tight crash loop)
        setTimeout(() => { crashTimes = []; crashCount = 0; startApp(); }, 60000);
      }
    } else {
      console.log('[Startup] App exited unexpectedly (code: ' + code + '), restarting...');
      console.log('[Startup] Crash ' + crashCount + '/' + MAX_CRASHES + ' in window');
      setTimeout(startApp, 2000);
    }
  });
}

startApp();