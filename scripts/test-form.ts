import { chromium } from 'playwright';

const BASE = 'http://localhost:3030/form/';

const FIELDS = [
  { step: 1, id: 'input-1', value: 'Jane' },
  { step: 2, id: 'input-2', value: 'Smith' },
  { step: 3, id: 'input-3', value: '+1 (212) 555-0100' },
  { step: 4, id: 'input-4', value: 'Acme Inc.' },
  { step: 5, id: 'input-5', value: 'jane@acme.com' },
  { step: 6, id: 'input-6', value: 'CEO' },
  { step: 7, id: 'input-7', value: '11–50' },
  { step: 8, id: 'input-8', value: 'Technology' },
  { step: 9, id: 'input-9', value: 'LinkedIn' },
  { step: 10, id: 'input-10', value: 'Automate browser workflows' },
  { step: 11, id: 'input-11', value: 'https://acme.com' },
  { step: 12, id: 'input-12', value: 'Looking forward to it!' },
];

const bugs: string[] = [];

async function pause(ms = 600) {
  await new Promise(r => setTimeout(r, ms));
}

const browser = await chromium.launch({ headless: false, slowMo: 80 });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

console.log('\n── Navigating to form ──');
await page.goto(BASE, { waitUntil: 'networkidle' });
await pause(800);

// ── Test 1: empty submit should shake, not advance ──
console.log('\n── Test: empty submission on step 1 ──');
await page.keyboard.press('Enter');
await pause(500);
const stillOnStep1 = await page.$('.slide[data-step="1"].active');
if (!stillOnStep1) {
  bugs.push('BUG: Empty submit on step 1 advanced the form — validation not working');
} else {
  console.log('  ✓ Empty submit blocked correctly');
}

// ── Fill all data steps ──
for (const field of FIELDS) {
  console.log(`\n── Step ${field.step}: filling "${field.value}" ──`);

  const input = await page.$(`#${field.id}`);
  if (!input) {
    bugs.push(`BUG: Input #${field.id} not found on step ${field.step}`);
    continue;
  }

  await input.click();
  await input.fill(field.value);
  await pause(300);

  // Use Enter to advance (except textarea on step 12 — click OK instead)
  if (field.step === 12) {
    const okBtn = await page.$('.slide[data-step="12"].active .btn');
    if (okBtn) await okBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  await pause(900);

  // Verify we advanced
  const currentActive = await page.$('.slide[data-step="' + field.step + '"].active');
  if (currentActive) {
    bugs.push(`BUG: Step ${field.step} did not advance after filling "${field.value}"`);
  } else {
    console.log(`  ✓ Advanced from step ${field.step}`);
  }
}

// ── Review page ──
console.log('\n── Checking review page ──');
await pause(600);
const reviewActive = await page.$('.slide[data-step="13"].active');
if (!reviewActive) {
  bugs.push('BUG: Review page (step 13) did not become active after all data steps');
} else {
  console.log('  ✓ Review page shown');

  // Check grid rendered
  const cells = await page.$$('.review-cell');
  console.log(`  ✓ ${cells.length} review cells rendered`);
  if (cells.length < 12) {
    bugs.push(`BUG: Review grid only shows ${cells.length} cells — expected 12`);
  }

  // Check a value appears
  const firstValue = await page.$('.r-value:not(.empty)');
  if (!firstValue) {
    bugs.push('BUG: Review grid shows no filled values');
  } else {
    const txt = await firstValue.textContent();
    console.log(`  ✓ First value in grid: "${txt?.trim()}"`);
  }
}

await pause(800);

// ── Submit ──
console.log('\n── Clicking Submit ──');
const submitBtn = await page.$('#submitBtn');
if (submitBtn) {
  await submitBtn.click();
  await pause(900);
  const confirmActive = await page.$('.slide[data-step="14"].active');
  if (!confirmActive) {
    bugs.push('BUG: Confirmation slide (step 14) did not appear after Submit');
  } else {
    console.log('  ✓ Confirmation page shown');
    const emailEl = await page.$('#confirmEmail');
    const emailTxt = await emailEl?.textContent();
    console.log(`  ✓ Confirm email shows: "${emailTxt?.trim()}"`);
    if (!emailTxt?.includes('acme.com')) {
      bugs.push(`BUG: Confirmation email shows "${emailTxt}" — expected "jane@acme.com"`);
    }
  }
} else {
  bugs.push('BUG: #submitBtn not found on review page');
}

await pause(800);

// ── Restart ──
console.log('\n── Testing restart ──');
const restartBtn = await page.$('#restartBtn');
if (restartBtn) {
  await restartBtn.click();
  await pause(900);
  const backOnStep1 = await page.$('.slide[data-step="1"].active');
  if (!backOnStep1) {
    bugs.push('BUG: Restart did not return to step 1');
  } else {
    console.log('  ✓ Restart returned to step 1');
  }
} else {
  bugs.push('BUG: #restartBtn not found on confirmation page');
}

await pause(1000);

// ── Report ──
console.log('\n' + '═'.repeat(50));
if (bugs.length === 0) {
  console.log('✅  All checks passed — no bugs found.');
} else {
  console.log(`❌  ${bugs.length} issue(s) found:\n`);
  bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
}
console.log('═'.repeat(50) + '\n');

// Leave browser open for 4 seconds so the user can see the final state
await pause(4000);
await browser.close();
