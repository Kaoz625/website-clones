import type { Page } from 'playwright';
import type { SiteAdapter, QueryResult } from './index.js';
import { waitForStableText } from './index.js';

const PROMPT_TEMPLATE = '{query}';

export const chatgptAdapter: SiteAdapter = {
  label: 'ChatGPT',
  key: 'chatgpt',
  urlPattern: /chat\.openai\.com|chatgpt\.com/,

  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        const loginBtn = document.querySelector('[data-testid="login-button"], a[href*="/auth/login"]');
        const avatar = document.querySelector('[data-testid="user-avatar"], nav [class*="avatar"], [aria-label*="User"]');
        return !loginBtn && !!avatar;
      });
    } catch {
      return false;
    }
  },

  async query(page: Page, text: string): Promise<QueryResult> {
    const prompt = PROMPT_TEMPLATE.replace('{query}', text);

    const input = page.locator('#prompt-textarea, [data-testid="prompt-textarea"]');
    await input.waitFor({ timeout: 10_000 });
    await input.click();
    await input.fill(prompt);

    const sendBtn = page.locator('[data-testid="send-button"]');
    await sendBtn.click();

    await page.waitForSelector('.markdown, [class*="message-content"]', { timeout: 30_000 });
    const response = await waitForStableText(page, '.markdown', { maxMs: 60_000 });

    return { response, promptUsed: prompt };
  },
};
