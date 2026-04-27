import type { Page } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MACROS_DIR = join(__dirname, '..', '..', 'data', 'uivision-macros');

// UIVision extension ID in Comet (may need updating if extension is reinstalled)
const UIVISION_EXTENSION_ID = 'knipolnnllmklapflnccelgolnpehhpl';

/**
 * Triggers a named UIVision macro by navigating to the extension's run URL.
 * The macro JSON file must exist in data/uivision-macros/<name>.json
 */
export async function triggerMacro(page: Page, macroName: string): Promise<boolean> {
  const macroPath = join(MACROS_DIR, `${macroName}.json`);

  if (!existsSync(macroPath)) {
    console.error(`UIVision macro not found: ${macroPath}`);
    console.error(`Record it first with: npm run uivision:record`);
    return false;
  }

  const macro = JSON.parse(readFileSync(macroPath, 'utf-8')) as { Name?: string };
  const macroName_ = macro.Name ?? macroName;

  try {
    // UIVision can be triggered via its extension storage URL
    const runUrl = `chrome-extension://${UIVISION_EXTENSION_ID}/html/rpa.html#macros/${encodeURIComponent(macroName_)}`;
    await page.goto(runUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });

    // Click "Run Macro" button if present
    const runBtn = page.locator('button:has-text("Run"), #btnPlay, [title="Run Macro"]').first();
    if (await runBtn.isVisible({ timeout: 3_000 })) {
      await runBtn.click();
    }

    // Wait for macro to complete (look for "Macro finished" or status message)
    await page.waitForSelector(
      '#status:has-text("finished"), #status:has-text("Macro finished"), .macro-complete',
      { timeout: 60_000 }
    ).catch(() => {
      // Non-fatal — macro may have finished without this indicator
    });

    console.error(`UIVision macro "${macroName_}" triggered`);
    return true;
  } catch (err) {
    console.error(`UIVision macro failed: ${(err as Error).message}`);
    return false;
  }
}
