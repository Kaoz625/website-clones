/**
 * General-purpose OSINT scraper for businesses or people.
 *
 * Business mode:
 *   tsx scripts/osint-scraper.ts --category "plumbers" --location "Brooklyn NY" --radius 25
 *
 * People mode:
 *   tsx scripts/osint-scraper.ts --person "John Smith" --location "New York"
 *
 * Options:
 *   --category <name>   Business/service category to search
 *   --person <name>     Person to search (OSINT)
 *   --location <place>  City, state, zip, or country (default: "near me")
 *   --radius <miles>    Search radius in miles (optional, business mode only)
 *   --headless          Run headlessly using Comet profile copy
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

// --- CLI args ---
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const category = getArg('--category');
const person = getArg('--person');
const location = getArg('--location') ?? 'near me';
const radius = getArg('--radius');
const headless = args.includes('--headless');
const mode: 'business' | 'people' = person ? 'people' : 'business';

if (!category && !person) {
  console.error('Usage:');
  console.error('  tsx scripts/osint-scraper.ts --category "dog walkers" [--location "Brooklyn NY"] [--radius 25] [--headless]');
  console.error('  tsx scripts/osint-scraper.ts --person "John Smith" [--location "New York"] [--headless]');
  process.exit(1);
}

// --- Browser setup ---
const COMET_EXE = '/Applications/Comet.app/Contents/MacOS/Comet';
const COMET_PROFILE = `${process.env.HOME}/Library/Application Support/Comet/Default`;
const TEMP_PROFILE = `/tmp/comet-osint-${process.pid}`;
const CDP_URL = 'http://127.0.0.1:9222';

let browser: Browser | undefined;
let context: BrowserContext;
let ownedContext = false;

if (headless) {
  console.error('Mode: headless Comet (profile copy)');
  mkdirSync(TEMP_PROFILE, { recursive: true });
  try {
    execSync(`rsync -a --exclude='*.lock' --exclude='SingletonLock' "${COMET_PROFILE}/" "${TEMP_PROFILE}/"`, { stdio: 'pipe' });
  } catch { /* best-effort */ }

  context = await chromium.launchPersistentContext(TEMP_PROFILE, {
    executablePath: COMET_EXE,
    headless: true,
    args: ['--no-first-run', '--disable-sync', '--no-default-browser-check'],
  });
  ownedContext = true;
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

// --- Query builder ---
function buildQueries(): { primary: string; news: string; supplemental: string[] } {
  const loc = location === 'near me' ? 'near me' : `in ${location}`;
  const radiusPart = radius ? ` within ${radius} miles of ${location}` : '';

  if (mode === 'business') {
    const searchLoc = radius ? radiusPart : ` ${loc}`;
    return {
      primary: `${category}${searchLoc} phone number email address`,
      news: `${category} ${location !== 'near me' ? location : ''} news 2024 2025`,
      supplemental: [
        `${category}${searchLoc} contact information`,
        `${category}${searchLoc} reviews`,
      ],
    };
  } else {
    // People mode
    const locPart = location !== 'near me' ? ` ${location}` : '';
    return {
      primary: `"${person}"${locPart} contact phone email`,
      news: `"${person}"${locPart} news`,
      supplemental: [
        `site:linkedin.com/in "${person}"`,
        `site:facebook.com "${person}"${locPart}`,
        `"${person}"${locPart} address employer`,
      ],
    };
  }
}

// --- Data extraction (all as string to avoid tsx/esbuild name injection) ---

const EXTRACT_BUSINESS = `(() => {
  const phoneRx = /\\(?\\d{3}\\)?[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}/;
  const emailRx = /[\\w.+-]+@[\\w\\-]+\\.[a-zA-Z]{2,}/;
  const out = [];
  const seenPhones = new Set();
  const seenEmails = new Set();

  function cleanText(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }

  function addResult(name, phone, email, website, address) {
    const key = phone || email || name;
    if (!key) return;
    if (phone && seenPhones.has(phone)) return;
    if (email && seenEmails.has(email)) return;
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    out.push({ name, phone: phone || null, email: email || null, website: website || null, address: address || null });
  }

  // Google local pack (.rllt__details)
  document.querySelectorAll('.rllt__details').forEach(function(details) {
    const phoneMatch = (details.textContent || '').match(phoneRx);
    const emailMatch = (details.textContent || '').match(emailRx);
    const card = details.closest('.VkpGBb, [role="button"]');
    const name = cleanText(card && card.querySelector('.dbg0pd, h3') && card.querySelector('.dbg0pd, h3').textContent) || 'Unknown';
    const addrEl = details.querySelector('[class*="addr"], [data-dtype="d3adr"]');
    addResult(name, phoneMatch ? phoneMatch[0] : null, emailMatch ? emailMatch[0] : null, null, addrEl ? cleanText(addrEl.textContent) : null);
  });

  // Knowledge panel
  const kpPhone = document.querySelector('[data-attrid*="phone"] [class*="LrzXr"]');
  const kpName = document.querySelector('h2[data-attrid="title"]');
  const kpAddr = document.querySelector('[data-attrid*="address"] [class*="LrzXr"]');
  const kpSite = document.querySelector('[data-attrid*="url"] a');
  if (kpPhone) {
    addResult(
      cleanText(kpName && kpName.textContent),
      cleanText(kpPhone.textContent),
      null,
      kpSite ? kpSite.href : null,
      cleanText(kpAddr && kpAddr.textContent)
    );
  }

  // Walk all text nodes for phones and emails
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const phoneMatch = text.match(phoneRx);
    const emailMatch = text.match(emailRx);
    if (!phoneMatch && !emailMatch) continue;
    let el = node.parentElement;
    let name = '';
    for (let i = 0; i < 10 && el; i++) {
      const h = el.querySelector('h2, h3, h4');
      if (h) { name = cleanText(h.textContent); break; }
      el = el.parentElement;
    }
    addResult(name || 'Unknown', phoneMatch ? phoneMatch[0] : null, emailMatch ? emailMatch[0] : null, null, null);
  }

  return out;
})()`;

const EXTRACT_PEOPLE = `(() => {
  const phoneRx = /\\(?\\d{3}\\)?[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}/g;
  const emailRx = /[\\w.+-]+@[\\w\\-]+\\.[a-zA-Z]{2,}/g;
  const socialRx = /(linkedin\\.com\\/in\\/[\\w\\-]+|facebook\\.com\\/[\\w.]+|instagram\\.com\\/[\\w.]+|twitter\\.com\\/[\\w_]+|x\\.com\\/[\\w_]+)/gi;

  const bodyText = document.body.innerText || '';
  const fullHTML = document.body.innerHTML || '';

  const phones = [...new Set((bodyText.match(phoneRx) || []).map(p => p.trim()))];
  const emails = [...new Set((bodyText.match(emailRx) || []).filter(e => !e.includes('example') && !e.includes('placeholder')))];

  // Extract social profile URLs from links
  const socialLinks = [];
  const seenSocial = new Set();
  document.querySelectorAll('a[href]').forEach(function(a) {
    const href = a.href || '';
    const m = href.match(/(linkedin\\.com\\/in\\/[\\w\\-]+|facebook\\.com\\/[\\w.]+|instagram\\.com\\/[\\w.]+|twitter\\.com\\/[\\w_]+|x\\.com\\/[\\w_]+)/i);
    if (m && !seenSocial.has(m[0])) {
      seenSocial.add(m[0]);
      socialLinks.push('https://' + m[0]);
    }
  });
  // Also scan text for social mentions
  const textSocial = bodyText.match(socialRx) || [];
  textSocial.forEach(function(s) {
    if (!seenSocial.has(s)) { seenSocial.add(s); socialLinks.push('https://' + s); }
  });

  // Extract page titles (each result)
  const results = [];
  document.querySelectorAll('h3').forEach(function(h3) {
    const title = (h3.textContent || '').trim();
    const link = h3.closest('a') || h3.querySelector('a');
    const url = link ? link.href : null;
    const snippet = h3.closest('[data-sokoban-container], .g') && h3.closest('[data-sokoban-container], .g').querySelector('[class*="VwiC3b"], [class*="s"]');
    results.push({ title, url, snippet: snippet ? (snippet.textContent || '').trim() : null });
  });

  return { phones, emails, socialLinks, searchResults: results.slice(0, 20) };
})()`;

const EXTRACT_NEWS = `(() => {
  const items = [];
  document.querySelectorAll('[data-n-tid], .SoaBEf, [class*="article"], article').forEach(function(el) {
    const title = el.querySelector('h3, h4, [class*="title"]');
    const link = el.querySelector('a');
    const time = el.querySelector('time, [class*="date"]');
    if (title) {
      items.push({
        title: (title.textContent || '').trim(),
        url: link ? link.href : null,
        date: time ? (time.getAttribute('datetime') || time.textContent || '').trim() : null,
      });
    }
  });
  return items.slice(0, 10);
})()`;

// --- Run searches ---
const queries = buildQueries();
const subject = person ?? category!;
const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

console.error(`\nOSINT Scraper — mode: ${mode}`);
console.error(`Subject: ${subject}`);
console.error(`Location: ${location}${radius ? ` (radius: ${radius} miles)` : ''}`);
console.error(`Primary query: ${queries.primary}\n`);

async function searchGoogle(page: Page, query: string, extractScript: string): Promise<unknown> {
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  // Wait for results
  await page.waitForSelector('#search, #rso, #main', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page.evaluate(extractScript);
}

async function searchGoogleNews(page: Page, query: string): Promise<unknown> {
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&hl=en`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForTimeout(800);
  return page.evaluate(EXTRACT_NEWS);
}

const page = await context.newPage();
const output: Record<string, unknown> = {
  mode,
  subject,
  location,
  radius: radius ?? null,
  timestamp: new Date().toISOString(),
  primaryResults: [],
  supplementalResults: [],
  newsResults: [],
};

// Primary search
try {
  const extractScript = mode === 'business' ? EXTRACT_BUSINESS : EXTRACT_PEOPLE;
  output.primaryResults = await searchGoogle(page, queries.primary, extractScript);
  console.error(`Primary search done.`);
} catch (err) {
  console.error(`Primary search failed: ${(err as Error).message}`);
}

// News search
try {
  output.newsResults = await searchGoogleNews(page, queries.news);
  console.error(`News search done: ${(output.newsResults as unknown[]).length} items`);
} catch (err) {
  console.error(`News search failed: ${(err as Error).message}`);
}

// Supplemental searches (people mode: LinkedIn, Facebook, etc.)
for (const supQuery of queries.supplemental) {
  try {
    const extractScript = mode === 'business' ? EXTRACT_BUSINESS : EXTRACT_PEOPLE;
    const res = await searchGoogle(page, supQuery, extractScript);
    (output.supplementalResults as unknown[]).push({ query: supQuery, results: res });
    console.error(`Supplemental: "${supQuery}" done`);
  } catch (err) {
    console.error(`Supplemental failed ("${supQuery}"): ${(err as Error).message}`);
  }
}

await page.close();
if (ownedContext) {
  await context.close();
  try { execSync(`rm -rf "${TEMP_PROFILE}"`, { stdio: 'pipe' }); } catch { /* best-effort */ }
}

// --- Save output ---
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(dataDir, `${mode}-${slug}-${timestamp}.json`);
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(JSON.stringify(output, null, 2));
console.error(`\nSaved → ${outPath}`);

if (mode === 'business') {
  const results = output.primaryResults as Array<{ name: string; phone: string | null }>;
  console.error(`Found ${results.length} business result(s)`);
} else {
  const res = output.primaryResults as { phones: string[]; emails: string[]; socialLinks: string[] };
  console.error(`Found ${res.phones?.length ?? 0} phone(s), ${res.emails?.length ?? 0} email(s), ${res.socialLinks?.length ?? 0} social link(s)`);
}
