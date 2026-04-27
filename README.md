# Browser Automation

Playwright-based browser automation toolkit covering screenshots, web app testing, and general automation.

## Prerequisites

- Node.js >= 20
- Chromium browser (cached at `~/Library/Caches/ms-playwright/` — already available if you've used Playwright before)

If you need to install browsers for the first time:
```bash
npx playwright install chromium
```

## Setup

```bash
npm install
```

No browser download occurs — Playwright auto-discovers the existing browser cache on macOS.

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run screenshot` | Take a screenshot of a URL → saves PNG to `screenshots/` |
| `npm run scrape` | Scrape Hacker News top 10 stories → JSON output |
| `npm run automate` | Run a login form automation demo |
| `npm test` | Run the full Playwright test suite |
| `npm run test:headed` | Run tests with visible browser window |
| `npm run test:ui` | Open the Playwright interactive UI |
| `npm run test:report` | Open the last HTML test report |
| `npm run verify:browsers` | Confirm which browsers are installed |
| `npm run codegen` | Record browser interactions as code |

## Usage Examples

### Screenshots

```bash
# Screenshot any URL (default: example.com)
npm run screenshot

# Screenshot a specific URL
npm run screenshot -- https://github.com

# Full-page screenshot
npm run screenshot -- https://github.com --full

# Mobile device emulation
npm run screenshot -- https://github.com --device="iPhone 13"
```

### Scraping

```bash
npm run scrape
# Outputs JSON array of top 10 HN stories with title, url, score, site
```

### Form Automation

```bash
npm run automate
# Navigates to a public test site, fills a login form, verifies success/failure messages
```

### Running Tests

```bash
npm test                          # Headless, all tests
npm run test:headed               # Shows browser window
npm run test:ui                   # Interactive Playwright UI
npm run test -- --grep "login"    # Run tests matching a pattern
npm run test -- tests/example.spec.ts  # Single file
```

## Adding Scripts

1. Create `scripts/your-script.ts`
2. Import `{ chromium } from 'playwright'` for browser automation
3. Add to `package.json` scripts: `"your-script": "tsx scripts/your-script.ts"`

## Adding Tests

Create `tests/your-feature.spec.ts` — Playwright auto-discovers all `*.spec.ts` files in `tests/`.

```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});
```

## Useful One-off Commands

```bash
# Record a new automation script by interacting with a browser
npx playwright codegen https://example.com

# Inspect a trace file from a failed test
npx playwright show-trace test-results/path/to/trace.zip

# Install additional browsers
npx playwright install firefox webkit
```

## Environment Variables

Copy `.env.example` to `.env` to configure:

- `BASE_URL` — override the base URL for tests (useful for local dev servers)
- `HEADLESS` — set to `false` to run scripts in headed mode
