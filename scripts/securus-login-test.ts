#!/usr/bin/env tsx
/**
 * Smoke test: runs headed AND headless Securus login in parallel.
 * Verifies both modes navigate to securustech.online and log in successfully.
 *
 * Usage:
 *   npm run securus:test            # both modes in parallel
 *   npm run securus:test:headed     # headed only (COMET_HEADED=true)
 *   npm run securus:test:headless   # headless only
 */

import { getSecurusPage } from './securus-login.js';
import { debugShot } from './securus-helpers.js';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, '..', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const mode = process.argv[2]; // 'headed' | 'headless' | undefined (both)

interface TestResult {
  mode: string;
  pass: boolean;
  url: string;
  screenshotPath: string;
  error?: string;
}

async function runTest(headless: boolean): Promise<TestResult> {
  const label = headless ? 'headless' : 'headed';
  console.log(`[${label}] Starting login test...`);

  try {
    const { page, cleanup } = await getSecurusPage({ headless });

    const url = page.url();
    const shotPath = join(SHOTS, `${label}-post-login.png`);
    await page.screenshot({ path: shotPath });

    // Check we're not still on login page
    const onLoginPage = await page.evaluate(() =>
      !!document.querySelector('input[type="password"]')
    );

    await cleanup();

    const pass = !onLoginPage;
    console.log(`[${label}] ${pass ? '✓ PASS' : '✗ FAIL'} — URL: ${url}`);
    return { mode: label, pass, url, screenshotPath: shotPath };
  } catch (err) {
    console.error(`[${label}] ✗ ERROR: ${(err as Error).message}`);
    return { mode: label, pass: false, url: '', screenshotPath: '', error: (err as Error).message };
  }
}

const tests: Promise<TestResult>[] = [];

if (!mode || mode === 'headed') {
  tests.push(runTest(false));
}
if (!mode || mode === 'headless') {
  tests.push(runTest(true));
}

const results = await Promise.allSettled(tests);
const summary = results.map(r => r.status === 'fulfilled' ? r.value : { mode: '?', pass: false, error: String(r.reason) });

console.log('\n========== RESULTS ==========');
for (const r of summary) {
  const icon = r.pass ? '✓' : '✗';
  console.log(`  ${icon} ${r.mode.padEnd(10)} ${r.pass ? 'PASS' : 'FAIL'}${r.error ? ' — ' + r.error : ''}`);
  if (r.screenshotPath) console.log(`             Screenshot: ${r.screenshotPath}`);
}
console.log('==============================\n');

const allPassed = summary.every(r => r.pass);
process.exit(allPassed ? 0 : 1);
