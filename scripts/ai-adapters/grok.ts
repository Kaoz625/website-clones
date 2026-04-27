import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const grokAdapter: SiteAdapter = {
  label: 'Grok',
  key: 'grok',
  urlPattern: /grok\.com|x\.com\/grok/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const loginBtn = document.querySelector('a[href*="/login"], [data-testid="loginButton"]');
        const userMenu = document.querySelector('[data-testid="UserAvatar"], [aria-label*="Account menu"]');
        return !loginBtn && !!userMenu;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('textarea[placeholder], [contenteditable="true"]').first();
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    await page.waitForSelector('[class*="message-bubble"], [class*="response"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '[class*="message-bubble"], [class*="response"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
