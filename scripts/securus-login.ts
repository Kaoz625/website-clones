/**
 * Shared Securus login module — works in both headed (CDP) and headless modes.
 * Import getSecurusPage() instead of wiring up browser connections manually.
 *
 * Usage:
 *   const { page, cleanup } = await getSecurusPage();
 *   // ... do your Securus work ...
 *   await cleanup();
 */

import { chromium, type Page, type BrowserContext } from 'playwright';
import { mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { debugShot, waitForPageStable } from './securus-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CDP_URL = 'http://127.0.0.1:9222';
const COMET_EXE = '/Applications/Comet.app/Contents/MacOS/Comet';
const COMET_PROFILE = `${process.env.HOME}/Library/Application Support/Comet/Default`;
const SECURUS_URL = 'https://securustech.online/#/login';

const SECURUS_USER = process.env.SECURUS_USER ?? '';
const SECURUS_PASS = process.env.SECURUS_PASS ?? '';

export interface SecurusSession {
  page: Page;
  context: BrowserContext;
  cleanup: () => Promise<void>;
}

/**
 * Check whether the current page is already showing a logged-in Securus dashboard.
 * Returns true if logged in, false if a login form is visible.
 */
async function detectLoginState(page: Page): Promise<boolean> {
  // URL-based check first — most reliable for SPAs
  const url = page.url();
  if (!/\/(login|sign-?in)/i.test(url)) return true;

  return page.evaluate(() => {
    // "SIGN OUT" / "Sign Out" in the nav is the most reliable logged-in indicator
    const allText = Array.from(document.querySelectorAll('a, button'))
      .map(el => el.textContent?.trim().toLowerCase() ?? '');
    if (allText.some(t => t === 'sign out' || t === 'signout' || t === 'log out' || t === 'logout')) return true;

    // Other logged-in indicators
    const loggedInSelectors = [
      '[class*="dashboard"]',
      '[class*="inbox"]',
      '[class*="emessage"]',
      'a[href*="inbox"]',
      'button:is([class*="compose"])',
    ];
    for (const sel of loggedInSelectors) {
      if (document.querySelector(sel)) return true;
    }
    // Login form indicator — only conclusive if URL is still on login page
    const loginForm = document.querySelector('input[type="password"]');
    if (loginForm) return false;
    return true;
  }).catch(() => false);
}

/**
 * Fill and submit the Securus login form.
 * Handles multiple selector variants across Securus site versions.
 */
async function performLogin(page: Page): Promise<void> {
  if (!SECURUS_USER || !SECURUS_PASS) {
    throw new Error('SECURUS_USER and SECURUS_PASS must be set in .env');
  }

  console.error('[securus-login] Waiting for login form...');

  // Wait for username field — try multiple selector variants
  const userSelectors = [
    'input[name*="user"]',
    'input[type="email"]',
    'input[name*="email"]',
    '#username',
    'input[placeholder*="email" i]',
    'input[placeholder*="user" i]',
  ].join(', ');

  await page.waitForSelector(userSelectors, { state: 'visible', timeout: 20_000 });

  // Fill credentials
  await page.fill(userSelectors, SECURUS_USER);
  await page.fill('input[type="password"]', SECURUS_PASS);

  await debugShot(page, 'pre-login');

  // Submit
  const submitSelectors = [
    '[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("Login")',
    'button:has-text("Sign In")',
    'input[type="submit"]',
  ].join(', ');

  await page.click(submitSelectors);

  // Wait for SPA to route away from the login page
  await page.waitForFunction(
    () => !window.location.hash.includes('login'),
    { timeout: 20_000 }
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(500);

  await debugShot(page, 'post-login');

  // Verify we're logged in
  const loggedIn = await detectLoginState(page);
  if (!loggedIn) {
    // Still on login page — check for error message
    const errMsg = await page.evaluate(() => {
      const errEl = document.querySelector('[class*="error"], [class*="alert"], .notification');
      return errEl?.textContent?.trim() ?? null;
    }).catch(() => null);
    throw new Error(
      `Securus login failed${errMsg ? `: ${errMsg}` : ' — still showing login form. Check SECURUS_USER and SECURUS_PASS in .env'}`
    );
  }

  console.error('[securus-login] Logged in successfully.');
}

/**
 * Navigate the page to Securus and ensure it's on the main site.
 */
async function ensureOnSecurus(page: Page): Promise<void> {
  const url = page.url();
  if (!/securustech\.online/i.test(url)) {
    console.error('[securus-login] Navigating to Securus...');
    await page.goto(SECURUS_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await waitForPageStable(page);
  }
}

/**
 * Headed mode: connect to an already-running Comet via CDP.
 * Handles login if needed. Comet must be running with --remote-debugging-port=9222.
 * Run `npm run comet:debug` first if you get a connection error.
 */
async function headedSession(): Promise<SecurusSession> {
  console.error('[securus-login] Mode: headed Comet via CDP');

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    console.error('');
    console.error('ERROR: Cannot connect to Comet. Relaunch it with remote debugging:');
    console.error('  npm run comet:debug');
    console.error('');
    process.exit(1);
  }

  const context = browser.contexts()[0];

  // Reuse existing Securus tab or open a new one
  let page = context.pages().find(p => /securustech\.online/i.test(p.url()));
  if (!page) {
    console.error('[securus-login] Opening new Securus tab...');
    page = await context.newPage();
  }

  await page.bringToFront();
  await ensureOnSecurus(page);
  await waitForPageStable(page);

  const loggedIn = await detectLoginState(page);
  if (!loggedIn) {
    await performLogin(page);
  } else {
    console.error('[securus-login] Already logged in.');
  }

  return {
    page,
    context,
    // Never close the browser on CDP — that kills the live Comet window
    cleanup: async () => { await page!.bringToFront(); },
  };
}

/**
 * Headless mode: use Playwright's bundled Chromium with fresh credential login.
 * Avoids Comet's internal startup pages (e.g. chrome://perplexity-onboarding/)
 * that crash launchPersistentContext. Credentials come from SECURUS_USER/PASS env.
 */
async function headlessSession(): Promise<SecurusSession> {
  console.error('[securus-login] Mode: headless Chromium (fresh login)');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(SECURUS_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await waitForPageStable(page);

  const loggedIn = await detectLoginState(page);
  if (!loggedIn) {
    await performLogin(page);
  } else {
    console.error('[securus-login] Already logged in.');
  }

  return {
    page,
    context,
    cleanup: async () => { await browser.close(); },
  };
}

/**
 * Launched headed mode: opens a NEW visible Chromium window automatically.
 * No Comet required. User can watch every step happen in real time.
 */
async function launchedSession(): Promise<SecurusSession> {
  console.error('[securus-login] Mode: headed Chromium (new visible window)');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 600,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  await page.goto(SECURUS_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  await waitForPageStable(page);

  const loggedIn = await detectLoginState(page);
  if (!loggedIn) {
    await performLogin(page);
  } else {
    console.error('[securus-login] Already logged in.');
  }

  return {
    page,
    context,
    cleanup: async () => { await browser.close(); },
  };
}

/**
 * Get a fully logged-in Securus page.
 *
 * @param opts.mode  'launch' (default) — new visible browser window, no Comet needed
 *                   'headless'         — invisible Chromium
 *                   'comet'            — CDP attach to running Comet (port 9222)
 */
export async function getSecurusPage(opts?: { headless?: boolean; mode?: 'launch' | 'headless' | 'comet' }): Promise<SecurusSession> {
  const screenshotsDir = join(__dirname, '..', 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  const mode = opts?.mode ?? (opts?.headless ? 'headless' : 'launch');
  if (mode === 'comet') return headedSession();
  if (mode === 'headless') return headlessSession();
  return launchedSession();
}
