/**
 * Headless Comet launcher — the house replacement for `chromium.launch(...)`.
 *
 * WHY THIS FILE EXISTS. Markus, 2026-09-07: "there should be no more use of
 * chromium this should be replaced with comet." This project (Browser
 * Automation) was one of two things caught red-handed spawning
 * chrome-headless-shell / Chrome for Testing that morning. Roughly 20 scripts
 * here called `chromium.launch({ headless: true })` directly — this is the
 * ONE shared helper so the launch dance does not get copy-pasted into a 21st
 * script and drift back to Chromium. Mirrors
 * ~/.claude/skills/comet-browser/scripts/comet-headless.mjs exactly; see that
 * file's header and ~/.claude/skills/comet-browser/references/headless.md for
 * the full measured evidence (8/8 pass for spawn+connectOverCDP vs 5/8 for
 * launch() with the flag forced through args — a 37% flake rate).
 *
 * THE RECIPE:
 *   --headless=new   the ONLY flag that works. Bare --headless is IGNORED by
 *                     Comet — it boots the full visible Perplexity onboarding
 *                     AND PLAYS AUDIO OUT LOUD.
 *   SPAWN AND POLL /json/version, THEN connectOverCDP — never launch(). See
 *   the module header in comet-headless.mjs for why launch() flakes.
 *   NEVER --disable-gpu — silently kills h264 decoding; canPlayType() still
 *   answers "probably" so nothing catches it.
 */

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import type { Browser, BrowserContext, chromium as ChromiumType } from 'playwright';

export const COMET_BIN = '/Applications/Comet.app/Contents/MacOS/Comet';

/** His visible browser. Never spawn onto this port, never touch this profile. */
export const HIS_PORT = 9222;
export const HIS_CDP_URL = `http://127.0.0.1:${HIS_PORT}`;

interface CdpVersion {
  webSocketDebuggerUrl?: string;
  [k: string]: unknown;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function cdpReady(port: number, timeoutMs: number): Promise<CdpVersion | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const body = (await res.json()) as CdpVersion;
        if (body.webSocketDebuggerUrl) return body;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

export interface HeadlessComet {
  browser: Browser;
  context: BrowserContext;
  port: number;
  close: () => Promise<void>;
}

/**
 * Spawn a headless Comet and attach to it over CDP. Drop-in replacement for
 * `await chromium.launch({ headless: true })` — use `.browser` the same way,
 * and call `.close()` instead of `browser.close()` (it also kills the
 * spawned process group and removes the scratch profile).
 */
export async function launchHeadlessComet({
  chromium,
  port,
  timeoutMs = 30000,
  extraArgs = [],
  viewport,
  deviceScaleFactor,
}: {
  chromium: typeof ChromiumType;
  port?: number;
  timeoutMs?: number;
  extraArgs?: string[];
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
}): Promise<HeadlessComet> {
  if (!existsSync(COMET_BIN)) {
    throw new Error(`Comet not found at ${COMET_BIN}. Install Comet — do NOT fall back to Chrome.`);
  }
  const usePort = port ?? (await freePort());
  if (usePort === HIS_PORT) {
    throw new Error(`refusing port ${HIS_PORT}: that is Markus's visible Comet`);
  }
  const profile = mkdtempSync(path.join(tmpdir(), 'comet-headless-'));

  const child: ChildProcess = spawn(
    COMET_BIN,
    [
      '--headless=new', // the load-bearing flag; bare --headless is ignored
      `--remote-debugging-port=${usePort}`,
      `--user-data-dir=${profile}`,
      '--mute-audio', // bare --headless once played an intro out loud
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      // DO NOT ADD --disable-gpu — see module header.
      ...extraArgs,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'], detached: true },
  );
  child.on('error', () => {
    /* surfaces as the CDP timeout below */
  });

  let closed = false;
  const hardStop = () => {
    if (closed) return;
    closed = true;
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  process.once('exit', hardStop);

  const version = await cdpReady(usePort, timeoutMs);
  if (!version) {
    hardStop();
    process.removeListener('exit', hardStop);
    throw new Error(`Comet did not open CDP on :${usePort} within ${timeoutMs}ms.\nBinary: ${COMET_BIN}`);
  }

  let browser: Browser | undefined;
  let context: BrowserContext;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${usePort}`);
    context =
      viewport || deviceScaleFactor
        ? await browser.newContext({ viewport, deviceScaleFactor })
        : browser.contexts()[0] ?? (await browser.newContext());
  } catch (error) {
    try {
      await browser?.close();
    } catch {
      /* the owned process dies next */
    }
    hardStop();
    process.removeListener('exit', hardStop);
    throw error;
  }

  return {
    browser,
    context,
    port: usePort,
    async close() {
      try {
        await browser.close();
      } catch {
        /* the process dies next anyway */
      }
      hardStop();
      process.removeListener('exit', hardStop);
    },
  };
}

/**
 * Attach to Markus's already-running, VISIBLE Comet on :9222. Never spawns
 * anything. Use for interactive/logged-in flows — never call `.close()` on
 * the returned browser (that kills his real window); just stop using it.
 */
export async function connectVisibleComet(chromium: typeof ChromiumType): Promise<Browser> {
  return chromium.connectOverCDP(HIS_CDP_URL);
}

/**
 * Markus's real cookies for one domain, ready for `context.addCookies()`.
 * These are LIVE CREDENTIALS: keep in memory, never write to a file in a
 * repo, never print the values, never put them in chat or a handoff.
 */
export function cookiesForDomain(domain: string) {
  const raw = execFileSync(
    '/Users/markususche/go/bin/cookie-extractor',
    ['export', '--browser', 'comet', '--domain', domain, '--format', 'json', '--full'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.cookies ?? parsed.Cookies ?? [];
  return list
    .map((c: any) => ({
      name: c.name,
      value: c.value,
      // cookie-extractor emits `host`, not `domain`.
      domain: c.host ?? `.${domain}`,
      path: c.path ?? '/',
      httpOnly: true,
      secure: true,
    }))
    .filter((c: any) => c.name && c.value);
}
