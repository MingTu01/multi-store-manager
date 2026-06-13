const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('=== 1. 访问登录页 ===');
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/01-login.png', fullPage: true });
  console.log('Screenshot: 01-login.png');

  console.log('=== 2. 测试错误密码 ===');
  await page.fill('input[placeholder*="用户名"], input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'wrongpassword');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/02-wrong-password.png', fullPage: true });
  // 检查错误信息
  const errorText = await page.textContent('body');
  const hasRealError = errorText.includes('密码错误') || errorText.includes('用户名或密码错误');
  console.log('Error message contains real info: ' + hasRealError);
  console.log('Page text (excerpt): ' + errorText.substring(0, 500));

  console.log('=== 3. 正确登录 ===');
  await page.fill('input[placeholder*="用户名"], input[type="text"]', 'admin');
  await page.fill('input[type="password"]', '123456');
  await page.click('button[type="submit"], button:has-text("登录")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/03-dashboard.png', fullPage: true });
  console.log('Screenshot: 03-dashboard.png');

  console.log('=== 4. 进入门店管理 ===');
  await page.click('a[href="/stores"], text=门店管理');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/04-stores.png', fullPage: true });
  console.log('Screenshot: 04-stores.png');

  console.log('=== 5. 创建门店（含股东）===');
  await page.click('button:has-text("新建门店")');
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder*="门店名称"]', '城南旗舰店');
  await page.fill('input[placeholder*="地址"]', '北京市朝阳区建国路100号');
  await page.fill('input[placeholder*="初始资金"], input[placeholder*="capital"]', '100000');
  // 添加股东
  const addBtn = page.locator('button:has-text("添加")');
  if (await addBtn.count() > 0) {
    await addBtn.first().click();
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="姓名"]', '张三');
    await page.fill('input[placeholder*="电话"]', '13900000001');
    await page.fill('input[placeholder*="占比"]', '60');
    await addBtn.first().click();
    await page.waitForTimeout(500);
    const nameInputs = page.locator('input[placeholder*="姓名"]');
    await nameInputs.last().fill('李四');
    const phoneInputs = page.locator('input[placeholder*="电话"]');
    await phoneInputs.last().fill('13900000002');
    const ratioInputs = page.locator('input[placeholder*="占比"]');
    await ratioInputs.last().fill('40');
  }
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/05-create-store-form.png', fullPage: true });
  console.log('Screenshot: 05-create-store-form.png');

  // 提交
  await page.click('button:has-text("保存"), button:has-text("创建")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/06-store-created.png', fullPage: true });
  console.log('Screenshot: 06-store-created.png');

  console.log('=== 6. 进入门店 ===');
  const storeCard = page.locator('text=城南旗舰店');
  if (await storeCard.count() > 0) {
    await storeCard.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'D:/文档/DDDOR/screenshots/07-store-overview.png', fullPage: true });
    console.log('Screenshot: 07-store-overview.png');
  }

  console.log('=== ALL SCREENSHOTS DONE ===');
  await browser.close();
})();