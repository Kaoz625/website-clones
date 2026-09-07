import { chromium } from 'playwright';
import { launchHeadlessComet } from '../lib/comet-headless.ts';
import { parseTarget, saveFindings, timestamp } from './utils.ts';

// Malicious origins to test
const EVIL_ORIGINS = [
  'https://evil.com',
  'https://attacker.com',
  'null',
  'https://notcisco.com',
  'https://cisco.com.evil.com',
];

interface CorsResult {
  url: string;
  tested_origin: string;
  acao_header: string | null;
  acac_header: string | null;  // Access-Control-Allow-Credentials
  vulnerable: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  bounty_eligible: boolean;
  notes: string;
}

const target = parseTarget();
const base = new URL(target);

// API endpoints to test CORS on
const API_PATHS = [
  '/api',
  '/api/v1',
  '/api/v2',
  '/graphql',
  '/_next/data',
  '/api/user',
  '/api/me',
  '/api/profile',
  '/api/account',
  '/api/auth',
  '/api/token',
];

const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

console.log(`\n[*] CORS Misconfiguration Scanner: ${target}\n`);

const results: CorsResult[] = [];

// First, discover actual API endpoints that respond
console.log('[*] Discovering API endpoints...');
const liveEndpoints: string[] = [target];
for (const path of API_PATHS) {
  const url = `${base.origin}${path}`;
  const resp = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, { method: 'GET' });
      return { status: r.status, url: u };
    } catch { return null; }
  }, url);
  if (resp && resp.status !== 404) {
    liveEndpoints.push(url);
    console.log(`  Found: ${path} (${resp.status})`);
  }
}

console.log(`\n[*] Testing CORS on ${liveEndpoints.length} endpoints with ${EVIL_ORIGINS.length} origins...\n`);

// Test CORS by intercepting response headers
for (const endpoint of liveEndpoints) {
  for (const origin of EVIL_ORIGINS) {
    const corsResult = await page.evaluate(async ({ url, origin }) => {
      try {
        const r = await fetch(url, {
          method: 'GET',
          headers: { 'Origin': origin },
          mode: 'cors',
          credentials: 'include',
        });
        const acao = r.headers.get('access-control-allow-origin');
        const acac = r.headers.get('access-control-allow-credentials');
        return { status: r.status, acao, acac };
      } catch (e) {
        return { status: 0, acao: null, acac: null, error: String(e) };
      }
    }, { url: endpoint, origin });

    if (!corsResult.acao) continue;

    const acao = corsResult.acao;
    const acac = corsResult.acac;
    const reflectsOrigin = acao === origin;
    const wildcard = acao === '*';
    const allowsCredentials = acac === 'true';

    // Only flag real issues
    const vulnerable = (reflectsOrigin && allowsCredentials) ||
                       (origin === 'null' && (acao === 'null' || wildcard) && allowsCredentials);

    if (vulnerable || reflectsOrigin || wildcard) {
      const severity = (reflectsOrigin && allowsCredentials) ? 'high' :
                       (wildcard && allowsCredentials) ? 'high' :
                       wildcard ? 'low' : 'medium';
      const bounty = severity === 'high' || (reflectsOrigin && allowsCredentials);

      const result: CorsResult = {
        url: endpoint,
        tested_origin: origin,
        acao_header: acao,
        acac_header: acac,
        vulnerable,
        severity,
        bounty_eligible: bounty,
        notes: vulnerable
          ? `CRITICAL: Reflects evil origin AND allows credentials — attacker can make authenticated cross-origin requests`
          : reflectsOrigin
          ? `Reflects arbitrary origin (ACAO: ${acao}) — ${allowsCredentials ? 'WITH credentials!' : 'no credentials flag'}`
          : `Wildcard CORS (ACAO: *) — ${allowsCredentials ? 'WITH credentials (invalid but worth noting)' : 'safe unless credentials needed'}`,
      };

      results.push(result);
      const icon = bounty ? '[BOUNTY]' : '[INFO]  ';
      console.log(`  ${icon} ${endpoint}`);
      console.log(`           Origin: ${origin}`);
      console.log(`           ACAO: ${acao} | ACAC: ${acac ?? 'not set'}`);
      console.log(`           → ${result.notes}`);
    }
  }
}

const outFile = saveFindings(target, 'cors', {
  target,
  scanned_at: timestamp(),
  endpoints_tested: liveEndpoints.length,
  results,
  summary: {
    total: results.length,
    vulnerable: results.filter(r => r.vulnerable).length,
    bounty_eligible: results.filter(r => r.bounty_eligible).length,
  },
});

console.log(`\n--- Summary ---`);
console.log(`  Endpoints tested  : ${liveEndpoints.length}`);
console.log(`  CORS issues found : ${results.length}`);
console.log(`  Confirmed vulns   : ${results.filter(r => r.vulnerable).length}`);
console.log(`  Bounty-eligible   : ${results.filter(r => r.bounty_eligible).length}`);
console.log(`  Saved to          : ${outFile}\n`);

await close();
