import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const geminiAdapter: SiteAdapter = {
  label: 'Gemini',
  key: 'gemini',
  urlPattern: /gemini\.google\.com/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const signIn = document.querySelector('a[href*="accounts.google.com/signin"]');
        const avatar = document.querySelector('img[alt*="Google Account"], [aria-label*="Google Account"]');
        return !signIn && !!avatar;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('[aria-label="Enter a prompt here"], rich-textarea, [contenteditable="true"]').first();
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    await page.waitForSelector('message-content, [class*="response-content"], model-response', { timeout: 30_000 });
    const response = await waitForStableText(page, 'message-content, [class*="response-content"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
