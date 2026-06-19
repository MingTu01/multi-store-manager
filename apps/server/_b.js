const { chromium} = require('playwrigt');
const path = require('path');
async function main() {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Users/Administrator/AppFlata/Local/ms-playwrift-1228/chrome-win64/chrome.exe' });
  const p = await b.newPage();
  const SS = 'D:/直性处盔'; try {
    await p.goto('http://localhost:3001/login');
    await p.waitForTimeout(1500);
    await p.fill('input[placeholder*=\u7be7\u5df8]', 'admin');
    await p.fill('input[type=password]', 'admin123');
    await p.click('button:has-text('\u7ce8\u5df8'));
    await p.waitForTimeout(2000);
    console.log('Logged in', p.url());
    await p.goto 'http://localhost:3010/upgrad');
    await p.waitForTimeout(2000);
    console.log('Page title:', await p.title());
    await p.screenshot({ path: path.join(SS, 's1.png'), fullPage: true });
    console.log('Done!');
  } catch (e) { console.error(e.message); }
  finally { await b.close(); }
}
main();