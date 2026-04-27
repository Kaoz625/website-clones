import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Page } from 'playwright';

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');

export function parseTarget(): string {
  const flag = process.argv.find(a => a.startsWith('--target='));
  if (flag) return flag.split('=')[1];
  const idx = process.argv.indexOf('--target');
  if (idx !== -1) return process.argv[idx + 1];
  const bare = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (bare) return bare;
  console.error('Usage: --target <url>');
  process.exit(1);
}

export function targetKey(url: string): string {
  return new URL(url).hostname.replace(/\./g, '_');
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function saveFindings(target: string, tool: string, data: unknown): string {
  const dir = join(ROOT, 'data', 'bugbounty', targetKey(target));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${tool}-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

export async function saveScreenshot(page: Page, target: string, label: string): Promise<string> {
  const dir = join(ROOT, 'screenshots', 'bugbounty');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${targetKey(target)}-${label}-${timestamp()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export const REDIRECT_PARAMS = [
  'next', 'url', 'redirect', 'return', 'goto', 'redir',
  'destination', 'callback', 'continue', 'returnUrl', 'returnTo',
  'back', 'forward', 'target', 'href', 'link',
];

export const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "'><svg onload=alert(1)>",
  'javascript:alert(1)',
  '"><details open ontoggle=alert(1)>',
];
