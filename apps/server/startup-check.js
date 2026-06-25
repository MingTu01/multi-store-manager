#!/usr/bin/env node
/**
 * MSL Startup Diagnostic & Auto-Repair
 * Runs automatically before application starts in Docker container.
 * Non-interactive: auto-fixes issues and logs results.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = '/app';
const DB_PATH = path.join(BASE_DIR, 'data', 'store.db');
const VERSION_FILE = path.join(BASE_DIR, 'data', 'version.json');
const BACKUP_DIR = path.join(BASE_DIR, 'backups');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');

// Colors
const C = {
  R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', B: '\x1b[34m',
  C: '\x1b[36m', D: '\x1b[0m', BOLD: '\x1b[1m',
};
const ok = (s) => console.log(C.G + '  [OK] ' + C.D + s);
const warn = (s) => console.log(C.Y + '  [WARN] ' + C.D + s);
const fail = (s) => console.log(C.R + '  [FAIL] ' + C.D + s);
const fix = (s) => console.log(C.G + '    -> ' + C.D + s);
const info = (s) => console.log(C.C + '  [INFO] ' + C.D + s);

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function getDbSafe() {
  try {
    const d = require('better-sqlite3')(DB_PATH);
    d.prepare('SELECT 1').get();
    return d;
  } catch { return null; }
}

async function runChecks() {
  console.log('');
  console.log(C.C + C.BOLD + '========================================' + C.D);
  console.log(C.C + C.BOLD + '   MSL Startup Diagnostic' + C.D);
  console.log(C.C + C.BOLD + '========================================' + C.D);
  console.log('');

  let issues = 0;
  let fixed = 0;

  // --- 1. package.json validity ---
  const pkgPath = path.join(BASE_DIR, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const buf = Buffer.from(raw);
    const hasBOM = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    JSON.parse(hasBOM ? raw.slice(1) : raw);
    if (hasBOM) {
      fail('package.json has BOM');
      issues++;
      fs.writeFileSync(pkgPath, raw.slice(1), 'utf8');
      fix('Removed BOM from package.json');
      fixed++;
    } else {
      ok('package.json valid');
    }
  } catch (e) {
    fail('package.json invalid: ' + e.message);
    issues++;
    try {
      let raw = fs.readFileSync(pkgPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      raw = raw.replace(/,(\s*[}\]])/g, '');
      JSON.parse(raw);
      fs.writeFileSync(pkgPath, raw, 'utf8');
      fix('Fixed package.json format');
      fixed++;
    } catch (e2) {
      fail('Cannot auto-fix package.json: ' + e2.message);
    }
  }

  // --- 2. version.json ---
  try {
    const v = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    ok('version.json: v' + v.version);
  } catch {
    fail('version.json missing or invalid');
    issues++;
    fs.mkdirSync(path.dirname(VERSION_FILE), { recursive: true });
    fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: '0.0.0' }), 'utf8');
    fix('Created default version.json');
    fixed++;
  }

  // --- 3. Data directories ---
  const dirs = ['data', 'uploads', 'backups'];
  for (const d of dirs) {
    const p = path.join(BASE_DIR, d);
    if (!fs.existsSync(p)) {
      fail('Missing directory: ' + d);
      issues++;
      fs.mkdirSync(p, { recursive: true });
      fix('Created ' + d);
      fixed++;
    } else {
      ok('Directory exists: ' + d);
    }
  }

  // --- 4. Database accessibility ---
  let db = getDbSafe();
  if (db) {
    ok('Database accessible');
  } else {
    fail('Database NOT accessible');
    issues++;
    // Try WAL recovery
    try {
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';
      if (fs.existsSync(walPath)) {
        info('WAL file exists, attempting recovery...');
        // Copy WAL aside and try again
        fs.copyFileSync(walPath, walPath + '.bak');
      }
      db = getDbSafe();
      if (db) {
        fix('Database recovered after WAL backup');
        fixed++;
      } else {
        fail('Database unrecoverable');
      }
    } catch (e) {
      fail('Recovery failed: ' + e.message);
    }
  }

  // --- 5. Database table structure ---
  if (db) {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      const required = ['users', 'stores', 'entries', 'categories'];
      const missing = required.filter(t => !tables.includes(t));
      if (missing.length === 0) {
        ok('Database tables complete (' + tables.length + ' tables)');
      } else {
        fail('Missing tables: ' + missing.join(', '));
        issues++;
        // Note: can't auto-create tables without schema, just warn
        warn('Tables need to be created by application startup');
      }
    } catch (e) {
      fail('Cannot check tables: ' + e.message);
      issues++;
    }
  }

  // --- 6. Admin user ---
  if (db) {
    try {
      const admin = db.prepare("SELECT id, username, role FROM users WHERE role='ADMIN'").get();
      if (admin) {
        ok('Admin user exists: ' + admin.username + ' (id:' + admin.id + ')');
      } else {
        fail('No admin user found');
        issues++;
        try {
          const bcrypt = require('bcryptjs');
          const hash = bcrypt.hashSync('admin123', 10);
          db.prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)").run('admin', hash, '管理员', 'ADMIN');
          fix('Created default admin: admin / admin123');
          fixed++;
        } catch (e) {
          fail('Cannot create admin: ' + e.message);
        }
      }
    } catch (e) {
      fail('Cannot check admin: ' + e.message);
      issues++;
    }
  }

  // --- 7. JWT Secret ---
  const jwtSecretFile = path.join(BASE_DIR, 'data', 'jwt-secret');
  if (fs.existsSync(jwtSecretFile)) {
    const secret = fs.readFileSync(jwtSecretFile, 'utf8').trim();
    if (secret.length >= 32) {
      ok('JWT Secret exists (' + secret.length + ' chars)');
    } else {
      fail('JWT Secret too short (' + secret.length + ' chars)');
      issues++;
      const crypto = require('crypto');
      fs.writeFileSync(jwtSecretFile, crypto.randomBytes(64).toString('hex'), 'utf8');
      fix('Regenerated JWT Secret (128 chars)');
      fixed++;
    }
  } else {
    fail('JWT Secret file missing');
    issues++;
    const crypto = require('crypto');
    fs.writeFileSync(jwtSecretFile, crypto.randomBytes(64).toString('hex'), 'utf8');
    fix('Generated JWT Secret');
    fixed++;
  }

  // --- 8. Frontend files ---
  const webDist = path.join(BASE_DIR, 'public', 'web-dist');
  const indexHtml = path.join(webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    const match = html.match(/index-[A-Za-z0-9_-]+\.js/);
    ok('Frontend index.html present (ref: ' + (match ? match[0] : 'unknown') + ')');
    // Check if referenced JS file exists
    if (match) {
      const jsPath = path.join(webDist, 'assets', match[0]);
      if (fs.existsSync(jsPath)) {
        ok('Main JS bundle exists: ' + match[0]);
      } else {
        fail('Main JS bundle MISSING: ' + match[0]);
        issues++;
      }
    }
  } else {
    fail('Frontend index.html MISSING');
    issues++;
  }

  // --- 9. Service Worker ---
  if (fs.existsSync(path.join(webDist, 'sw.js'))) {
    ok('Service Worker (sw.js) exists');
  } else {
    warn('Service Worker (sw.js) missing');
    issues++;
  }

  // --- 10. WAL checkpoint ---
  const walPath = path.join(BASE_DIR, 'data', 'store.db-wal');
  if (fs.existsSync(walPath)) {
    const walSize = fs.statSync(walPath).size;
    if (walSize > 10 * 1024 * 1024) {
      warn('WAL file large: ' + formatSize(walSize));
      issues++;
      if (db) {
        try {
          db.pragma('wal_checkpoint(TRUNCATE)');
          fix('WAL checkpoint executed');
          fixed++;
        } catch {}
      }
    } else {
      ok('WAL file size OK: ' + formatSize(walSize));
    }
  }

  // --- 11. node_modules ---
  if (fs.existsSync(path.join(BASE_DIR, 'node_modules'))) {
    ok('node_modules exists');
  } else {
    fail('node_modules missing');
    issues++;
    info('Will be installed by startup script');
  }

  // --- 12. Environment variables ---
  const envChecks = [
    { name: 'NODE_ENV', value: process.env.NODE_ENV, required: true },
    { name: 'PORT', value: process.env.PORT, required: false },
    { name: 'JWT_SECRET', value: process.env.JWT_SECRET ? '***set***' : undefined, required: true },
  ];
  for (const ec of envChecks) {
    if (ec.value) {
      ok('ENV ' + ec.name + ' = ' + ec.value);
    } else if (ec.required) {
      warn('ENV ' + ec.name + ' not set');
    }
  }

  // --- 13. Database stats ---
  if (db) {
    try {
      const stats = {
        users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
        stores: db.prepare('SELECT COUNT(*) as c FROM stores').get().c,
        entries: db.prepare('SELECT COUNT(*) as c FROM entries').get().c,
      };
      info('Data: ' + stats.users + ' users, ' + stats.stores + ' stores, ' + stats.entries + ' entries');
    } catch {}
  }

  // --- 14. Disk space ---
  try {
    const df = execSync("df -h /app 2>/dev/null | tail -1 | awk '{print $2, $3, $4, $5}'", { encoding: 'utf8', timeout: 5000 }).trim();
    if (df) info('Disk: ' + df);
  } catch {}

  // --- Close db ---
  if (db) {
    try { db.close(); } catch {}
  }

  // --- Summary ---
  console.log('');
  console.log(C.C + C.BOLD + '========================================' + C.D);
  if (issues === 0) {
    console.log(C.G + C.BOLD + '   All checks passed!' + C.D);
  } else {
    console.log(C.Y + C.BOLD + '   Issues: ' + issues + '  Fixed: ' + fixed + C.D);
    if (fixed < issues) {
      console.log(C.Y + '   Remaining: ' + (issues - fixed) + ' (manual attention needed)' + C.D);
    }
  }
  console.log(C.C + C.BOLD + '========================================' + C.D);
  console.log('');
}

// Run
runChecks().catch(e => {
  console.error('[Startup Check] Error:', e.message);
  process.exit(0); // Don't block startup on check failure
});
