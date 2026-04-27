import { chromium, Browser, BrowserContext } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--')) ?? 'dog walkers near me phone number';
const headless = args.includes('--headless');

const COMET_EXE = '/Applications/Comet.app/Contents/MacOS/Comet';
const COMET_PROFILE = `${process.env.HOME}/Library/Application Support/Comet/Default`;
const TEMP_PROFILE = '/tmp/comet-scrape-profile';
const CDP_URL = 'http://127.0.0.1:9222';

let browser: Browser | undefined;
let context: BrowserContext;
let ownedBrowser = false;

if (headless) {
  console.error('Mode: headless Comet (profile copy)');
  mkdirSync(TEMP_PROFILE, { recursive: true });
  try {
    execSync(`rsync -a --exclude='*.lock' --exclude='SingletonLock' "${COMET_PROFILE}/" "${TEMP_PROFILE}/"`);
  } catch { /* best-effort */ }

  context = await chromium.launchPersistentContext(TEMP_PROFILE, {
    executablePath: COMET_EXE,
    headless: true,
    args: ['--no-first-run', '--disable-sync', '--no-default-browser-check'],
  });
  ownedBrowser = true;
} else {
  console.error('Mode: headed Comet via CDP');
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    console.error('ERROR: Comet is not running with remote debugging enabled.');
    console.error('Run this once to relaunch Comet with debugging:');
    console.error('  npm run comet:debug');
    process.exit(1);
  }
  context = browser.contexts()[0];
}

const page = await context.newPage();

console.error(`Searching Google for: ${query}`);
await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
  waitUntil: 'domcontentloaded',
  timeout: 15000,
});

// Pass as string so tsx/esbuild doesn't inject __name helpers into the browser context
const results = await page.evaluate(`(() => {
  const phonePattern = /\\(?\\d{3}\\)?[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}/;
  const out = [];
  const seen = new Set();

  function add(name, phone) {
    phone = phone.trim();
    if (!seen.has(phone)) { seen.add(phone); out.push({ name, phone }); }
  }

  // Google local pack: .rllt__details holds phone; .dbg0pd holds business name
  document.querySelectorAll('.rllt__details').forEach(function(details) {
    const match = (details.textContent || '').match(phonePattern);
    if (!match) return;
    const card = details.closest('.VkpGBb, [role="button"]');
    const name = (card && card.querySelector('.dbg0pd, h3') && card.querySelector('.dbg0pd, h3').textContent.trim()) || 'Unknown';
    add(name, match[0]);
  });

  // Web result snippets: walk text nodes for remaining phones
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const m = (node.textContent || '').match(phonePattern);
    if (!m) continue;
    let el = node.parentElement;
    let name = '';
    for (let i = 0; i < 10 && el; i++) {
      const h = el.querySelector('h2, h3');
      if (h) { name = (h.textContent || '').trim(); break; }
      el = el.parentElement;
    }
    add(name || 'Unknown', m[0]);
  }

  return out;
})()`) as Array<{ name: string; phone: string }>;

await page.close();
if (ownedBrowser) await context.close();
// Never call browser.close() on a CDP connection — that kills the live Comet window

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(dataDir, `dog-walkers-${timestamp}.json`);
writeFileSync(outPath, JSON.stringify(results, null, 2));

console.log(JSON.stringify(results, null, 2));
console.error(`\nFound ${results.length} result(s) → saved to ${outPath}`);
