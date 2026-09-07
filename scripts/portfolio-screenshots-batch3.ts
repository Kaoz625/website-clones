import { chromium } from 'playwright';
import { launchHeadlessComet } from './lib/comet-headless.ts';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORTFOLIO_SCREENSHOTS = '/Users/markususche/Syncthing/Brain/Markus Brain/NYCTailblazers/Projects/websites/portfolio-site/public/screenshots';

mkdirSync(PORTFOLIO_SCREENSHOTS, { recursive: true });

const SITES: { id: string; url: string }[] = [
  // titan-renovations-react uses the same live URL as the HTML version
  { id: 'titan-renovations-react', url: 'https://titanrenovationsnyc.nyctailblazers.com' },
  // magazine — try live, fallback handled below
  { id: 'blazingtails-magazine',   url: 'https://magazine.nyctailblazers.com' },
];

const { browser, close } = await launchHeadlessComet({ chromium });

for (const site of SITES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const outPath = join(PORTFOLIO_SCREENSHOTS, `${site.id}.jpg`);
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✓ ${site.id}`);
  } catch (err) {
    console.error(`✗ ${site.id} (${site.url}) — falling back to copy`);
    // Fallback: copy nearest related screenshot
    const fallbacks: Record<string, string> = {
      'titan-renovations-react': 'titan-renovations',
      'blazingtails-magazine': 'blazingtails',
    };
    const fb = fallbacks[site.id];
    if (fb) {
      const src = join(PORTFOLIO_SCREENSHOTS, `${fb}.jpg`);
      const dst = join(PORTFOLIO_SCREENSHOTS, `${site.id}.jpg`);
      if (existsSync(src)) {
        copyFileSync(src, dst);
        console.log(`  ↳ copied ${fb}.jpg → ${site.id}.jpg`);
      }
    }
  } finally {
    await context.close();
  }
}

await close();
console.log('Done.');
