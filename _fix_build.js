const fs = require('fs');
const filePath = 'D:\\文档\\DDDOR\\multi-store-manager\\apps\\server\\build-upgrade.cjs';
let content = fs.readFileSync(filePath, 'utf8');

// 移除 traineddata 行
content = content.replace(/  'chi_sim\.traineddata',.*\n/, '');
content = content.replace(/  'eng\.traineddata',.*\n/, '');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Removed traineddata references from build-upgrade.cjs');