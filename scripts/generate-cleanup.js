#!/usr/bin/env node
/**
 * generate-cleanup.js
 * 
 * 对比旧文件列表与新构建产物，生成 cleanup.json。
 * 在 CI 构建流程中，于删除旧文件之前记录文件列表，复制新文件之后运行此脚本。
 * 
 * 用法：
 *   node scripts/generate-cleanup.js <old-files-list> <new-web-dist-dir> <new-src-dir> <output-dir>
 * 
 * 参数：
 *   old-files-list   - 旧文件列表文件路径（每行一个相对路径）
 *   new-web-dist-dir - 新构建的 web-dist 目录路径
 *   new-src-dir      - 新的 server src 目录路径
 *   output-dir       - cleanup.json 输出目录
 */

const fs = require('fs');
const path = require('path');

const [,, oldListFile, newWebDistDir, newSrcDir, outputDir] = process.argv;

if (!oldListFile || !newWebDistDir || !newSrcDir || !outputDir) {
  console.error('Usage: node generate-cleanup.js <old-files-list> <new-web-dist-dir> <new-src-dir> <output-dir>');
  process.exit(1);
}

/** 递归获取目录下所有文件的相对路径 */
function listFiles(dir, relTo) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(full, relTo));
    } else {
      results.push(path.relative(relTo, full));
    }
  }
  return results;
}

try {
  // 1. 读取旧文件列表
  const oldFiles = fs.readFileSync(oldListFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  // 2. 获取新文件集合
  const newWebFiles = new Set(
    listFiles(newWebDistDir, newWebDistDir).map(f => 'public/web-dist/' + f)
  );
  const newSrcFiles = new Set(
    listFiles(newSrcDir, newSrcDir).map(f => 'src/' + f)
  );
  const allNewFiles = new Set([...newWebFiles, ...newSrcFiles]);

  // 3. 对比：旧文件中有，新文件中没有的
  const deleteFiles = oldFiles.filter(f => !allNewFiles.has(f));

  // 4. 生成 cleanup.json
  const cleanup = {
    version: new Date().toISOString().slice(0, 10),
    description: deleteFiles.length > 0
      ? `Auto-cleanup: ${deleteFiles.length} files removed`
      : 'No files to clean',
    deleteFiles: deleteFiles.sort(),
    deleteDirs: []
  };

  const outPath = path.join(outputDir, 'cleanup.json');
  fs.writeFileSync(outPath, JSON.stringify(cleanup, null, 2) + '\n', 'utf-8');

  console.log(`[cleanup] Generated cleanup.json: ${deleteFiles.length} files to delete`);
  deleteFiles.forEach(f => console.log(`  - ${f}`));

} catch (err) {
  console.error('[cleanup] Error:', err.message);
  // 生成空的 cleanup.json，不影响升级流程
  const outPath = path.join(outputDir, 'cleanup.json');
  fs.writeFileSync(outPath, JSON.stringify({
    version: 'error',
    description: 'Generation failed: ' + err.message,
    deleteFiles: [],
    deleteDirs: []
  }, null, 2) + '\n', 'utf-8');
}
