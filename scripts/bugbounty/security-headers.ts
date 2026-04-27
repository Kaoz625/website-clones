import { chromium } from 'playwright';
import { parseTarget, saveFindings, timestamp } from './utils.ts';

const REQUIRED_HEADERS: Record<string, string> = {
  'content-security-policy': 'Prevents XSS and data injection attacks',
  'strict-transport-security': 'Enforces HTTPS connections',
  'x-frame-options': 'Prevents clickjacking (or use CSP frame-ancestors)',
  'x-content-type-options': 'Prevents MIME-type sniffing',
  'referrer-policy': 'Controls referrer information leakage',
  'permissions-policy': 'Restricts access to browser features',
};

const WEAK_CSP_PATTERNS = [
  /unsafe-inline/,
  /unsafe-eval/,
  /\*/,
  /data:/,
];

interface HeaderFinding {
  header: string;
  status: 'missing' | 'present' | 'weak';
  value?: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  bounty_eligible: boolean;
}

interface ScanResult {
  target: string;
  scanned_at: string;
  final_url: string;
  status_code: number;
  findings: HeaderFinding[];
  summary: { total: number; missing: number; weak: number; bounty_eligible: number };
}

const target = parseTarget();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log(`\n[*] Security Headers Audit: ${target}\n`);

let response;
try {
  response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  console.error(`[!] Failed to load ${target}: ${e}`);
  await browser.close();
  process.exit(1);
}

const headers = response?.headers() ?? {};
const finalUrl = page.url();
const statusCode = response?.status() ?? 0;

const findings: HeaderFinding[] = [];

for (const [header, description] of Object.entries(REQUIRED_HEADERS)) {
  const value = headers[header];

  if (!value) {
    const severity = header === 'strict-transport-security' || header === 'content-security-policy'
      ? 'medium' : 'low';
    findings.push({
      header,
      status: 'missing',
      description,
      severity,
      bounty_eligible: severity === 'medium',
    });
    console.log(`  [MISSING] ${header}`);
    console.log(`            → ${description}`);
  } else {
    let weak = false;
    if (header === 'content-security-policy') {
      for (const pattern of WEAK_CSP_PATTERNS) {
        if (pattern.test(value)) {
          weak = true;
          break;
        }
      }
    }
    if (header === 'x-frame-options' && !['DENY', 'SAMEORIGIN'].includes(value.toUpperCase())) {
      weak = true;
    }

    findings.push({
      header,
      status: weak ? 'weak' : 'present',
      value,
      description,
      severity: weak ? 'low' : 'low',
      bounty_eligible: false,
    });

    if (weak) {
      console.log(`  [WEAK]    ${header}: ${value}`);
    } else {
      console.log(`  [OK]      ${header}: ${value.slice(0, 80)}${value.length > 80 ? '...' : ''}`);
    }
  }
}

// Check for server version disclosure
const server = headers['server'];
const xPowered = headers['x-powered-by'];
if (server && /[0-9]/.test(server)) {
  findings.push({
    header: 'server',
    status: 'weak',
    value: server,
    description: 'Server header discloses version — aids fingerprinting',
    severity: 'low',
    bounty_eligible: false,
  });
  console.log(`  [INFO]    Server version disclosed: ${server}`);
}
if (xPowered) {
  findings.push({
    header: 'x-powered-by',
    status: 'weak',
    value: xPowered,
    description: 'X-Powered-By discloses technology stack',
    severity: 'low',
    bounty_eligible: false,
  });
  console.log(`  [INFO]    Technology disclosed: ${xPowered}`);
}

const missing = findings.filter(f => f.status === 'missing').length;
const weak = findings.filter(f => f.status === 'weak').length;
const eligible = findings.filter(f => f.bounty_eligible).length;

const result: ScanResult = {
  target,
  scanned_at: timestamp(),
  final_url: finalUrl,
  status_code: statusCode,
  findings,
  summary: { total: findings.length, missing, weak, bounty_eligible: eligible },
};

const outFile = saveFindings(target, 'headers', result);

console.log(`\n--- Summary ---`);
console.log(`  Missing headers : ${missing}`);
console.log(`  Weak headers    : ${weak}`);
console.log(`  Bounty-eligible : ${eligible}`);
console.log(`  Saved to        : ${outFile}\n`);

if (eligible > 0) {
  console.log('[!] Potential findings worth reporting:');
  findings.filter(f => f.bounty_eligible).forEach(f => {
    console.log(`    - Missing ${f.header} (${f.severity}): ${f.description}`);
  });
}

await browser.close();
