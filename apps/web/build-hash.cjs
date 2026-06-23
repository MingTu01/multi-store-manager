// Generate build hash and inject into index.html
// Run this before or after vite build to replace __BUILD_HASH__ with a unique build identifier
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const indexFile = path.join(distDir, 'index.html');

if (!fs.existsSync(indexFile)) {
  console.log('[build-hash] dist/index.html not found, skipping');
  process.exit(0);
}

let html = fs.readFileSync(indexFile, 'utf8');
if (html.includes('__BUILD_HASH__')) {
  const buildHash = 'b' + Date.now().toString(36);
  html = html.replace(/__BUILD_HASH__/g, buildHash);
  fs.writeFileSync(indexFile, html, 'utf8');
  console.log('[build-hash] Injected build hash:', buildHash);
} else {
  console.log('[build-hash] No placeholder found, already replaced or different format');
}
