const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Collect console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));
  
  // Login
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000);
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Navigate to logs page
  await page.goto('http://localhost:3001/store/s1/logs');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/test_logs_fresh.png', fullPage: true });
  
  // Get page content
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
  console.log('BODY HTML:', bodyHTML);
  
  if (errors.length > 0) {
    console.log('ERRORS FOUND:');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('No console errors');
  }
  
  await browser.close();
})();
