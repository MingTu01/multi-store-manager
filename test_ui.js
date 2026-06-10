const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Go to login page
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/test1_login.png' });
  console.log('Step 1: Login page screenshot taken');
  
  // Login
  await page.fill('input[placeholder*="账号"], input[placeholder*="用户名"], input[type="text"]', 'admin');
  await page.fill('input[placeholder*="密码"], input[type="password"]', '123456');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/test2_afterlogin.png' });
  console.log('Step 2: After login screenshot taken');
  
  // Navigate to store logs
  await page.goto('http://localhost:3001/store/s1/logs');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/test3_logs.png' });
  console.log('Step 3: Logs page screenshot taken');
  
  // Check console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('Console error:', msg.text());
  });
  
  await browser.close();
})();
