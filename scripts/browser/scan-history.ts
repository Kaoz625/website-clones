#!/usr/bin/env tsx
/**
 * Scans Comet browser history (SQLite) and logs to Obsidian + Supabase.
 * Usage: npm run browser:history
 */

import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const COMET_HISTORY = `${process.env.HOME}/Library/Application Support/Comet/Default/History`;
const VAULT = process.env.OBSIDIAN_VAULT_PATH ?? `${process.env.HOME}/Documents/NYCTailblazers/LLM-Brains/brain`;

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

// Site categories for organizing URLs
const CATEGORIES: Record<string, RegExp> = {
  'AI Sites': /claude\.ai|chat\.openai|chatgpt\.com|perplexity\.ai|gemini\.google|grok\.com|copilot\.microsoft|you\.com/,
  'Media': /netflix|hulu|disney|hbo|prime video|peacock|youtube|twitch|spotify|tubi/i,
  'Social': /reddit\.com|twitter\.com|x\.com|facebook|instagram|linkedin|tiktok/,
  'Dev Tools': /github\.com|stackoverflow|npmjs|developer\.|docs\.|api\./,
  'Research': /scholar\.google|pubmed|arxiv|researchgate|jstor/,
  'Streaming': /stremio|jellyfin|plex|emby|kodi/i,
  'Debrid': /real-debrid|torbox|debridio|alldebrid/i,
};

function categorize(url: string): string {
  for (const [cat, pattern] of Object.entries(CATEGORIES)) {
    if (pattern.test(url)) return cat;
  }
  return 'Other';
}

// Copy the locked SQLite file to /tmp to read safely
const tmpPath = '/tmp/comet-history-scan.db';
copyFileSync(COMET_HISTORY, tmpPath);

const db = new Database(tmpPath, { readonly: true });

const rows = db.prepare(`
  SELECT url, title, visit_count, last_visit_time
  FROM urls
  ORDER BY last_visit_time DESC
  LIMIT 5000
`).all() as Array<{ url: string; title: string; visit_count: number; last_visit_time: number }>;

db.close();

// Group by category
const grouped: Record<string, typeof rows> = {};
for (const row of rows) {
  const cat = categorize(row.url);
  (grouped[cat] ??= []).push(row);
}

// Save to Obsidian
const dir = join(VAULT, 'work', 'automation');
mkdirSync(dir, { recursive: true });

const sections = Object.entries(grouped)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([cat, items]) => {
    const lines = items.slice(0, 100).map(r =>
      `- [${r.title || r.url}](${r.url}) (${r.visit_count} visits)`
    ).join('\n');
    return `## ${cat} (${items.length})\n${lines}`;
  });

const note = `---
date: ${new Date().toISOString()}
tags: [automation, browser-history]
---

# Comet Browser History
Total: ${rows.length} URLs across ${Object.keys(grouped).length} categories.

${sections.join('\n\n')}
`;

writeFileSync(join(dir, 'browser-history.md'), note, 'utf-8');
console.error('Obsidian note written: work/automation/browser-history.md');

// Save to Supabase
try {
  const batch = rows.slice(0, 1000).map(r => ({
    url: r.url,
    title: r.title,
    visit_count: r.visit_count,
    category: categorize(r.url),
    scanned_at: new Date().toISOString(),
  }));
  await supabase.from('browser_history').upsert(batch, { onConflict: 'url' });
  console.error(`Saved ${batch.length} rows to Supabase browser_history`);
} catch (err) {
  console.error('Supabase write skipped:', (err as Error).message);
}

// Print summary
for (const [cat, items] of Object.entries(grouped).sort(([, a], [, b]) => b.length - a.length)) {
  console.log(`${cat.padEnd(20)} ${items.length} URLs`);
}
