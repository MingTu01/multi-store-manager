// sync-version.js - Ensures build hash placeholder is ready for build-hash.cjs
const fs = require('fs');
let html = fs.readFileSync('./index.html', 'utf8');
// Ensure the placeholder exists (vite build copies src index.html to dist)
if (!html.includes('__BUILD_HASH__')) {
  html = html.replace(/var VERSION = '[^']+';/, "var VERSION = '__BUILD_HASH__';");
  fs.writeFileSync('./index.html', html);
  console.log('[sync-version] Restored __BUILD_HASH__ placeholder');
} else {
  console.log('[sync-version] Placeholder already present');
}
