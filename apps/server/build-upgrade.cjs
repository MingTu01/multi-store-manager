#!/usr/bin/env node
/**
 * Multi Shop Link - 升级包打包脚本
 * 
 * 使用方法：
 *   cd apps/server
 *   node build-upgrade.cjs
 * 
 * 输出：
 *   multi-shop-link-upgrade-v{版本号}.zip
 */

const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '..', '..');

// 读取当前版本号
const versionFile = path.join(__dirname, 'data', 'version.json');
let version = '1.0.0';
try {
  const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
  version = versionData.version || '1.0.0';
} catch (e) {
  console.warn('Warning: Could not read version.json, using default version');
}

const zipName = `multi-shop-link-upgrade-v${version}.zip`;
const zipPath = path.join(base, zipName);

// 删除旧的升级包
try { fs.unlinkSync(zipPath); } catch(e) {}

const zip = new AdmZip();

// 排除规则
const excludeDirs = new Set([
  'node_modules', '.git', '_staging', '_zip_staging', 
  'uploads', 'backups'
]);

const excludeFiles = new Set([
  'pnpm-lock.yaml', 'build-zip.cjs', 'build-full.cjs', 'build-upgrade.cjs'
]);

// 排除的大文件（静态资源，极少变更）
const excludeLargeFiles = new Set([
  'chi_sim.traineddata',    // OCR中文模型 ~2.4MB
  'eng.traineddata',        // OCR英文模型 ~5MB
  'logo.png',               // 大尺寸logo ~1.1MB
  'logo-192.png',           // 192px logo ~20KB
  'logo-64.png',            // 64px logo ~4KB
  'mingtu-logo.png'         // 品牌logo ~4KB
]);

// 数据库文件后缀
const dbExtensions = new Set(['.db', '.db-wal', '.db-shm', '.db-journal']);

function addDir(dirPath, zipBase) {
  if (!fs.existsSync(dirPath)) return;
  
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    if (excludeDirs.has(item) || excludeFiles.has(item) || excludeLargeFiles.has(item)) {
      continue;
    }
    
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const entryPath = zipBase ? zipBase + '/' + item : item;
    
    if (stat.isDirectory()) {
      addDir(fullPath, entryPath);
    } else {
      // 排除数据库文件和构建缓存
      const ext = path.extname(item);
      if (dbExtensions.has(ext) || item.endsWith('.tsbuildinfo') || item.endsWith('.zip')) {
        continue;
      }
      zip.addLocalFile(fullPath, zipBase || '', item);
    }
  }
}

// 添加版本信息文件
const versionFiles = ['package.json', 'apps/server/package.json'];
for (const f of versionFiles) {
  const fp = path.join(base, f);
  if (fs.existsSync(fp)) {
    // Update version before adding
    try { const pkg = JSON.parse(fs.readFileSync(fp, "utf-8")); if (pkg.version !== version) { pkg.version = version; fs.writeFileSync(fp, JSON.stringify(pkg, null, 2) + "\n", "utf-8"); } } catch (e) {}
    zip.addLocalFile(fp, "", path.basename(f));
  }
}

// 添加服务端源码

// === 打包前验证: esbuild transform 检查所有 .ts 文件 ===
{
  const esbuild = require('esbuild');
  const srcDir = path.join(__dirname, 'src');
  let errorCount = 0;
  function checkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) { checkDir(fullPath); continue; }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      try {
        esbuild.transformSync(fs.readFileSync(fullPath, 'utf-8'), { loader: 'ts', target: 'node20' });
      } catch (e) {
        const rel = path.relative(__dirname, fullPath);
        console.error('  FAIL: ' + rel + ' - ' + (e.message || '').split('\n')[0]);
        errorCount++;
      }
    }
  }
  console.log('Validating source code with esbuild transform...');
  checkDir(srcDir);
  if (errorCount > 0) {
    console.error('\nERROR: ' + errorCount + ' file(s) have compilation errors. Fix them before packaging.');
    process.exit(1);
  }
  console.log('Validation PASSED - all .ts files compile OK\n');
}

console.log('Adding server source...');
addDir(path.join(__dirname, 'src'), 'server-src');

// 添加前端构建产物
console.log('Adding web dist...');
addDir(path.join(__dirname, 'public', 'web-dist'), 'web-dist');

// 添加前端构建产物（备份路径）
const webDistPath = path.join(base, 'apps', 'web', 'dist');
if (fs.existsSync(webDistPath)) {
  addDir(webDistPath, 'web-dist');
}

// 打包清理清单 cleanup.json
const cleanupJsonPath = path.join(__dirname, 'cleanup.json');
if (fs.existsSync(cleanupJsonPath)) {
  zip.addLocalFile(cleanupJsonPath, '', 'cleanup.json');
  console.log('  Added cleanup.json');
} else {
  console.warn('  Warning: cleanup.json not found');
}

// 打包后置脚本 post-upgrade.cjs
const postUpgradeScript = path.join(__dirname, 'post-upgrade.cjs');
if (fs.existsSync(postUpgradeScript)) {
  zip.addLocalFile(postUpgradeScript, '', 'post-upgrade.cjs');
  console.log('  Added post-upgrade.cjs');
} else {
  console.warn('  Warning: post-upgrade.cjs not found, skipping');
}

// 写入 ZIP
zip.writeZip(zipPath);

const stat = fs.statSync(zipPath);
const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

console.log('\n=== 升级包信息 ===');
console.log('文件名:', zipName);
console.log('版本: v' + version);
console.log('大小:', sizeMB, 'MB');
console.log('文件数:', new AdmZip(zipPath).getEntries().length);
console.log('\n升级包已生成:', zipPath);
