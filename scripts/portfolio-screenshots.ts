import { chromium } from 'playwright';
import { launchHeadlessComet } from './lib/comet-headless.ts';
import { mkdirSync } from 'fs';
import { join } from 'path';

const PORTFOLIO_SCREENSHOTS = '/Users/markususche/Syncthing/Brain/Markus Brain/NYCTailblazers/Projects/websites/portfolio-site/public/screenshots';

const SITES: { id: string; url: string }[] = [
  { id: 'nyctailblazers',    url: 'https://nyctailblazers.com' },
  { id: 'clarity-coaching',  url: 'https://claritycoachingpro.nyctailblazers.com' },
  { id: 'luxe-hair',         url: 'https://luxeandcohair.nyctailblazers.com' },
  { id: 'peak-hvac',         url: 'https://peakprohvac.nyctailblazers.com' },
  { id: 'gentleman-brand',   url: 'https://gentlemanbrandmanagement.nyctailblazers.com' },
  { id: 'afu-social-club',   url: 'https://afusocialclub.nyctailblazers.com' },
  { id: 'titan-renovations', url: 'https://titanrenovationsnyc.nyctailblazers.com' },
];

mkdirSync(PORTFOLIO_SCREENSHOTS, { recursive: true });

const { browser, close } = await launchHeadlessComet({ chromium });

for (const site of SITES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const outPath = join(PORTFOLIO_SCREENSHOTS, `${site.id}.jpg`);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✓ ${site.id} → ${site.id}.jpg`);
  } catch (err) {
    console.error(`✗ ${site.id}: ${err}`);
  } finally {
    await context.close();
  }
}

await close();
console.log('Done.');
