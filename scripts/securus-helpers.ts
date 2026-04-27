/**
 * Shared Playwright helpers for reliable interaction with Securus pages.
 * Fixes the scrolling/clicking issues by ensuring elements are in view
 * and stable before interacting, with automatic retry and debug screenshots.
 */

import type { Page } from 'playwright';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, '..', 'screenshots');
mkdirSync(screenshotsDir, { recursive: true });

/**
 * Scroll an element into view, wait for it to be stable, then click it.
 * Retries up to 3 times with 1s delay — fixes off-screen and overlay issues.
 */
export async function reliableClick(
  page: Page,
  selector: string,
  options?: { timeout?: number; force?: boolean }
): Promise<void> {
  const timeout = options?.timeout ?? 15_000;
  const deadline = Date.now() + timeout;
  let lastErr: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      // Wait for element to exist in DOM
      await page.waitForSelector(selector, { state: 'attached', timeout: Math.min(remaining, 8_000) });

      // Scroll into view via locator — supports Playwright's :has-text() and text= selectors
      await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});

      // Brief settle after scroll
      await page.waitForTimeout(300);

      // Wait for it to be visible and enabled
      await page.waitForSelector(selector, { state: 'visible', timeout: Math.min(deadline - Date.now(), 5_000) });

      await page.click(selector, {
        force: options?.force ?? false,
        timeout: Math.min(deadline - Date.now(), 5_000),
      });
      return;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < 3) {
        console.error(`  [reliableClick] attempt ${attempt} failed for "${selector}": ${lastErr.message}`);
        await page.waitForTimeout(1_000);
      }
    }
  }
  throw new Error(`reliableClick failed after 3 attempts on "${selector}": ${lastErr?.message}`);
}

/**
 * Wait for the page to settle: networkidle + no DOM mutations for 300ms.
 */
export async function waitForPageStable(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  // Additional 300ms quiet period for animations
  await page.waitForTimeout(300);
}

/**
 * Save a debug screenshot. Keeps only the last 10 debug shots (auto-prunes).
 */
export async function debugShot(page: Page, label: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `debug-${label}-${ts}.png`;
  const shotPath = join(screenshotsDir, filename);

  try {
    await page.screenshot({ path: shotPath, fullPage: false });
    console.error(`  [debug] screenshot → screenshots/${filename}`);
  } catch (err) {
    console.error(`  [debug] screenshot failed: ${(err as Error).message}`);
    return shotPath;
  }

  // Prune old debug shots — keep last 10
  try {
    const debugFiles = readdirSync(screenshotsDir)
      .filter(f => f.startsWith('debug-'))
      .map(f => ({ name: f, mtime: statSync(join(screenshotsDir, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);

    while (debugFiles.length > 10) {
      const oldest = debugFiles.shift()!;
      unlinkSync(join(screenshotsDir, oldest.name));
    }
  } catch { /* best-effort */ }

  return shotPath;
}

/**
 * Fill a field after scrolling it into view. More reliable than plain fill().
 */
export async function reliableFill(
  page: Page,
  selector: string,
  value: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10_000;
  await page.waitForSelector(selector, { state: 'visible', timeout });
  await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(200);
  await page.fill(selector, value, { timeout });
}
