#!/usr/bin/env tsx
/**
 * Opens UIVision recorder in Comet pointed at a target site.
 * After recording, save the macro as "<site>-login" in UIVision.
 * Usage: npm run uivision:record -- https://claude.ai claude
 */

import { chromium } from 'playwright';
import 'dotenv/config';

const CDP_URL = 'http://localhost:9222';
const UIVISION_EXTENSION_ID = 'knipolnnllmklapflnccelgolnpehhpl';

const targetUrl = process.argv[2] ?? 'https://claude.ai';
const siteName = process.argv[3] ?? 'site';

let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
} catch {
  console.error('ERROR: Comet is not running with remote debugging enabled.');
  console.error('Run: npm run comet:debug');
  process.exit(1);
}

const context = browser.contexts()[0];

// Open UIVision recorder
const recorderUrl = `chrome-extension://${UIVISION_EXTENSION_ID}/html/rpa.html`;
const recorderPage = await context.newPage();
await recorderPage.goto(recorderUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

// Open target site in another tab
const sitePage = await context.newPage();
await sitePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
await sitePage.bringToFront();

console.log('\n========================================');
console.log(`UIVision recorder is open.`);
console.log(`Target site: ${targetUrl}`);
console.log('');
console.log('Instructions:');
console.log('1. Switch to the UIVision recorder tab');
console.log('2. Click "Record" to start recording');
console.log('3. Complete the login on the site tab');
console.log(`4. Stop recording and save the macro as: ${siteName}-login`);
console.log(`5. The macro JSON will be saved to: data/uivision-macros/${siteName}-login.json`);
console.log('========================================\n');
console.log('Press Ctrl+C when done recording.');

// Keep process alive until user interrupts
await new Promise<void>(resolve => process.on('SIGINT', resolve));

console.log('\nRecording session ended. Remember to export the macro JSON to data/uivision-macros/');
