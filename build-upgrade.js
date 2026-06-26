const AdmZip = require('adm-zip');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Administrator/Documents/6666';
const SERVER_DIR = path.join(ROOT, 'apps/server');
const WEB_DIR = path.join(ROOT, 'apps/web');

const versionFile = path.join(SERVER_DIR, 'data/version.json');
let version = 'v0.0.0';
let notes = '';
if (fs.existsSync(versionFile)) {
  const v = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
  version = v.version || 'v0.0.0';
  notes = v.notes || '';
}
console.log('Building upgrade package for ' + version);

console.log('\n[1/3] Building frontend...');
const distDir = path.join(WEB_DIR, 'dist');
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
execSync('npx vite build', { cwd: WEB_DIR, stdio: 'inherit' });

console.log('\n[2/3] Creating ZIP...');
const zip = new AdmZip();

if (fs.existsSync(distDir)) {
  zip.addLocalFolder(distDir, 'web-dist');
  console.log('  Added web-dist/');
} else {
  console.error('  ERROR: web-dist not found!');
  process.exit(1);
}

const serverSrc = path.join(SERVER_DIR, 'src');
zip.addLocalFolder(serverSrc, 'server-src', (filename) => {
  return !filename.includes('node_modules');
});
console.log('  Added server-src/');

const realPkgPath = path.join(SERVER_DIR, "package.json");
const pkg = fs.existsSync(realPkgPath) ? JSON.parse(fs.readFileSync(realPkgPath, "utf8")) : {name:"multi-shop-link"};
pkg.version = version.replace("v","");
pkg.buildDate = new Date().toISOString();
zip.addFile('package.json', Buffer.from(JSON.stringify(pkg, null, 2), 'utf8'));
console.log('  Added package.json (version: ' + version + ')');

const zipName = 'upgrade-' + version + '.zip';
const zipPath = path.join(ROOT, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
zip.writeZip(zipPath);
const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
console.log('\n[3/3] Done!');
console.log('  File: ' + zipPath);
console.log('  Size: ' + size + ' MB');