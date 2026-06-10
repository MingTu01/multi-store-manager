const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  
  // 拦截网络请求
  const jsFiles = [];
  page.on('response', (response) => {
    if (response.url().includes('.js')) {
      jsFiles.push(response.url());
      console.log('JS文件:', response.url());
    }
  });
  
  // 登录
  await page.goto('http://localhost:3001/login');
  await page.waitForSelector('input');
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // 访问开闭店页面
  await page.goto('http://localhost:3001/store/s1/shifts');
  await page.waitForTimeout(3000);
  
  // 获取页面引用的JS文件
  console.log('\n所有JS文件:');
  jsFiles.forEach(f => console.log(f));
  
  // 检查JS文件内容
  for (const url of jsFiles) {
    if (url.includes('index') && url.includes('.js')) {
      const resp = await page.evaluate(async (u) => {
        const r = await fetch(u);
        return await r.text();
      }, url);
      
      console.log('\n文件内容检查:');
      console.log('包含"开始营业":', resp.includes('开始营业'));
      console.log('包含"fixed inset-0":', resp.includes('fixed inset-0'));
      console.log('包含"门店当前已关闭":', resp.includes('门店当前已关闭'));
    }
  }
  
  await browser.close();
})();
