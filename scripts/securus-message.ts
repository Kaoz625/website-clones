#!/usr/bin/env tsx
/**
 * Sends the one-time onboarding message to Jared Eng via Securus emessaging.
 * Usage:
 *   npm run securus:send              (headed — Comet must be running)
 *   npm run securus:send:headless     (headless — no Comet window needed)
 */

import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { getSecurusPage } from './securus-login.js';
import { reliableClick, reliableFill, waitForPageStable, debugShot } from './securus-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

const mode = process.argv.includes('--headless') ? 'headless' : process.argv.includes('--comet') ? 'comet' : 'launch';

const MESSAGE_SUBJECT = 'testing research';
const MESSAGE_BODY = `testing how i can get some research done for you faster.  whenever you need something researched say "Lyreos research ... for me" that way i can know what you need and better assist you.  if you have the option to send a stamp with your reply i want you to send one for the reply back.`;
const CONTACT_NAME = 'Jared Eng';

const screenshotsDir = join(__dirname, '..', 'screenshots');
mkdirSync(screenshotsDir, { recursive: true });

// Get a fully logged-in Securus page
const { page, context, cleanup } = await getSecurusPage({ mode });

await debugShot(page, 'securus-ready');

// Click Launch under emessaging — scroll into view before clicking
console.error('Looking for emessaging Launch button...');
await reliableClick(page, 'button:has-text("Launch"), a:has-text("Launch"), [class*="launch"]', { timeout: 20_000 });

// Wait for the emessaging SPA to navigate — watch for the sidebar "Compose" link or inbox heading
console.error('Waiting for emessaging inbox to load...');
await page.waitForSelector(
  'text=SECURUS EMESSAGING, [class*="emessaging"] h1, h1:has-text("emessaging"), h2:has-text("emessaging"), text=Compose',
  { state: 'visible', timeout: 30_000 }
).catch(() => {});
await waitForPageStable(page);

// Check if a new tab opened
let emessagingPage = page;
const allPages = context.pages();
const newestPage = allPages[allPages.length - 1];
if (newestPage !== page) {
  emessagingPage = newestPage;
  console.error('Switched to emessaging popup/tab.');
  await emessagingPage.bringToFront();
  await waitForPageStable(emessagingPage);
}

await debugShot(emessagingPage, 'emessaging-loaded');

// Close chat widget first so it doesn't intercept sidebar clicks
const chatClose = emessagingPage.locator('[aria-label*="close" i]:not(nav *), [class*="chat-close"], [class*="chatClose"]').first();
if (await chatClose.isVisible({ timeout: 2_000 }).catch(() => false)) {
  await chatClose.click().catch(() => {});
  await emessagingPage.waitForTimeout(300);
}

// Click Compose — retry once if the compose form doesn't appear
const COMPOSE_SEL = 'nav a:has-text("Compose"), aside a:has-text("Compose"), ul li a:has-text("Compose"), a:has-text("Compose")';
const CONTACT_SEL = '#select-inmate, select[name="selectInmate"], [formcontrolname="selectInmate"]';

for (let attempt = 1; attempt <= 2; attempt++) {
  console.error(`Clicking Compose (attempt ${attempt})...`);
  await emessagingPage.waitForSelector('nav a, aside a, ul li a', { state: 'visible', timeout: 10_000 }).catch(() => {});
  await reliableClick(emessagingPage, COMPOSE_SEL, { timeout: 15_000 });

  console.error('Waiting for compose form contact select...');
  const found = await emessagingPage.waitForSelector(CONTACT_SEL, { state: 'attached', timeout: 40_000 })
    .then(() => true).catch(() => false);

  if (found) {
    console.error('Compose form loaded.');
    break;
  }
  if (attempt === 2) throw new Error('Compose form did not load after 2 attempts — contact select never appeared');
  console.error('Compose form not found — retrying...');
  await waitForPageStable(emessagingPage);
}

await debugShot(emessagingPage, 'compose-open');

// Select contact: Jared Eng
// The "Select Contact" field is a native <select> (styled). Use selectOption directly.
console.error(`Selecting contact: ${CONTACT_NAME}`);

// Find the contact <select> by id (Angular form: id="select-inmate")
const contactSelectSel = '#select-inmate, select[name="selectInmate"], select:not([aria-label*="navigation" i])';

// Find the matching option value by case-insensitive text match
const contactValue = await emessagingPage.evaluate((args) => {
  const selects = document.querySelectorAll(args.sel);
  for (const el of selects) {
    const sel = el as HTMLSelectElement;
    const opt = Array.from(sel.options).find(o =>
      o.text.trim().toLowerCase().includes(args.name.toLowerCase())
    );
    if (opt) return opt.value;
  }
  return null;
}, { sel: contactSelectSel, name: CONTACT_NAME });

if (!contactValue) throw new Error(`Contact "${CONTACT_NAME}" not found in select options`);
console.error(`Selecting by value: ${contactValue}`);

await emessagingPage.locator('#select-inmate, select[name="selectInmate"]').selectOption({ value: contactValue });
await emessagingPage.waitForTimeout(500);

await debugShot(emessagingPage, 'contact-selected');

// Securus shows a "DRAFT MESSAGE" dialog after contact selection if a prior draft exists.
// The dialog's reveal-overlay will block SEND if not dismissed here.
console.error('Checking for Draft Message dialog (post-contact-select)...');
const draftDialogVisible = await emessagingPage.isVisible('.reveal-overlay', { timeout: 3_000 }).catch(() => false);
if (draftDialogVisible) {
  console.error('Draft dialog overlay detected — clicking OK to discard draft...');
  await emessagingPage.locator('text=OK').first().click({ timeout: 6_000 });
  await emessagingPage.waitForTimeout(800);

  // Securus shows a second "DELETE CONFIRMATION" dialog — click DELETE to confirm
  const hasDeleteConfirm = await emessagingPage.isVisible('button:has-text("DELETE")', { timeout: 4_000 }).catch(() => false);
  if (hasDeleteConfirm) {
    console.error('Delete confirmation dialog — clicking DELETE...');
    await emessagingPage.locator('button:has-text("DELETE")').click({ timeout: 6_000 });
    await waitForPageStable(emessagingPage);

    // Form resets after deleting draft — re-select the contact
    console.error('Re-selecting contact after draft deletion...');
    await emessagingPage.waitForSelector('#select-inmate, select[name="selectInmate"]', { state: 'attached', timeout: 15_000 });
    await emessagingPage.locator('#select-inmate, select[name="selectInmate"]').selectOption({ value: contactValue! });
    await emessagingPage.waitForTimeout(500);
    // Wait for subject field to become enabled
    await emessagingPage.waitForSelector('[formcontrolname="subject"]:not([disabled])', { timeout: 10_000 }).catch(() => {});
  }
  await debugShot(emessagingPage, 'draft-dismissed');
} else {
  console.error('No draft dialog — proceeding.');
}

// Fill subject — Angular form input (formcontrolname="subject" or similar)
console.error('Filling subject...');
await reliableFill(
  emessagingPage,
  '[formcontrolname="subject"], [formcontrolname="Subject"], input[name*="subject" i], input[id*="subject" i], input[placeholder*="subject" i]',
  MESSAGE_SUBJECT,
  { timeout: 10_000 }
);

// Fill message body — <textarea> in Compose Message section
console.error('Filling message body...');
await reliableFill(emessagingPage, 'textarea', MESSAGE_BODY, { timeout: 10_000 });

console.error(`Message length: ${MESSAGE_BODY.length} / 19996 chars`);

await debugShot(emessagingPage, 'pre-send');

// Explicitly uncheck "Provide Return Stamp" checkbox — Jared sends his own stamp back
console.error('Checking for "Provide Return Stamp" checkbox...');
const stampCheckboxSel = [
  'label:has-text("Return Stamp") input[type="checkbox"]',
  'label:has-text("Provide Return Stamp") input[type="checkbox"]',
  'input[type="checkbox"][id*="stamp" i]',
  'input[type="checkbox"][name*="stamp" i]',
].join(', ');
const stampCheckbox = emessagingPage.locator(stampCheckboxSel).first();
const stampCheckboxVisible = await stampCheckbox.isVisible().catch(() => false);
if (stampCheckboxVisible) {
  const isChecked = await stampCheckbox.isChecked().catch(() => false);
  if (isChecked) {
    await stampCheckbox.uncheck();
    console.error('Return Stamp checkbox was checked — unchecked it.');
  } else {
    console.error('Return Stamp checkbox already unchecked — nothing to do.');
  }
} else {
  console.error('Return Stamp checkbox not found — skipping.');
}
await debugShot(emessagingPage, 'pre-send-stamp-unchecked');

// Close chat minibox and any remaining overlays before clicking SEND
console.error('Clearing overlays before Send...');
await emessagingPage.evaluate(() => {
  // Close Securus chat widget
  const minibox = document.getElementById('minibox');
  if (minibox) minibox.style.display = 'none';
  // Neutralize any reveal-overlay backdrops
  document.querySelectorAll('.reveal-overlay').forEach(el => (el as HTMLElement).style.pointerEvents = 'none');
});
await emessagingPage.waitForTimeout(300);

// Click SEND button
console.error('Clicking Send...');
await reliableClick(emessagingPage, 'button[type="submit"][name="submit"]', { timeout: 10_000, force: true });
await waitForPageStable(emessagingPage);

// Handle any confirmation dialog that appears after clicking SEND
console.error('Checking for confirmation dialog...');
const confirmSel = 'button:has-text("Confirm"), button:has-text("OK"), button:has-text("Yes")';
const hasConfirm = await emessagingPage.isVisible(confirmSel, { timeout: 6_000 }).catch(() => false);
if (hasConfirm) {
  console.error('Confirmation dialog appeared — clicking confirm...');
  await reliableClick(emessagingPage, confirmSel, { timeout: 8_000 });
  await waitForPageStable(emessagingPage);
} else {
  console.error('No confirmation dialog — message sent directly.');
}

await debugShot(emessagingPage, 'post-send');

// Navigate to Sent tab and verify the message is there
console.error('Navigating to Sent tab to verify...');
await reliableClick(emessagingPage, 'nav a:has-text("Sent"), aside a:has-text("Sent"), ul li a:has-text("Sent"), a:has-text("Sent")', { timeout: 10_000 });
await waitForPageStable(emessagingPage);
await debugShot(emessagingPage, 'sent-folder');

const sentConfirmed = await emessagingPage.evaluate((subject) => {
  return document.body.innerText.includes(subject);
}, MESSAGE_SUBJECT);
console.error(sentConfirmed
  ? `VERIFIED: "${MESSAGE_SUBJECT}" found in Sent folder.`
  : `WARNING: "${MESSAGE_SUBJECT}" NOT found in Sent folder — check manually.`
);

// Final screenshot
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const shotPath = join(screenshotsDir, `securus-sent-${timestamp}.png`);
await emessagingPage.screenshot({ path: shotPath });
console.error(`Screenshot saved: ${shotPath}`);

// Log to Supabase
try {
  await supabase.from('securus_log').insert({
    direction: 'outbound',
    contact: CONTACT_NAME,
    subject: MESSAGE_SUBJECT,
    body: MESSAGE_BODY,
    sent_at: new Date().toISOString(),
    status: 'sent',
  });
  console.error('Logged to Supabase: securus_log');
} catch {
  console.error('Supabase log skipped (not connected)');
}

await cleanup();

console.log(`\nMessage sent to ${CONTACT_NAME} successfully.`);
console.log(`Screenshot: ${shotPath}`);
