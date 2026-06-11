const AdmZip = require('adm-zip');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Administrator/Documents/6666';
const SERVER_DIR = path.join(ROOT, 'apps/server');
const WEB_DIR = path.join(ROOT, 'apps/web');

// Read version
const versionFile = path.join(SERVER_DIR, 'data/version.json');
let version = 'v0.0.0';
let notes = '';
if (fs.existsSync(versionFile)) {
  const v = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
  version = v.version || 'v0.0.0';
  notes = v.notes || '';
}
console.log('Building upgrade package for ' + version);

// Step 1: Build frontend
console.log('\n[1/3] Building frontend...');
execSync('cd ' + WEB_DIR + ' && Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue && npx vite build', { stdio: 'inherit' });

// Step 2: Create ZIP
console.log('\n[2/3] Creating ZIP...');
const zip = new AdmZip();

// Add web-dist
const webDist = path.join(WEB_DIR, 'dist');
if (fs.existsSync(webDist)) {
  zip.addLocalFolder(webDist, 'web-dist');
  console.log('  Added web-dist/');
} else {
  console.error('  ERROR: web-dist not found!');
  process.exit(1);
}

// Add server-src (exclude node_modules, data, backups, uploads, logs)
const serverSrc = path.join(SERVER_DIR, 'src');
zip.addLocalFolder(serverSrc, 'server-src', (filename) => {
  return !filename.includes('node_modules');
});
console.log('  Added server-src/');

// Add package.json with version
const pkg = { version: version.replace('v', ''), notes: notes, buildDate: new Date().toISOString() };
const pkgJson = JSON.stringify(pkg, null, 2);
zip.addFile('package.json', Buffer.from(pkgJson, 'utf8'));
console.log('  Added package.json');

// Step 3: Save ZIP
const zipName = 'upgrade-' + version + '.zip';
const zipPath = path.join(ROOT, zipName);
// Remove old zip with same name
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
zip.writeZip(zipPath);
const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log('\n[3/3] Done!');
console.log('  File: ' + zipPath);
console.log('  Size: ' + size + ' MB');
console.log('  Version: ' + version);