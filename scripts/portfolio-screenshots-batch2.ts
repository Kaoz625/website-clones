import { chromium } from 'playwright';
import { launchHeadlessComet } from './lib/comet-headless.ts';
import { mkdirSync } from 'fs';
import { join } from 'path';

const PORTFOLIO_SCREENSHOTS = '/Users/markususche/Syncthing/Brain/Markus Brain/NYCTailblazers/Projects/websites/portfolio-site/public/screenshots';

const SITES: { id: string; url: string }[] = [
  { id: 'cpaintingservices',    url: 'https://cpaintingservices.nyctailblazers.com' },
  { id: 'cpaintingbrooklyn',    url: 'https://cpaintingbrooklyn.nyctailblazers.com' },
  { id: 'royalkims',            url: 'https://royalkims.nyctailblazers.com' },
  { id: 'greenlanternink',      url: 'https://greenlanternink.nyctailblazers.com' },
  { id: 'trapables',            url: 'https://trapables.nyctailblazers.com' },
  { id: 'gymbot',               url: 'https://gymbot.nyctailblazers.com' },
  { id: 'blazingtails',         url: 'https://blazingtails.nyctailblazers.com' },
  { id: 'nyctailblazers-modern',url: 'https://modern.nyctailblazers.com' },
  { id: 'missioncontrolsecure', url: 'https://missioncontrolsecure.nyctailblazers.com' },
  { id: 'missionmobile-live',   url: 'https://missionmobile.nyctailblazers.com' },
  { id: 'clones',               url: 'https://clones.nyctailblazers.com' },
  { id: 'popspot-live',         url: 'https://popspot.nyctailblazers.com' },
];

mkdirSync(PORTFOLIO_SCREENSHOTS, { recursive: true });

const { browser, close } = await launchHeadlessComet({ chromium });

for (const site of SITES) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const outPath = `${PORTFOLIO_SCREENSHOTS}/${site.id}.jpg`;
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    console.log(`✓ ${site.id}`);
  } catch (err) {
    console.error(`✗ ${site.id}: ${err}`);
  } finally {
    await context.close();
  }
}

await close();
console.log('Done.');
