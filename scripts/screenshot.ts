import { chromium, devices } from 'playwright';
import { launchHeadlessComet } from './lib/comet-headless.ts';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--')) ?? 'https://example.com';
const fullPage = args.includes('--full');
const deviceFlag = args.find(a => a.startsWith('--device='))?.split('=')[1];

const screenshotsDir = join(__dirname, '..', 'screenshots');
mkdirSync(screenshotsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const domain = new URL(url).hostname.replace(/\./g, '_');
const filename = `${timestamp}-${domain}.png`;
const outputPath = join(screenshotsDir, filename);

const { browser, close } = await launchHeadlessComet({ chromium });
const context = deviceFlag
  ? await browser.newContext(devices[deviceFlag as keyof typeof devices])
  : await browser.newContext();

const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: outputPath, fullPage });
await close();

console.log(outputPath);
