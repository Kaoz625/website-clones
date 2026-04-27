#!/usr/bin/env tsx
/**
 * Full research → reply pipeline for Jared Eng.
 * Detects "Lyreos research" requests, runs research, sends reply with stamp gate.
 * Usage: npm run securus:research
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

import { checkInbox, type ResearchRequest } from './securus-check-inbox.js';
import { getSecurusPage } from './securus-login.js';
import { reliableClick, reliableFill, waitForPageStable } from './securus-helpers.js';
import { webSearch } from './research/web-search.js';
import { redditSearch, redditResultsToSources } from './research/reddit-search.js';
import { buildReply, buildStampGateMessage } from './research/summarize.js';
import { saveToMemory } from './research/save-to-memory.js';
import { isMediaQuery, mediaLookup } from './research/media-lookup.js';
import { ADAPTERS, detectAdapter } from './ai-adapters/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const headless = process.argv.includes('--headless');

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

const profile = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'profiles', 'jared-eng.json'), 'utf-8')
) as {
  name: string;
  reply_char_limit: number;
  preferred_ai_sites: string[];
  max_web_sources: number;
  continuation_gate_message: string;
};

const CHAR_LIMIT = profile.reply_char_limit;

async function sendSecurusMessage(opts: {
  contact: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { page, cleanup } = await getSecurusPage({ headless });

  // Navigate to compose
  await reliableClick(page, 'button:has-text("Compose"), a:has-text("Compose")', { timeout: 12_000 });
  await waitForPageStable(page);

  // Select contact — search input first, dropdown fallback
  const contactInputSel = 'input[placeholder*="contact" i], input[placeholder*="search" i]';
  const hasContactInput = await page.isVisible(contactInputSel).catch(() => false);
  if (hasContactInput) {
    await reliableFill(page, contactInputSel, opts.contact);
    await page.waitForTimeout(800);
    await reliableClick(page, `text=${opts.contact}`, { timeout: 8_000 });
  } else {
    await page.selectOption('select[name*="contact"], select', { label: opts.contact }).catch(async () => {
      await reliableClick(page, `text=${opts.contact}`, { timeout: 8_000 });
    });
  }

  // Fill subject and body
  await reliableFill(page, 'input[name*="subject" i], #subject', opts.subject, { timeout: 8_000 });
  await reliableFill(
    page,
    'textarea[name*="message" i], #message-body, [contenteditable="true"]',
    opts.body,
    { timeout: 8_000 }
  );

  // Send
  await reliableClick(page, 'button:has-text("Send"), [type="submit"]:has-text("Send")', { timeout: 10_000 });
  await waitForPageStable(page);

  // Confirm dialog if present
  const confirmSel = 'button:has-text("Confirm"), button:has-text("OK"), button:has-text("Yes")';
  const hasConfirm = await page.isVisible(confirmSel, { timeout: 3_000 }).catch(() => false);
  if (hasConfirm) {
    await reliableClick(page, confirmSel, { timeout: 8_000 });
    await waitForPageStable(page);
  }

  console.error(`Sent Securus message to ${opts.contact}: "${opts.subject}"`);
  await cleanup();
}

async function runResearch(request: ResearchRequest): Promise<void> {
  const { query, contact, subject } = request;
  console.error(`\nResearching: "${query}"`);

  // 1. Web search via crawl4ai
  const webSources = await webSearch(query, profile.max_web_sources);
  console.error(`Web sources: ${webSources.length}`);

  // 2. Reddit search (supplemental)
  const redditResults = await redditSearch(query, 3);
  const redditSources = redditResultsToSources(redditResults);

  // 3. Media lookup if relevant
  let mediaSources = webSources;
  if (isMediaQuery(query)) {
    const info = await mediaLookup(query);
    if (info) {
      const mediaNote = `${info.title} (${info.year ?? 'N/A'}) — ${info.type}. ` +
        `Rating: ${info.rating?.toFixed(1) ?? 'N/A'}. ` +
        (info.streamingOn?.length ? `Streaming on: ${info.streamingOn.join(', ')}. ` : '') +
        (info.overview ? info.overview : '');
      mediaSources = [{ url: `https://www.themoviedb.org`, title: info.title, excerpt: mediaNote }, ...webSources];
    }
  }

  const allSources = [...mediaSources, ...redditSources];

  // 4. Query logged-in AI sites (Perplexity first) — reuse headed CDP session
  const { context, cleanup: cleanupAI } = await getSecurusPage({ headless: false });
  const aiResponses: Array<{ site: string; response: string }> = [];

  for (const page of context.pages()) {
    const adapter = detectAdapter(page.url());
    if (!adapter || !profile.preferred_ai_sites.includes(adapter.key)) continue;
    const loggedIn = await adapter.isLoggedIn(page).catch(() => false);
    if (!loggedIn) continue;

    try {
      await page.bringToFront();
      const result = await adapter.query(page, query);
      aiResponses.push({ site: adapter.label, response: result.response });
      console.error(`${adapter.label}: ${result.response.length} chars`);
    } catch (err) {
      console.error(`${adapter.label} failed: ${(err as Error).message}`);
    }
  }
  await cleanupAI();

  // 5. Build reply parts
  const { parts, totalParts } = buildReply({
    query,
    aiResponses,
    webSources: allSources,
    charLimit: CHAR_LIMIT,
  });

  console.error(`Reply: ${totalParts} part(s), total ${parts.reduce((n, p) => n + p.length, 0)} chars`);

  // 6. Save to memory
  await saveToMemory({
    query,
    requestor: contact,
    sources: allSources,
    aiResponses,
    summary: parts[0],
  });

  // 7. Send Part 1
  await sendSecurusMessage({ contact, subject: `Re: ${subject}`, body: parts[0] });

  // 8. If multi-part, save pending continuation and send gate message
  if (totalParts > 1) {
    const gateMsg = buildStampGateMessage(query, totalParts - 1, 2);

    try {
      await supabase.from('pending_continuations').insert({
        contact,
        query,
        subject,
        total_parts: totalParts,
        parts_sent: 1,
        remaining_parts: parts.slice(1),
        awaiting_confirmation: true,
        expires_at: new Date(Date.now() + Number(process.env.STAMP_GATE_EXPIRE_HOURS ?? 48) * 3600_000).toISOString(),
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Supabase continuation save failed:', (err as Error).message);
    }

    // Send gate message as a separate message
    await new Promise(r => setTimeout(r, 2000));
    await sendSecurusMessage({ contact, subject: `Re: ${subject} — more available`, body: gateMsg });
  }

  // Update securus_log
  try {
    await supabase.from('securus_log').update({ status: 'research_sent' })
      .eq('message_id', request.messageId);
  } catch { /* non-fatal */ }
}

async function handleContinuation(contact: string, action: 'send_more' | 'stop'): Promise<void> {
  let pending: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from('pending_continuations')
      .select('*')
      .eq('contact', contact)
      .eq('awaiting_confirmation', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    pending = data as Record<string, unknown> | null;
  } catch { /* no pending continuation */ }

  if (!pending) return;

  if (action === 'stop') {
    try {
      await supabase.from('pending_continuations')
        .update({ awaiting_confirmation: false, status: 'stopped' })
        .eq('id', pending['id']);
    } catch { /* non-fatal */ }
    console.error(`Continuation stopped by ${contact}`);
    return;
  }

  const remainingParts = pending['remaining_parts'] as string[];
  const nextPart = remainingParts[0];
  const stillRemaining = remainingParts.slice(1);

  await sendSecurusMessage({
    contact,
    subject: `Re: ${pending['subject']} (Part ${(pending['parts_sent'] as number) + 1})`,
    body: nextPart,
  });

  if (stillRemaining.length > 0) {
    const gateMsg = buildStampGateMessage(
      pending['query'] as string,
      stillRemaining.length,
      (pending['parts_sent'] as number) + 2
    );
    await new Promise(r => setTimeout(r, 2000));
    await sendSecurusMessage({ contact, subject: `Re: ${pending['subject']} — more available`, body: gateMsg });

    try {
      await supabase.from('pending_continuations').update({
        parts_sent: (pending['parts_sent'] as number) + 1,
        remaining_parts: stillRemaining,
        awaiting_confirmation: true,
      }).eq('id', pending['id']);
    } catch { /* non-fatal */ }
  } else {
    try {
      await supabase.from('pending_continuations')
        .update({ awaiting_confirmation: false, status: 'complete' })
        .eq('id', pending['id']);
    } catch { /* non-fatal */ }
    console.error('All parts delivered.');
  }
}

// Main execution
const inbox = await checkInbox();

for (const request of inbox.researchRequests) {
  await runResearch(request);
}

for (const reply of inbox.continuationReplies) {
  await handleContinuation(reply.contact, reply.action);
}

if (inbox.researchRequests.length === 0 && inbox.continuationReplies.length === 0) {
  console.log('No pending research requests or continuations found.');
}
