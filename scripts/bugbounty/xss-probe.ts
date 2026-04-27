import { chromium } from 'playwright';
import { parseTarget, saveFindings, saveScreenshot, XSS_PAYLOADS, timestamp } from './utils.ts';

interface XssFinding {
  url: string;
  param: string;
  payload: string;
  reflected_in: 'dom' | 'html_source' | 'both';
  confirmed: boolean;
  screenshot?: string;
}

const target = parseTarget();
const base = new URL(target);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

console.log(`\n[*] XSS Probe Scanner: ${target}\n`);

// Step 1: crawl and collect all query params
console.log('[*] Crawling to discover query parameters...');
const page = await context.newPage();
const visited = new Set<string>();
const toVisit = [target];
const paramMap = new Map<string, Set<string>>(); // url base → set of param names

while (toVisit.length > 0 && visited.size < 80) {
  const url = toVisit.pop()!;
  if (visited.has(url)) continue;
  visited.add(url);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Collect query params from current URL
    const parsed = new URL(page.url());
    if (parsed.search) {
      const baseKey = `${parsed.origin}${parsed.pathname}`;
      if (!paramMap.has(baseKey)) paramMap.set(baseKey, new Set());
      for (const key of parsed.searchParams.keys()) {
        paramMap.get(baseKey)!.add(key);
      }
    }

    // Collect links with query params
    const links = await page.evaluate((origin) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(h => {
          try {
            const u = new URL(h);
            return u.origin === origin && u.search;
          } catch { return false; }
        });
    }, base.origin);

    for (const link of links) {
      if (!visited.has(link)) toVisit.push(link);
      try {
        const p = new URL(link);
        const k = `${p.origin}${p.pathname}`;
        if (!paramMap.has(k)) paramMap.set(k, new Set());
        for (const key of p.searchParams.keys()) {
          paramMap.get(k)!.add(key);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

await page.close();

// Also inject common param names on the target as a baseline
const commonParams = ['q', 'search', 'query', 's', 'term', 'keyword', 'id', 'page', 'name', 'msg', 'message', 'text', 'input', 'value'];
const baseKey = `${base.origin}${base.pathname}`;
if (!paramMap.has(baseKey)) paramMap.set(baseKey, new Set());
for (const p of commonParams) paramMap.get(baseKey)!.add(p);

const totalCandidates = [...paramMap.entries()].reduce((acc, [, params]) => acc + params.size, 0);
console.log(`[*] Found ${paramMap.size} unique endpoints, ${totalCandidates} params to probe\n`);

const findings: XssFinding[] = [];
const MARKER = 'xsscanary';

for (const [urlBase, params] of paramMap) {
  for (const param of params) {
    // First, probe with a benign canary to check if the param is reflected at all
    const canaryUrl = new URL(urlBase);
    canaryUrl.searchParams.set(param, MARKER);

    const probePage = await context.newPage();
    try {
      await probePage.goto(canaryUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 10000 });
      const html = await probePage.content();

      if (!html.includes(MARKER)) {
        await probePage.close();
        continue; // param not reflected — skip XSS payloads
      }

      console.log(`  [REFLECTED] ?${param}= on ${urlBase} — testing XSS payloads...`);

      for (const payload of XSS_PAYLOADS) {
        const xssUrl = new URL(urlBase);
        xssUrl.searchParams.set(param, payload);

        const xssPage = await context.newPage();
        let alertFired = false;
        xssPage.on('dialog', async (dialog) => {
          alertFired = true;
          await dialog.dismiss();
        });

        try {
          await xssPage.goto(xssUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 10000 });
          const xssHtml = await xssPage.content();

          // Check if payload appears unescaped in source
          const inHtml = xssHtml.includes(payload);
          // Check DOM for unescaped payload
          const inDom = await xssPage.evaluate((p) => document.body.innerHTML.includes(p), payload);

          const confirmed = alertFired || (inHtml && !xssHtml.includes(encodeURIComponent(payload).replace(/%/g, '&#')));

          if (alertFired || inDom || inHtml) {
            const reflected_in: XssFinding['reflected_in'] = (inDom && inHtml) ? 'both' : inDom ? 'dom' : 'html_source';
            const shot = await saveScreenshot(xssPage, target, `xss-${param}`);
            findings.push({ url: urlBase, param, payload, reflected_in, confirmed: alertFired, screenshot: shot });

            if (alertFired) {
              console.log(`    [CONFIRMED XSS] ?${param}= triggered alert()`);
            } else {
              console.log(`    [REFLECTED] Payload in ${reflected_in} — may need manual verification`);
            }
            console.log(`    Screenshot: ${shot}`);
            break; // one confirmed payload per param is enough
          }
        } catch { /* skip */ } finally {
          await xssPage.close();
        }
      }
    } catch { /* skip */ } finally {
      await probePage.close();
    }
  }
}

const outFile = saveFindings(target, 'xss', {
  target,
  scanned_at: timestamp(),
  endpoints_crawled: visited.size,
  params_tested: totalCandidates,
  findings,
  summary: {
    total: findings.length,
    confirmed_xss: findings.filter(f => f.confirmed).length,
    reflected: findings.filter(f => !f.confirmed).length,
  },
});

console.log(`\n--- Summary ---`);
console.log(`  Pages crawled      : ${visited.size}`);
console.log(`  Params tested      : ${totalCandidates}`);
console.log(`  Confirmed XSS      : ${findings.filter(f => f.confirmed).length}`);
console.log(`  Reflected (verify) : ${findings.filter(f => !f.confirmed).length}`);
console.log(`  Saved to           : ${outFile}\n`);

await browser.close();
