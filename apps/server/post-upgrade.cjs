#!/usr/bin/env node
/**
 * Multi Shop Link - 升级后置脚本
 * 
 * 升级完成后自动执行，负责：
 * 1. 安装/更新 npm 依赖
 * 2. 清理临时文件
 * 3. 其他升级后的收尾工作
 * 
 * 此文件会被打包到升级包中，由 system.ts 升级逻辑自动调用
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_DIR = process.cwd();
const SERVER_DIR = path.join(BASE_DIR, 'apps', 'server');

console.log('[PostUpgrade] Starting post-upgrade tasks...');

// 1. 安装 npm 依赖
console.log('[PostUpgrade] Installing npm dependencies...');
try {
  // 检查 package.json 是否存在
  const pkgPath = path.join(SERVER_DIR, 'package.json');
  if (fs.existsSync(pkgPath)) {
    execSync('npm install --production', { 
      cwd: SERVER_DIR, 
      timeout: 120000, 
      stdio: 'pipe' 
    });
    console.log('[PostUpgrade] npm install completed');
  } else {
    // 如果 apps/server/package.json 不存在，尝试根目录
    const rootPkg = path.join(BASE_DIR, 'package.json');
    if (fs.existsSync(rootPkg)) {
      execSync('npm install --production', { 
        cwd: BASE_DIR, 
        timeout: 120000, 
        stdio: 'pipe' 
      });
      console.log('[PostUpgrade] npm install completed (root)');
    }
  }
} catch (e) {
  console.warn('[PostUpgrade] npm install failed (non-fatal):', e.message);
  // 不抛出异常，升级不应因 npm install 失败而中断
}

// 2. 清理可能残留的临时文件
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

console.log('[PostUpgrade] All post-upgrade tasks completed');
