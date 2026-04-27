#!/usr/bin/env tsx
/**
 * 24/7 Securus inbox monitor — polls for Jared Eng research requests
 * and automatically runs the research pipeline.
 *
 * Usage:
 *   npm run securus:monitor         (foreground, Ctrl+C to stop)
 *   npm run securus:monitor:install (install as launchd daemon)
 */

import { checkInbox } from './securus-check-inbox.js';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const POLL_MINUTES = Number(process.env.MONITOR_POLL_MINUTES ?? 5);
const POLL_MS = POLL_MINUTES * 60_000;
const CDP_URL = 'http://localhost:9222';

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

console.error(`Securus monitor started. Polling every ${POLL_MINUTES} minute(s). Press Ctrl+C to stop.`);

async function ensureCometRunning(): Promise<boolean> {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    // Just a connectivity check
    const count = browser.contexts()[0]?.pages().length ?? 0;
    console.error(`Comet connected (${count} tabs open)`);
    return true;
  } catch {
    console.error('Comet not reachable. Attempting to launch...');
    try {
      execSync('npm run comet:debug', { cwd: PROJECT_ROOT, stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 3000));
      return true;
    } catch {
      console.error('Could not launch Comet. Skipping this poll cycle.');
      return false;
    }
  }
}

async function runResearchScript(): Promise<void> {
  // We call securus-research-reply as a subprocess to keep state clean each run
  execSync(`npx tsx "${join(PROJECT_ROOT, 'scripts', 'securus-research-reply.ts')}"`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

async function pollOnce(): Promise<void> {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Polling Securus inbox...`);

  try {
    const inbox = await checkInbox();
    const total = inbox.researchRequests.length + inbox.continuationReplies.length;

    if (total > 0) {
      console.error(`Found ${inbox.researchRequests.length} research request(s), ${inbox.continuationReplies.length} continuation(s). Running pipeline...`);
      await runResearchScript();
    } else {
      console.error('No new messages requiring action.');
    }

    // Log poll event to Supabase
    try {
      await supabase.from('monitor_log').insert({
        polled_at: timestamp,
        research_requests: inbox.researchRequests.length,
        continuations: inbox.continuationReplies.length,
        other_messages: inbox.otherMessages.length,
      });
    } catch { /* non-fatal */ }

  } catch (err) {
    console.error(`Poll error: ${(err as Error).message}`);
  }
}

// Main loop
while (true) {
  await pollOnce();
  console.error(`Next poll in ${POLL_MINUTES} minute(s) (${new Date(Date.now() + POLL_MS).toLocaleTimeString()})...`);
  await new Promise(r => setTimeout(r, POLL_MS));
}
