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

// --- Step 3: Start the application with crash recovery ---
console.log('');
console.log('[Startup] Starting application...');
console.log('');

let crashCount = 0;
let crashTimes = [];

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
      console.error('  Entering recovery mode...');
      console.error('  Type "msl" for management tools');
      console.error('========================================');
      console.error('');
      // Enter recovery mode - start msl.js interactively
      try {
        const recovery = spawn('node', ['/app/msl.js'], {
          stdio: 'inherit',
          env: { ...process.env }
        });
        recovery.on('exit', (c) => process.exit(c || 0));
      } catch (e) {
        console.error('[Recovery] Failed to start msl.js:', e.message);
        process.exit(1);
      }
    } else {
      console.log('[Startup] App exited unexpectedly (code: ' + code + '), restarting...');
      console.log('[Startup] Crash ' + crashCount + '/' + MAX_CRASHES + ' in window');
      setTimeout(startApp, 2000);
    }
  });
}

startApp();