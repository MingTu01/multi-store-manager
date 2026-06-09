export async function generateReportImage(html: string): Promise<Buffer | null> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 800, height: 600 });
    const buffer = await page.screenshot({ type: 'png', fullPage: true });
    await browser.close();
    return buffer;
  } catch (e) {
    console.error('Report image generation error:', e);
    return null;
  }
}
