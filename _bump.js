const fs = require('fs');
const ver = '1.2.16';
// package.json root
let p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = ver;
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n', 'utf8');
// apps/server/package.json
let sp = JSON.parse(fs.readFileSync('apps/server/package.json', 'utf8'));
sp.version = ver;
fs.writeFileSync('apps/server/package.json', JSON.stringify(sp, null, 2) + '\n', 'utf8');
// apps/web/package.json
let wp = JSON.parse(fs.readFileSync('apps/web/package.json', 'utf8'));
wp.version = ver;
fs.writeFileSync('apps/web/package.json', JSON.stringify(wp, null, 2) + '\n', 'utf8');
// version.json
let vj = JSON.parse(fs.readFileSync('apps/server/data/version.json', 'utf8'));
vj.version = 'v' + ver;
fs.writeFileSync('apps/server/data/version.json', JSON.stringify(vj, null, 2) + '\n', 'utf8');
// README.md changelog
let readme = fs.readFileSync('README.md', 'utf8');
const entry = '### v' + ver + ' (2026-06-23)\n- **店铺卡片图片** — 管理页面门店卡片只展示第一张图片（门头照）\n- **推送测试修复** — 支持指定渠道测试，返回详细成功/失败原因\n- **进货趋势修复** — TrendingDown 图标导入缺失导致页面崩溃，已修复\n- **进货数据** — 补充60天历史进货数据，趋势图正常显示\n- **盘点领出权限** — STAFF 角色可正常领出盘点物品\n- **工资页面** — STAFF 只能查看自己的工资条目\n\n';
readme = readme.replace('## \u66f4\u65b0\u65e5\u5fd7\n\n', '## \u66f4\u65b0\u65e5\u5fd7\n\n' + entry);
fs.writeFileSync('README.md', readme, 'utf8');
console.log('All version files updated to ' + ver);
