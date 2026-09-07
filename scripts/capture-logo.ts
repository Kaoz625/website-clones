import { chromium } from 'playwright';
import { launchHeadlessComet } from './lib/comet-headless.ts';
import { join } from 'path';

const OUT = '/Users/markususche/Syncthing/Brain/Markus Brain/NYCTailblazers/Projects/websites/portfolio-site/public/logo-reference.png';

const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto('http://localhost:4199', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Screenshot just the hero/header section (logo lives there)
const hero = page.locator('header, nav, [class*="hero"], [class*="Hero"]').first();
const box = await hero.boundingBox();

if (box) {
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1400, height: Math.min(box.height + box.y + 20, 400) } });
  console.log('Logo section captured →', OUT);
} else {
  // Fallback: top 400px of page
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1400, height: 400 } });
  console.log('Fallback top-of-page captured →', OUT);
}

await close();
