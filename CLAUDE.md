# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                                    # Install dependencies (no browser download — uses existing cache)
npm test                                       # Run full test suite (headless)
npm run test:headed                            # Run tests with visible browser
npm run test:ui                                # Open Playwright interactive UI
npm run test -- --grep "login"                 # Run tests matching a pattern
npm run test -- tests/example.spec.ts          # Run a single test file
npm run test:report                            # Open last HTML report

npm run screenshot -- https://example.com     # Take a PNG screenshot → screenshots/
npm run screenshot -- https://example.com --full            # Full-page
npm run screenshot -- https://example.com --device="iPhone 13"  # Mobile emulation
npm run scrape                                 # Scrape HN top 10 → JSON stdout
npm run automate                               # Login form automation demo

npx playwright codegen https://example.com    # Record interactions as code
npx playwright show-trace test-results/path/to/trace.zip  # Inspect a trace
npx playwright install chromium               # Install browsers if not cached
npm run verify:browsers                        # List installed browsers
```

## Architecture

Two distinct patterns coexist:

**Scripts** (`scripts/*.ts`) — standalone automation tools run via `tsx`. They use `import { chromium } from 'playwright'` (not `@playwright/test`) with top-level `await`. No test runner involved. Output goes to stdout or `screenshots/`.

**Tests** (`tests/*.spec.ts`) — Playwright Test framework. Use `import { test, expect } from '@playwright/test'`. Auto-discovered by `playwright.config.ts`. Runs Chromium only by default; Firefox/WebKit configs are commented out and require separate `npx playwright install`.

**Key config** (`playwright.config.ts`): `baseURL` is unset unless `BASE_URL` env var is provided. Retries are enabled (1 local, 2 CI). Screenshots captured only on failure; traces on first retry.

**Browser cache**: Playwright auto-discovers browsers at `~/Library/Caches/ms-playwright/`. Do not set `PLAYWRIGHT_BROWSERS_PATH` — it breaks auto-discovery on macOS.

**TypeScript**: ESM module (`"type": "module"`), `NodeNext` resolution. Scripts run directly via `tsx` without compilation.

## Adding Scripts

Create `scripts/your-script.ts`, import from `'playwright'`, use top-level `await`. Add to `package.json` scripts: `"your-script": "tsx scripts/your-script.ts"`.

## Environment Variables

Copy `.env.example` → `.env`:
- `BASE_URL` — override base URL for tests
- `HEADLESS` — set to `false` for headed mode in scripts
