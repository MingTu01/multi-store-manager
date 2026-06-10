const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  // 登录
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  
  // 访问开闭店页面
  await page.goto('http://localhost:3001/store/s1/shifts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // 截图
  await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/screenshot_shifts.png', fullPage: true });
  console.log('✅ 开闭店页面截图已保存');
  
  // 获取页面HTML
  const html = await page.content();
  if (html.includes('开始营业')) {
    console.log('✅ 页面有"开始营业"按钮');
  } else {
    console.log('❌ 页面没有"开始营业"按钮');
  }
  if (html.includes('门店当前已关闭')) {
    console.log('✅ 页面有"门店当前已关闭"');
  } else {
    console.log('❌ 页面没有"门店当前已关闭"');
  }
  
  // 点击"开始营业"按钮
  try {
    await page.click('text=开始营业');
    await page.waitForTimeout(1000);
    
    // 截图弹窗
    await page.screenshot({ path: 'C:/Users/Administrator/Documents/6666/screenshot_open_modal.png', fullPage: true });
    console.log('✅ 弹窗截图已保存');
  } catch (e) {
    console.log('❌ 点击"开始营业"失败:', e.message);
  }
  
  await browser.close();
})();
