#!/usr/bin/env node
/**
 * Multi Shop Link - 升级后置脚本
 * 
 * 升级完成后自动执行，负责：
 * 1. 安装/更新 npm 依赖
 * 2. 清理临时文件
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_DIR = process.cwd();

console.log('[PostUpgrade] Starting post-upgrade tasks...');
console.log('[PostUpgrade] BASE_DIR:', BASE_DIR);

// 1. 安装 npm 依赖 — 按优先级查找 package.json
console.log('[PostUpgrade] Installing npm dependencies...');
try {
  const candidates = [
    path.join(BASE_DIR, 'package.json'),                    // Docker: /app/package.json
    path.join(BASE_DIR, 'apps', 'server', 'package.json'),  // Monorepo: apps/server/package.json
  ];
  
  let installDir = null;
  for (const pkgPath of candidates) {
    if (fs.existsSync(pkgPath)) {
      installDir = path.dirname(pkgPath);
      console.log('[PostUpgrade] Found package.json at:', pkgPath);
      break;
    }
  }
  
  if (installDir) {
    try {
      execSync('npm install --omit=dev', { 
        cwd: installDir, 
        timeout: 180000, 
        stdio: 'pipe' 
      });
      console.log('[PostUpgrade] npm install completed in:', installDir);
    } catch (e) {
      console.warn('[PostUpgrade] Full npm install failed, trying individual packages...');
      try {
        execSync('npm install @alicloud/ocr-api20210707 @alicloud/openapi-core --omit=dev', {
          cwd: installDir,
          timeout: 120000,
          stdio: 'pipe'
        });
        console.log('[PostUpgrade] Individual package install completed');
      } catch (e2) {
        console.error('[PostUpgrade] Individual install also failed:', e2.message);
      }
    }
  } else {
    console.warn('[PostUpgrade] No package.json found, skipping npm install');
  }
} catch (e) {
  console.warn('[PostUpgrade] npm install failed (non-fatal):', e.message);
}

// 2. 清理临时文件
console.log('[PostUpgrade] Cleaning up temporary files...');
try {
  const uploadsDir = path.join(BASE_DIR, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    const items = fs.readdirSync(uploadsDir);
    for (const item of items) {
      if (item.startsWith('extract-')) {
        const extractPath = path.join(uploadsDir, item);
        try {
          fs.rmSync(extractPath, { recursive: true, force: true });
          console.log('[PostUpgrade] Cleaned up:', item);
        } catch {}
      }
    }
  }
} catch (e) {
  console.warn('[PostUpgrade] Cleanup failed:', e.message);
}

// 3. 删除已废弃的 tesseract 模型文件（如果存在）
try {
  const tessFiles = ['chi_sim.traineddata', 'eng.traineddata'];
  for (const f of tessFiles) {
    const fp = path.join(BASE_DIR, f);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log('[PostUpgrade] Removed obsolete file:', f);
    }
  }
} catch {}

console.log('[PostUpgrade] All post-upgrade tasks completed');