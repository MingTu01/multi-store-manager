const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));
  
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  await page.goto('http://localhost:3001/store/s1/logs');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/test_logs_v2.png', fullPage: true });
  
  const bodyHTML = await page.evaluate(() => document.getElementById('root').innerHTML.substring(0, 300));
  console.log('ROOT HTML:', bodyHTML);
  
  if (errors.length > 0) {
    console.log('ERRORS:');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('No errors');
  }
  await browser.close();
})();
