#!/usr/bin/env tsx
/**
 * Checks Securus inbox for messages from Jared Eng.
 * Detects "Lyreos research" trigger phrase and continuation replies.
 * Usage:
 *   npm run securus:inbox              (headed — Comet must be running)
 *   npm run securus:inbox -- --headless
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { getSecurusPage } from './securus-login.js';
import { reliableClick, waitForPageStable, debugShot } from './securus-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

const headless = process.argv.includes('--headless');

const profile = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'profiles', 'jared-eng.json'), 'utf-8')
) as {
  name: string;
  trigger_phrase: string;
  end_phrase: string;
};

export interface ResearchRequest {
  messageId: string;
  contact: string;
  subject: string;
  query: string;
  timestamp: string;
  rawBody: string;
}

export interface ContinuationReply {
  messageId: string;
  contact: string;
  action: 'send_more' | 'stop';
  timestamp: string;
}

export interface InboxResult {
  researchRequests: ResearchRequest[];
  continuationReplies: ContinuationReply[];
  otherMessages: Array<{ messageId: string; contact: string; subject: string; preview: string }>;
}

function extractQuery(body: string, triggerPhrase: string, endPhrase: string): string | null {
  const triggerIdx = body.toLowerCase().indexOf(triggerPhrase.toLowerCase());
  if (triggerIdx === -1) return null;
  const afterTrigger = body.substring(triggerIdx + triggerPhrase.length).trim();
  const endIdx = afterTrigger.toLowerCase().indexOf(endPhrase.toLowerCase());
  return endIdx !== -1 ? afterTrigger.substring(0, endIdx).trim() : afterTrigger.substring(0, 300).trim();
}

function isContinuation(body: string): 'send_more' | 'stop' | null {
  const lower = body.toLowerCase();
  if (/send more|yes|continue|more|next part/i.test(lower)) return 'send_more';
  if (/stop|no|enough|done|cancel/i.test(lower)) return 'stop';
  return null;
}

export async function checkInbox(opts?: { headless?: boolean }): Promise<InboxResult> {
  const { page, cleanup } = await getSecurusPage({ headless: opts?.headless ?? headless });

  await debugShot(page, 'inbox-start');

  // Navigate to inbox
  console.error('[inbox] Navigating to inbox...');
  await reliableClick(
    page,
    'a:has-text("Inbox"), [href*="inbox" i], [class*="inbox" i]',
    { timeout: 12_000 }
  ).catch(() => {
    console.error('[inbox] Inbox link not found — may already be on inbox page.');
  });
  await waitForPageStable(page);

  await debugShot(page, 'inbox-loaded');

  // Extract message list
  const messages = await page.evaluate((contactName: string) => {
    const rows = document.querySelectorAll('[class*="message-row"], tr[class*="message"], [class*="inbox-item"]');
    return [...rows].map((row, i) => ({
      id: row.getAttribute('data-id') ?? row.getAttribute('id') ?? `msg-${i}`,
      sender: row.querySelector('[class*="sender"], td:nth-child(2), [class*="from"]')?.textContent?.trim() ?? '',
      subject: row.querySelector('[class*="subject"], td:nth-child(3)')?.textContent?.trim() ?? '',
      preview: row.querySelector('[class*="preview"], td:nth-child(4)')?.textContent?.trim() ?? '',
      timestamp: row.querySelector('[class*="date"], td:last-child, time')?.textContent?.trim() ?? new Date().toISOString(),
      isFromContact: row.textContent?.includes(contactName) ?? false,
    }));
  }, profile.name);

  console.error(`[inbox] Found ${messages.length} message(s), ${messages.filter(m => m.isFromContact).length} from ${profile.name}`);

  const result: InboxResult = { researchRequests: [], continuationReplies: [], otherMessages: [] };

  for (const msg of messages) {
    if (!msg.isFromContact) continue;

    // Click message to get full body — use reliable click with fallback selectors
    const clickSel = msg.id.startsWith('msg-')
      ? `[class*="message-row"]:nth-child(${parseInt(msg.id.replace('msg-', '')) + 1})`
      : `[data-id="${msg.id}"], #${msg.id}`;

    await reliableClick(page, clickSel, { timeout: 6_000 }).catch(() => {
      console.error(`[inbox] Could not click message ${msg.id} — skipping body read`);
    });
    await waitForPageStable(page);

    const fullBody = await page.evaluate(() =>
      document.querySelector('[class*="message-body"], [class*="email-body"], .message-content')?.textContent?.trim() ?? ''
    ).catch(() => msg.preview);

    const query = extractQuery(fullBody, profile.trigger_phrase, profile.end_phrase);
    if (query) {
      result.researchRequests.push({
        messageId: msg.id,
        contact: profile.name,
        subject: msg.subject,
        query,
        timestamp: msg.timestamp,
        rawBody: fullBody,
      });

      try {
        await supabase.from('securus_log').upsert({
          message_id: msg.id,
          direction: 'inbound',
          contact: profile.name,
          subject: msg.subject,
          body: fullBody,
          research_query: query,
          received_at: msg.timestamp,
          status: 'pending_research',
        }, { onConflict: 'message_id' });
      } catch { /* non-fatal */ }

      continue;
    }

    const continuation = isContinuation(fullBody);
    if (continuation) {
      result.continuationReplies.push({
        messageId: msg.id,
        contact: profile.name,
        action: continuation,
        timestamp: msg.timestamp,
      });
      continue;
    }

    result.otherMessages.push({ messageId: msg.id, contact: msg.sender, subject: msg.subject, preview: msg.preview });
  }

  await cleanup();
  return result;
}

// CLI entry point
if (process.argv[1]?.includes('securus-check-inbox')) {
  const result = await checkInbox();
  console.log(JSON.stringify(result, null, 2));
  console.error(`\nResearch requests: ${result.researchRequests.length}`);
  console.error(`Continuation replies: ${result.continuationReplies.length}`);
}
