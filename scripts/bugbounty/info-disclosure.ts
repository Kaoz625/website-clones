import { chromium } from 'playwright';
import { launchHeadlessComet } from '../lib/comet-headless.ts';
import { parseTarget, saveFindings, timestamp } from './utils.ts';

const SENSITIVE_PATHS = [
  // Source maps
  '/js/app.js.map', '/static/js/main.js.map', '/assets/app.js.map',
  '/bundle.js.map', '/dist/bundle.js.map', '/app.js.map',
  // Debug / admin
  '/.env', '/.env.local', '/.env.production', '/.git/config',
  '/debug', '/admin', '/console', '/status', '/health', '/ping',
  '/api/debug', '/api/status', '/api/health', '/api/v1', '/api/v2',
  '/api/internal', '/api/private',
  // Common leaks
  '/server-status', '/phpinfo.php', '/info.php', '/test.php',
  '/config.json', '/config.js', '/settings.json', '/robots.txt',
  '/sitemap.xml', '/.well-known/security.txt',
  '/swagger.json', '/swagger-ui.html', '/api-docs', '/openapi.json',
  '/graphql', '/graphiql', '/__graphql',
  // Backup files
  '/backup.sql', '/dump.sql', '/db.sql', '/database.sql',
  '/backup.zip', '/backup.tar.gz',
  // Stack traces / error pages
  '/404', '/500', '/error',
  // Package info
  '/package.json', '/composer.json', '/requirements.txt', '/Gemfile',
];

interface DisclosureFinding {
  path: string;
  status: number;
  finding_type: 'source_map' | 'debug_endpoint' | 'sensitive_file' | 'api_endpoint' | 'error_page' | 'info';
  content_snippet?: string;
  content_length?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  bounty_eligible: boolean;
  notes: string;
}

function classifyPath(path: string, status: number, body: string): Omit<DisclosureFinding, 'path' | 'status' | 'content_length'> {
  if (path.endsWith('.map')) {
    return {
      finding_type: 'source_map',
      severity: 'medium',
      bounty_eligible: true,
      notes: 'Source map exposes original source code — aids attackers in finding vulnerabilities',
      content_snippet: body.slice(0, 200),
    };
  }
  if (path.includes('graphql') || path.includes('graphiql')) {
    const introspection = body.includes('__schema') || body.includes('IntrospectionQuery');
    return {
      finding_type: 'api_endpoint',
      severity: introspection ? 'medium' : 'low',
      bounty_eligible: introspection,
      notes: introspection ? 'GraphQL introspection enabled — exposes full API schema' : 'GraphQL endpoint found',
      content_snippet: body.slice(0, 200),
    };
  }
  if (path === '/swagger.json' || path === '/openapi.json' || path === '/api-docs') {
    return {
      finding_type: 'api_endpoint',
      severity: 'low',
      bounty_eligible: true,
      notes: 'API schema exposed — enumerates all endpoints and parameters',
      content_snippet: body.slice(0, 200),
    };
  }
  if (path === '/.env' || path.startsWith('/.env.') || path === '/.git/config') {
    return {
      finding_type: 'sensitive_file',
      severity: 'critical',
      bounty_eligible: true,
      notes: `Sensitive file directly accessible: ${path}`,
      content_snippet: body.slice(0, 200),
    };
  }
  if (path === '/package.json' || path === '/composer.json' || path === '/requirements.txt') {
    return {
      finding_type: 'sensitive_file',
      severity: 'low',
      bounty_eligible: false,
      notes: 'Dependency file exposed — reveals tech stack and versions',
      content_snippet: body.slice(0, 200),
    };
  }
  if (['/debug', '/admin', '/console', '/phpinfo.php', '/info.php'].includes(path)) {
    return {
      finding_type: 'debug_endpoint',
      severity: 'high',
      bounty_eligible: true,
      notes: `Debug/admin endpoint accessible: ${path}`,
      content_snippet: body.slice(0, 200),
    };
  }
  if (path.startsWith('/api/')) {
    return {
      finding_type: 'api_endpoint',
      severity: 'low',
      bounty_eligible: false,
      notes: `API endpoint found: ${path}`,
      content_snippet: body.slice(0, 150),
    };
  }
  return {
    finding_type: 'info',
    severity: 'low',
    bounty_eligible: false,
    notes: `Accessible path: ${path} (${status})`,
    content_snippet: body.slice(0, 100),
  };
}

const target = parseTarget();
const base = new URL(target);

const { browser, close } = await launchHeadlessComet({ chromium });
const context = await browser.newContext({ ignoreHTTPSErrors: true });

console.log(`\n[*] Info Disclosure Scanner: ${target}\n`);

const findings: DisclosureFinding[] = [];

// Also discover JS file paths from the homepage to check for .map files
const homePage = await context.newPage();
await homePage.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
const jsUrls = await homePage.evaluate(() => {
  return Array.from(document.querySelectorAll('script[src]'))
    .map(s => (s as HTMLScriptElement).src)
    .filter(s => s.startsWith(location.origin));
});
await homePage.close();

// Add .map variants of discovered JS files
const mapPaths = jsUrls.map(u => new URL(u).pathname + '.map');
const allPaths = [...new Set([...SENSITIVE_PATHS, ...mapPaths])];

console.log(`[*] Probing ${allPaths.length} paths (${mapPaths.length} discovered JS maps + ${SENSITIVE_PATHS.length} standard)...\n`);

// Probe in batches of 8 concurrently
for (let i = 0; i < allPaths.length; i += 8) {
  const batch = allPaths.slice(i, i + 8);
  await Promise.all(batch.map(async (path) => {
    const url = `${base.origin}${path}`;
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      const status = response?.status() ?? 0;

      // Skip obvious non-findings
      if (status === 0 || status === 404 || status === 410) {
        await page.close();
        return;
      }
      // 403/406/401 on sensitive files = server is correctly protecting them, NOT a vuln
      if ([401, 403, 406].includes(status)) {
        await page.close();
        return;
      }
      // Skip redirects to login pages (common 302s)
      if ([301, 302, 303, 307, 308].includes(status)) {
        const loc = response?.headers()['location'] ?? '';
        if (loc.includes('login') || loc.includes('signin') || loc.includes('auth')) {
          await page.close();
          return;
        }
      }

      const body = await page.content();

      // For sensitive files, only flag if body looks like actual content (not HTML error page)
      const isSensitivePath = path === '/.env' || path.startsWith('/.env.') || path === '/.git/config';
      if (isSensitivePath && (body.includes('<html') || body.includes('<!DOCTYPE') || body.length < 20)) {
        await page.close();
        return;
      }

      // For source maps, verify actual source map JSON structure
      if (path.endsWith('.map') && !body.includes('"sources"') && !body.includes('"version"')) {
        await page.close();
        return;
      }

      const classification = classifyPath(path, status, body);

      findings.push({
        path,
        status,
        content_length: body.length,
        ...classification,
      });

      const icon = classification.bounty_eligible ? '[BOUNTY]' : classification.severity === 'high' || classification.severity === 'critical' ? '[HIGH]  ' : '[INFO]  ';
      console.log(`  ${icon} ${status} ${path}`);
      if (classification.content_snippet) {
        console.log(`           ${classification.content_snippet.replace(/\n/g, ' ').slice(0, 100)}`);
      }
    } catch { /* unreachable or timeout */ } finally {
      await page.close();
    }
  }));
}

const eligible = findings.filter(f => f.bounty_eligible);
const high = findings.filter(f => f.severity === 'high' || f.severity === 'critical');

const outFile = saveFindings(target, 'info-disclosure', {
  target,
  scanned_at: timestamp(),
  paths_probed: allPaths.length,
  findings,
  summary: {
    total: findings.length,
    bounty_eligible: eligible.length,
    high_severity: high.length,
  },
});

console.log(`\n--- Summary ---`);
console.log(`  Paths probed      : ${allPaths.length}`);
console.log(`  Total findings    : ${findings.length}`);
console.log(`  High/Critical     : ${high.length}`);
console.log(`  Bounty-eligible   : ${eligible.length}`);
console.log(`  Saved to          : ${outFile}\n`);

if (eligible.length > 0) {
  console.log('[!] BOUNTY-ELIGIBLE FINDINGS:');
  eligible.forEach(f => {
    console.log(`    [${f.severity.toUpperCase()}] ${f.path} — ${f.notes}`);
  });
}

await close();
