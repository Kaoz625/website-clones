import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

const pages = context.pages();
let newTabPage = pages.find(p => p.url() === 'chrome://newtab/');
if (!newTabPage) {
  newTabPage = await context.newPage();
  await newTabPage.waitForTimeout(1500);
}

await newTabPage.bringToFront();
await newTabPage.waitForTimeout(1500);
await newTabPage.screenshot({ path: 'screenshots/comet-newtab.png', fullPage: true });

const inputs = await newTabPage.evaluate(() => {
  const els = document.querySelectorAll('input, textarea, [contenteditable], [role="textbox"], [role="search"], [role="combobox"]');
  return [...els].map(el => ({
    tag: el.tagName,
    type: (el as HTMLInputElement).type || '',
    placeholder: (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.getAttribute('aria-placeholder') || '',
    role: el.getAttribute('role') || '',
    id: el.id || '',
    class: el.className.toString().substring(0, 120),
    visible: (el as HTMLElement).offsetParent !== null,
    text: el.textContent?.substring(0, 80) || ''
  }));
});
console.log('Input elements:', JSON.stringify(inputs, null, 2));

const bodyText = await newTabPage.evaluate(() => document.body.innerText?.substring(0, 3000));
console.log('\nPage visible text:\n', bodyText);
