#!/usr/bin/env tsx
/**
 * Universal AI site query script.
 * Connects to Comet via CDP, scans all open tabs, detects AI sites,
 * checks login state, posts a query, and captures responses.
 *
 * Usage:
 *   npm run ai:query -- "What is quantum entanglement?"
 *   npm run ai:query -- "..." --sites perplexity,claude,chatgpt
 *   npm run ai:scan          (scan-only: report login status, no query)
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { ADAPTERS, detectAdapter, getAdapter } from './ai-adapters/index.js';
import { savePrompt } from './research/prompt-library.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CDP_URL = 'http://localhost:9222';

const args = process.argv.slice(2);
const scanOnly = args.includes('--scan-only');
const sitesFlag = args.find(a => a.startsWith('--sites='))?.split('=')[1]
  ?? args[args.indexOf('--sites') + 1];
const queryText = args.filter(a => !a.startsWith('--') && a !== sitesFlag).join(' ');

const targetKeys = sitesFlag
  ? sitesFlag.split(',').map(s => s.trim())
  : (process.env.AI_QUERY_SITES === 'all' || !process.env.AI_QUERY_SITES)
    ? ADAPTERS.map(a => a.key)
    : process.env.AI_QUERY_SITES.split(',');

if (!scanOnly && !queryText) {
  console.error('Usage: npm run ai:query -- "your query" [--sites perplexity,claude]');
  console.error('       npm run ai:scan');
  process.exit(1);
}

// Connect to Comet
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
} catch {
  console.error('ERROR: Comet is not running with remote debugging enabled.');
  console.error('Run: npm run comet:debug');
  process.exit(1);
}

const context = browser.contexts()[0];
const pages = context.pages();

// Map open tabs to adapters
const tabMap: Array<{ adapter: ReturnType<typeof detectAdapter>; page: typeof pages[0]; url: string }> = [];
for (const page of pages) {
  const url = page.url();
  const adapter = detectAdapter(url);
  if (adapter) tabMap.push({ adapter, page, url });
}

// For targeted sites not already open, open new tabs
for (const key of targetKeys) {
  const alreadyOpen = tabMap.some(t => t.adapter?.key === key);
  if (!alreadyOpen) {
    const adapter = getAdapter(key);
    if (adapter) {
      const siteUrls: Record<string, string> = {
        perplexity: 'https://www.perplexity.ai',
        chatgpt: 'https://chatgpt.com',
        claude: 'https://claude.ai',
        gemini: 'https://gemini.google.com',
        grok: 'https://grok.com',
        copilot: 'https://copilot.microsoft.com',
        you: 'https://you.com',
      };
      const url = siteUrls[key] ?? `https://${key}.com`;
      const newPage = await context.newPage();
      await newPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      tabMap.push({ adapter, page: newPage, url });
    }
  }
}

// Check login status for all detected tabs
console.log('\n=== AI Site Login Status ===');
const loginStatus: Array<{ key: string; label: string; url: string; loggedIn: boolean }> = [];

for (const { adapter, page, url } of tabMap) {
  if (!adapter) continue;
  const loggedIn = await adapter.isLoggedIn(page).catch(() => false);
  loginStatus.push({ key: adapter.key, label: adapter.label, url, loggedIn });
  const icon = loggedIn ? '✓' : '✗';
  console.log(`${icon} ${adapter.label.padEnd(15)} ${loggedIn ? 'LOGGED IN' : 'NOT LOGGED IN'}  ${url}`);
}

if (scanOnly) {
  console.log('\nScan complete (--scan-only, no query sent).');
  process.exit(0);
}

// Filter to logged-in sites matching target keys
const queryTargets = tabMap.filter(t =>
  t.adapter &&
  targetKeys.includes(t.adapter.key) &&
  loginStatus.find(s => s.key === t.adapter!.key)?.loggedIn
);

if (queryTargets.length === 0) {
  console.error('\nNo logged-in AI sites found for the specified targets. Run npm run ai:scan to check status.');
  process.exit(1);
}

console.log(`\n=== Querying ${queryTargets.length} site(s): "${queryText}" ===\n`);

const results: Array<{ site: string; response: string; promptUsed: string; error?: string }> = [];

// Perplexity is first in ADAPTERS — query in order (primary first)
for (const { adapter, page } of queryTargets) {
  if (!adapter) continue;
  process.stderr.write(`Querying ${adapter.label}...`);
  try {
    await page.bringToFront();
    const result = await adapter.query(page, queryText);
    results.push({ site: adapter.key, response: result.response, promptUsed: result.promptUsed });
    process.stderr.write(` done (${result.response.length} chars)\n`);

    // Save prompt to library (best-effort)
    await savePrompt(adapter.key, result.promptUsed, `query: ${queryText.substring(0, 80)}`).catch(() => {});
  } catch (err) {
    const msg = (err as Error).message;
    results.push({ site: adapter.key, response: '', promptUsed: '', error: msg });
    process.stderr.write(` FAILED: ${msg}\n`);
  }
}

// Save results
mkdirSync(DATA_DIR, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = join(DATA_DIR, `ai-responses-${timestamp}.json`);
writeFileSync(outPath, JSON.stringify({ query: queryText, timestamp, results }, null, 2));

console.log('\n=== Results ===');
for (const r of results) {
  if (r.error) {
    console.log(`[${r.site}] ERROR: ${r.error}`);
  } else {
    console.log(`[${r.site}] ${r.response.substring(0, 200)}...`);
  }
}
console.log(`\nFull results saved: ${outPath}`);

// Export results for use by other scripts
export { results };
