const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  // Login
  await page.goto("http://localhost:3001/login");
  await page.waitForTimeout(2000);
  await page.fill("input[name=username],input[placeholder*=手机],input[type=tel]", "13000000002");
  await page.fill("input[type=password]", "123456");
  await page.click("button[type=submit]");
  await page.waitForTimeout(3000);
  
  // Go to purchase page
  await page.goto("http://localhost:3001/store/store_1782213744675/purchase");
  await page.waitForTimeout(3000);
  
  // Check for errors
  const errors = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
  
  // Screenshot
  await page.screenshot({ path: "purchase_page.png", fullPage: true });
  
  // Check page content
  const html = await page.content();
  console.log("Has trend:", html.includes("trend") || html.includes("趋势"));
  console.log("Has recommendations:", html.includes("建议") || html.includes("recommendations"));
  console.log("Page URL:", page.url());
  console.log("Errors:", errors.length);
  
  // Get all visible text
  const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log("Page text:", text.substring(0, 500));
  
  await browser.close();
})()