import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];

const sites = [
  { name: 'ChatGPT', url: 'https://chatgpt.com', loginSelector: '[data-testid="profile-button"], button[aria-label="Open user menu"]', guestSelector: 'a[href*="login"], button:has-text("Log in")' },
  { name: 'Claude.ai', url: 'https://claude.ai', loginSelector: '[data-testid="user-menu"], button:has-text("New chat")', guestSelector: 'a[href*="login"], button:has-text("Log in")' },
  { name: 'Google AI Studio', url: 'https://aistudio.google.com', loginSelector: '.gb_A, [aria-label="Google Account"]', guestSelector: 'a:has-text("Sign in")' },
  { name: 'HuggingFace Chat', url: 'https://huggingface.co/chat', loginSelector: 'button:has-text("New Chat"), [href*="/chat/settings"]', guestSelector: 'button:has-text("Sign In"), a:has-text("Login")' },
  { name: 'Groq', url: 'https://console.groq.com', loginSelector: '[data-testid="user-avatar"], .user-avatar', guestSelector: 'button:has-text("Sign in"), a:has-text("Login")' },
  { name: 'Mistral Chat', url: 'https://chat.mistral.ai', loginSelector: 'button:has-text("New conversation"), .user-menu', guestSelector: 'button:has-text("Sign in"), button:has-text("Log in")' },
  { name: 'OpenRouter', url: 'https://openrouter.ai', loginSelector: 'a[href*="/chat"], button:has-text("Chat")', guestSelector: 'button:has-text("Sign in"), a:has-text("Log in")' },
  { name: 'Venice.ai', url: 'https://venice.ai', loginSelector: 'button:has-text("New Chat"), [data-testid="user-menu"]', guestSelector: 'button:has-text("Sign Up"), button:has-text("Log In")' },
];

const results: Record<string, string> = {};

for (const site of sites) {
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `screenshots/login-check-${site.name.toLowerCase().replace(/[^a-z]/g,'-')}.png` });

    const url = page.url();
    const title = await page.title();
    const bodyText = (await page.evaluate(() => document.body.innerText)).substring(0, 300);

    // Check for login indicators
    const isLoginPage = url.includes('login') || url.includes('signin') || url.includes('auth') ||
      bodyText.toLowerCase().includes('sign in') || bodyText.toLowerCase().includes('log in');
    const hasUserContent = bodyText.toLowerCase().includes('new chat') || bodyText.toLowerCase().includes('conversation') ||
      bodyText.toLowerCase().includes('dashboard') || bodyText.toLowerCase().includes('playground');

    results[site.name] = isLoginPage ? '❌ NOT logged in' : hasUserContent ? '✅ Logged in' : `⚠️ Unknown — final URL: ${url.substring(0, 80)}`;
    console.log(`${site.name}: ${results[site.name]}`);
    console.log(`  → ${url.substring(0,80)} | "${bodyText.substring(0,100).replace(/\n/g,' ')}"`);
  } catch (e) {
    results[site.name] = `❌ Error: ${(e as Error).message.substring(0,60)}`;
    console.log(`${site.name}: ${results[site.name]}`);
  } finally {
    await page.close();
  }
}

console.log('\n=== SUMMARY ===');
for (const [name, status] of Object.entries(results)) console.log(`${name}: ${status}`);
