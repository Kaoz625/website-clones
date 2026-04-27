import { chromium } from 'playwright';
import { parseTarget, saveFindings, saveScreenshot, REDIRECT_PARAMS, timestamp } from './utils.ts';

const EVIL_HOST = 'evil-redirect-canary.com';
const EVIL_URL = `https://${EVIL_HOST}`;

interface RedirectFinding {
  original_url: string;
  param: string;
  payload: string;
  redirected_to: string;
  confirmed: boolean;
  screenshot?: string;
}

const target = parseTarget();
const base = new URL(target);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

console.log(`\n[*] Open Redirect Scanner: ${target}\n`);

// Collect URLs from the target by crawling links
console.log('[*] Crawling links...');
const visited = new Set<string>();
const toVisit = [target];
const allUrls = new Set<string>();

while (toVisit.length > 0 && allUrls.size < 100) {
  const url = toVisit.pop()!;
  if (visited.has(url)) continue;
  visited.add(url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    allUrls.add(url);

    const links = await page.evaluate((origin) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(h => {
          try { return new URL(h).origin === origin; } catch { return false; }
        });
    }, base.origin);

    for (const link of links) {
      if (!visited.has(link)) toVisit.push(link);
    }
  } catch {
    // skip unreachable pages
  }
}

console.log(`[*] Found ${allUrls.size} pages, scanning for redirect params...\n`);

// Find URLs that have redirect-like query parameters
const candidateUrls: { url: string; param: string }[] = [];
for (const url of allUrls) {
  try {
    const parsed = new URL(url);
    for (const param of REDIRECT_PARAMS) {
      if (parsed.searchParams.has(param)) {
        candidateUrls.push({ url, param });
      }
    }
  } catch { /* skip */ }
}

// Also test common redirect param injection on the base URL
for (const param of REDIRECT_PARAMS) {
  const testUrl = new URL(target);
  testUrl.searchParams.set(param, EVIL_URL);
  candidateUrls.push({ url: testUrl.toString().replace(EVIL_URL, ''), param });
}

console.log(`[*] Testing ${candidateUrls.length} candidate URLs...\n`);

const findings: RedirectFinding[] = [];

for (const { url, param } of candidateUrls) {
  const parsed = new URL(url);
  parsed.searchParams.set(param, EVIL_URL);
  const testUrl = parsed.toString();

  try {
    let redirectedTo = '';
    const scanPage = await context.newPage();

    // Intercept navigation to detect redirects without actually leaving the domain
    scanPage.on('response', (response) => {
      const loc = response.headers()['location'];
      if (loc && [301, 302, 303, 307, 308].includes(response.status())) {
        redirectedTo = loc;
      }
    });

    await scanPage.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    const finalUrl = scanPage.url();
    const confirmed = finalUrl.includes(EVIL_HOST) || redirectedTo.includes(EVIL_HOST);

    if (confirmed) {
      const shot = await saveScreenshot(scanPage, target, `redirect-${param}`);
      findings.push({ original_url: url, param, payload: EVIL_URL, redirected_to: finalUrl || redirectedTo, confirmed: true, screenshot: shot });
      console.log(`  [VULN] Open redirect via ?${param}= on ${url}`);
      console.log(`         Redirected to: ${finalUrl}`);
      console.log(`         Screenshot: ${shot}`);
    } else if (redirectedTo) {
      findings.push({ original_url: url, param, payload: EVIL_URL, redirected_to: redirectedTo, confirmed: false });
      console.log(`  [INFO] Redirect detected but not to evil host — ?${param}= → ${redirectedTo}`);
    }

    await scanPage.close();
  } catch { /* skip */ }
}

const outFile = saveFindings(target, 'redirects', {
  target,
  scanned_at: timestamp(),
  pages_crawled: allUrls.size,
  candidates_tested: candidateUrls.length,
  findings,
  summary: { total_findings: findings.length, confirmed: findings.filter(f => f.confirmed).length },
});

console.log(`\n--- Summary ---`);
console.log(`  Pages crawled     : ${allUrls.size}`);
console.log(`  Params tested     : ${candidateUrls.length}`);
console.log(`  Confirmed vulns   : ${findings.filter(f => f.confirmed).length}`);
console.log(`  Saved to          : ${outFile}\n`);

await browser.close();
