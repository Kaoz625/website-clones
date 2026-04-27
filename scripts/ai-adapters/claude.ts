import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const claudeAdapter: SiteAdapter = {
  label: 'Claude',
  key: 'claude',
  urlPattern: /claude\.ai/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const loginBtn = document.querySelector('a[href*="/login"], button[class*="login"]');
        const sidebar = document.querySelector('[class*="sidebar"], nav[class*="nav"]');
        return !loginBtn && !!sidebar;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('.ProseMirror[contenteditable="true"]');
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);
    await page.keyboard.press('Enter');

    await page.waitForSelector('[class*="font-claude-message"], [data-testid="message"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '[class*="font-claude-message"]', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
