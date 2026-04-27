import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
let browser = null;
async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}
export async function screenshotUrl(url, outputPath, opts = {}) {
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
    }
    finally {
        await context.close();
    }
    return outputPath;
}
export async function screenshotFile(htmlPath, outputPath, opts = {}) {
    return screenshotUrl(`file://${htmlPath}`, outputPath, opts);
}
export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}
//# sourceMappingURL=browser.js.map