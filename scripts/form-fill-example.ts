import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('https://the-internet.herokuapp.com/login');

// Successful login
await page.fill('#username', 'tomsmith');
await page.fill('#password', 'SuperSecretPassword!');
await page.click('button[type="submit"]');
await page.waitForSelector('.flash.success', { timeout: 10000 });

const successMsg = await page.locator('.flash.success').textContent();
console.log('✓ Login succeeded:', successMsg?.trim());

// Navigate back and try invalid credentials
await page.goto('https://the-internet.herokuapp.com/login');
await page.fill('#username', 'wronguser');
await page.fill('#password', 'wrongpass');
await page.click('button[type="submit"]');
await page.waitForSelector('.flash.error', { timeout: 10000 });

const errorMsg = await page.locator('.flash.error').textContent();
console.log('✓ Invalid login correctly rejected:', errorMsg?.trim());

await browser.close();
