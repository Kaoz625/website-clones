import type { Page } from 'playwright';

export interface QueryResult {
  response: string;
  promptUsed: string;
}

export interface SiteAdapter {
  label: string;
  key: string;
  urlPattern: RegExp;
  isLoggedIn(page: Page): Promise<boolean>;
  query(page: Page, text: string): Promise<QueryResult>;
}

import { chatgptAdapter } from './chatgpt.js';
import { claudeAdapter } from './claude.js';
import { geminiAdapter } from './gemini.js';
import { perplexityAdapter } from './perplexity.js';
import { grokAdapter } from './grok.js';
import { copilotAdapter } from './copilot.js';
import { youAdapter } from './you.js';

// Perplexity is listed first — it is the primary research engine
export const ADAPTERS: SiteAdapter[] = [
  perplexityAdapter,
  claudeAdapter,
  chatgptAdapter,
  geminiAdapter,
  grokAdapter,
  copilotAdapter,
  youAdapter,
];

export function detectAdapter(url: string): SiteAdapter | null {
  return ADAPTERS.find(a => a.urlPattern.test(url)) ?? null;
}

export function getAdapter(key: string): SiteAdapter | null {
  return ADAPTERS.find(a => a.key === key) ?? null;
}

// Poll page until response text stabilizes (stops changing)
export async function waitForStableText(
  page: Page,
  selector: string,
  opts: { maxMs?: number; stableMs?: number } = {}
): Promise<string> {
  const maxMs = opts.maxMs ?? 60_000;
  const stableMs = opts.stableMs ?? 2_000;
  const deadline = Date.now() + maxMs;
  let last = '';
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    const current = await page.evaluate(
      (sel) => [...document.querySelectorAll(sel)].map(el => (el as HTMLElement).innerText).join('\n'),
      selector
    ).catch(() => '');

    if (current !== last) {
      last = current;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableMs && last.length > 0) {
      break;
    }
  }
  return last.trim();
}
