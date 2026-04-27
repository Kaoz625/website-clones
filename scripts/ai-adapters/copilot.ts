import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const copilotAdapter: SiteAdapter = {
  label: 'Copilot',
  key: 'copilot',
  urlPattern: /copilot\.microsoft\.com/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const signIn = document.querySelector('a[href*="login.microsoftonline"], button[id*="login"]');
        const avatar = document.querySelector('[aria-label*="profile"], [class*="avatar"], [id*="mectrl"]');
        return !signIn && !!avatar;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('#userInput, [placeholder*="Message"], textarea').first();
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    await page.waitForSelector('.ac-textBlock, [class*="response"], [class*="message"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '.ac-textBlock, [class*="response"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
