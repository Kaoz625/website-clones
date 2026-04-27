import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const perplexityAdapter: SiteAdapter = {
  label: 'Perplexity',
  key: 'perplexity',
  urlPattern: /perplexity\.ai/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      // Logged-in users have a sidebar with profile/account icon
      const loggedIn = await page.evaluate(() => {
        const signInBtn = document.querySelector('[data-testid="login-button"], a[href*="/login"], button[class*="signin"]');
        const profileEl = document.querySelector('[data-testid="user-avatar"], img[alt*="avatar"], [aria-label*="account"]');
        return !signInBtn && !!profileEl;
      });
      return loggedIn;
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    // Navigate to home to ensure clean state
    if (!page.url().includes('perplexity.ai')) {
      await page.goto('https://www.perplexity.ai', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    }

    // Find and fill the search input
    const input = page.locator('textarea').first();
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    // Wait for response to appear and stabilize
    await page.waitForSelector('.prose, [class*="answer"], [class*="response"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '.prose, [class*="answer"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
