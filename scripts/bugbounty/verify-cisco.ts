import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { launchHeadlessComet } from '../lib/comet-headless.ts';
import { saveScreenshot } from './utils.ts';

// Live credentials live in ~/.credentials/api-keys.env, not in the repo .env.
loadEnv({ path: join(homedir(), '.credentials/api-keys.env') });

const CISCO_DSC_NETID_APIKEY = process.env.CISCO_DSC_NETID_APIKEY;
const CISCO_DSC_CDC_CLOUD_APIKEY = process.env.CISCO_DSC_CDC_CLOUD_APIKEY;
if (!CISCO_DSC_NETID_APIKEY || !CISCO_DSC_CDC_CLOUD_APIKEY) {
  throw new Error(
    'Missing Cisco DSC API keys. Set CISCO_DSC_NETID_APIKEY and CISCO_DSC_CDC_CLOUD_APIKEY in ~/.credentials/api-keys.env',
  );
}

const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

// Test 1: API key from browser context (bypasses CORS/firewall that blocked curl)
const apiPage = await context.newPage();
const apiResult = await apiPage.evaluate(async (apikey) => {
  try {
    const r = await fetch('https://dsc.cisco.com/v1/netid', {
      headers: { 'apikey': apikey }
    });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e: unknown) {
    return { status: 0, body: String(e) };
  }
}, CISCO_DSC_NETID_APIKEY);
console.log('\n[*] dsc API key test (dsc service):');
console.log('    Status:', apiResult.status);
console.log('    Body:', apiResult.body);

const apiResult2 = await apiPage.evaluate(async (apikey) => {
  try {
    const r = await fetch('https://dsc.cisco.com/v1/netid/cdc_cloud', {
      headers: { 'apikey': apikey }
    });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e: unknown) {
    return { status: 0, body: String(e) };
  }
}, CISCO_DSC_CDC_CLOUD_APIKEY);
console.log('\n[*] dsc API key test (customer service):');
console.log('    Status:', apiResult2.status);
console.log('    Body:', apiResult2.body);
await apiPage.close();

// Test 2: developer.cisco.com/admin content
const adminPage = await context.newPage();
await adminPage.goto('https://developer.cisco.com/admin', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
const adminTitle = await adminPage.title();
const adminText = await adminPage.evaluate(() => document.body?.innerText?.slice(0, 500) ?? '');
const adminUrl = adminPage.url();
console.log('\n[*] developer.cisco.com/admin:');
console.log('    Final URL:', adminUrl);
console.log('    Title:', adminTitle);
console.log('    Content:', adminText.replace(/\n/g, ' ').slice(0, 300));
const shot = await saveScreenshot(adminPage, 'https://developer.cisco.com', 'admin-page');
console.log('    Screenshot:', shot);
await adminPage.close();

await close();
