import { chromium, type Browser, type Page } from 'playwright';
import { launchHeadlessComet } from './comet-headless.ts';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let browser: Browser | null = null;
let stopComet: (() => Promise<void>) | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    const launched = await launchHeadlessComet({ chromium });
    browser = launched.browser;
    stopComet = launched.close;
  }
  return browser;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  width?: number;
  height?: number;
}

export async function screenshotUrl(
  url: string,
  outputPath: string,
  opts: ScreenshotOptions = {}
): Promise<string> {
  mkdirSync(dirname(outputPath), { recursive: true });

  const b = await getBrowser();
  const context = await b.newContext({
    viewport: {
      width: opts.width ?? 1440,
      height: opts.height ?? 900,
    },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(1_000);
    await page.screenshot({
      path: outputPath,
      fullPage: opts.fullPage ?? false,
    });
  } finally {
    await context.close();
  }

  return outputPath;
}

export async function screenshotFile(
  htmlPath: string,
  outputPath: string,
  opts: ScreenshotOptions = {}
): Promise<string> {
  return screenshotUrl(`file://${htmlPath}`, outputPath, opts);
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    if (stopComet) {
      await stopComet();
      stopComet = null;
    } else {
      await browser.close();
    }
    browser = null;
  }
}
