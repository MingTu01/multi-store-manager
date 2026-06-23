// Auto-sync VERSION from package.json
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
let html = fs.readFileSync('./index.html', 'utf8');
html = html.replace(/var VERSION = '[^']+';/, "var VERSION = 'v" + pkg.version + "';");
fs.writeFileSync('./index.html', html);
console.log('VERSION synced to v' + pkg.version);
