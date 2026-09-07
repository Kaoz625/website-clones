import { chromium } from 'playwright';
import { launchHeadlessComet } from '../lib/comet-headless.ts';
import { parseTarget, saveFindings, timestamp } from './utils.ts';

// Patterns for secrets/credentials in JS source
const SECRET_PATTERNS: { name: string; regex: RegExp; severity: 'low' | 'medium' | 'high' | 'critical'; bounty: boolean }[] = [
  { name: 'AWS Access Key',        regex: /AKIA[0-9A-Z]{16}/g,                                       severity: 'critical', bounty: true },
  { name: 'AWS Secret Key',        regex: /(?:aws.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]/gi,          severity: 'critical', bounty: true },
  { name: 'Generic API Key',       regex: /api[_-]?key['\"\s]*[:=]['\"\s]*([a-zA-Z0-9_\-]{20,})/gi, severity: 'high',     bounty: true },
  { name: 'Bearer Token',          regex: /bearer\s+[a-zA-Z0-9\-._~+/]{20,}/gi,                     severity: 'high',     bounty: true },
  { name: 'Private Key Header',    regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,               severity: 'critical', bounty: true },
  { name: 'Google API Key',        regex: /AIza[0-9A-Za-z\-_]{35}/g,                                severity: 'high',     bounty: true },
  { name: 'Stripe Secret Key',     regex: /sk_(?:live|test)_[0-9a-zA-Z]{24,}/g,                     severity: 'critical', bounty: true },
  { name: 'Stripe Publishable Key',regex: /pk_(?:live|test)_[0-9a-zA-Z]{24,}/g,                     severity: 'low',      bounty: false },
  { name: 'GitHub Token',          regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g,                           severity: 'critical', bounty: true },
  { name: 'Slack Token',           regex: /xox[baprs]-[0-9a-zA-Z\-]{10,}/g,                         severity: 'high',     bounty: true },
  { name: 'JWT Token',             regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+/g, severity: 'medium', bounty: true },
  { name: 'Hardcoded Password',    regex: /(?:password|passwd|pwd)['\"\s]*[:=]['\"\s]*([^'"\s]{8,})/gi, severity: 'high', bounty: true },
  { name: 'Hardcoded Secret',      regex: /(?:secret|client_secret)['\"\s]*[:=]['\"\s]*([a-zA-Z0-9_\-]{10,})/gi, severity: 'high', bounty: true },
  { name: 'Firebase Config',       regex: /firebase[^{}]*apiKey[^{}]*authDomain/gi,                  severity: 'medium',   bounty: false },
  { name: 'Twilio Credentials',    regex: /AC[a-z0-9]{32}/g,                                         severity: 'high',     bounty: true },
  { name: 'SendGrid API Key',      regex: /SG\.[a-zA-Z0-9\-_]{22}\.[a-zA-Z0-9\-_]{43}/g,           severity: 'high',     bounty: true },
  { name: 'Internal URL/IP',       regex: /https?:\/\/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|localhost|127\.0\.0\.1)[^\s'\"]+/gi, severity: 'medium', bounty: true },
];

// Patterns to exclude (known false positives)
const EXCLUSION_PATTERNS = [
  /example\.com/i,
  /placeholder/i,
  /your[-_]api[-_]key/i,
  /INSERT[-_]KEY/i,
  /xxxx/i,
  /1234567890/,
];

interface SecretFinding {
  js_url: string;
  pattern_name: string;
  match: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  bounty: boolean;
  context: string;
}

function extractContext(source: string, matchIndex: number, matchLen: number): string {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(source.length, matchIndex + matchLen + 60);
  return source.slice(start, end).replace(/\n/g, ' ').trim();
}

function isExcluded(match: string): boolean {
  return EXCLUSION_PATTERNS.some(p => p.test(match));
}

const target = parseTarget();
const base = new URL(target);

const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

console.log(`\n[*] JS Secrets Scanner: ${target}\n`);

// Discover all JS file URLs
const page = await context.newPage();
const jsUrls = new Set<string>();

// Intercept JS responses directly
context.on('response', async (response) => {
  const url = response.url();
  const ct = response.headers()['content-type'] ?? '';
  if ((url.endsWith('.js') || ct.includes('javascript')) && url.startsWith(base.origin)) {
    jsUrls.add(url);
  }
});

await page.goto(target, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

// Also pick up inline script src attributes
const scriptSrcs = await page.evaluate((origin) =>
  Array.from(document.querySelectorAll('script[src]'))
    .map(s => (s as HTMLScriptElement).src)
    .filter(s => s.startsWith(origin)),
  base.origin
);
scriptSrcs.forEach(s => jsUrls.add(s));
await page.close();

console.log(`[*] Found ${jsUrls.size} JS files to scan...\n`);

const findings: SecretFinding[] = [];

for (const jsUrl of jsUrls) {
  try {
    const resp = await fetch(jsUrl);
    if (!resp.ok) continue;
    const source = await resp.text();

    for (const pattern of SECRET_PATTERNS) {
      const matches = [...source.matchAll(pattern.regex)];
      for (const match of matches) {
        const matchStr = match[0];
        if (isExcluded(matchStr)) continue;
        const ctx = extractContext(source, match.index ?? 0, matchStr.length);
        findings.push({
          js_url: jsUrl,
          pattern_name: pattern.name,
          match: matchStr.slice(0, 80),
          severity: pattern.severity,
          bounty: pattern.bounty,
          context: ctx,
        });
        const icon = pattern.bounty ? '[BOUNTY]' : '[INFO]  ';
        console.log(`  ${icon} ${pattern.name} in ${jsUrl.replace(base.origin, '')}`);
        console.log(`          Match: ${matchStr.slice(0, 60)}...`);
        console.log(`          Ctx:   ${ctx.slice(0, 100)}`);
      }
    }
  } catch { /* skip unreachable */ }
}

const eligible = findings.filter(f => f.bounty);
const outFile = saveFindings(target, 'js-secrets', {
  target,
  scanned_at: timestamp(),
  js_files_scanned: jsUrls.size,
  findings,
  summary: { total: findings.length, bounty_eligible: eligible.length },
});

console.log(`\n--- Summary ---`);
console.log(`  JS files scanned  : ${jsUrls.size}`);
console.log(`  Total matches     : ${findings.length}`);
console.log(`  Bounty-eligible   : ${eligible.length}`);
console.log(`  Saved to          : ${outFile}\n`);

if (eligible.length > 0) {
  console.log('[!] BOUNTY-ELIGIBLE FINDINGS:');
  eligible.forEach(f => {
    console.log(`    [${f.severity.toUpperCase()}] ${f.pattern_name}: ${f.match.slice(0, 60)}`);
    console.log(`    in: ${f.js_url}`);
  });
}

await close();
