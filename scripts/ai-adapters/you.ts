import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const youAdapter: SiteAdapter = {
  label: 'You.com',
  key: 'you',
  urlPattern: /you\.com/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const signIn = document.querySelector('a[href*="/login"], button[class*="sign-in"]');
        const profile = document.querySelector('[data-testid="profile-icon"], [aria-label*="profile"], [class*="avatar"]');
        return !signIn && !!profile;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('[data-testid="search-input"], input[name="q"], textarea').first();
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    await page.waitForSelector('[class*="source-card"], [class*="result"], [class*="answer"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '[class*="source-card"], [class*="answer"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
