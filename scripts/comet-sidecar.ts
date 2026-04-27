import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];

// Open perplexity.ai in a new full tab
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto('https://www.perplexity.ai', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/perplexity-main.png', fullPage: false });
console.log('Screenshot saved: screenshots/perplexity-main.png');

// Inspect interactive elements
const elements = await page.evaluate(() => {
  const sel = 'input, textarea, [contenteditable], [role="textbox"], [role="combobox"], button, [role="button"], select';
  return [...document.querySelectorAll(sel)].slice(0, 40).map(el => ({
    tag: el.tagName,
    role: el.getAttribute('role') || '',
    placeholder: (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.getAttribute('aria-placeholder') || '',
    text: el.textContent?.trim().substring(0, 80) || '',
    visible: (el as HTMLElement).offsetParent !== null,
    id: el.id || '',
    name: (el as HTMLInputElement).name || '',
  })).filter(e => e.visible);
});
console.log('\nInteractive elements:', JSON.stringify(elements, null, 2));

const bodyText = await page.evaluate(() => document.body.innerText?.substring(0, 3000));
console.log('\nVisible text:\n', bodyText);

await page.close();
