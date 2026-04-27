#!/usr/bin/env tsx
/**
 * Scans Comet browser bookmarks (JSON) and logs to Obsidian + Supabase.
 * Usage: npm run browser:bookmarks
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const COMET_BOOKMARKS = `${process.env.HOME}/Library/Application Support/Comet/Default/Bookmarks`;
const VAULT = process.env.OBSIDIAN_VAULT_PATH ?? `${process.env.HOME}/Documents/NYCTailblazers/LLM-Brains/brain`;

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

interface BookmarkNode {
  type: 'url' | 'folder';
  name: string;
  url?: string;
  children?: BookmarkNode[];
  date_added?: string;
}

interface BookmarkFile {
  roots: {
    bookmark_bar: BookmarkNode;
    other: BookmarkNode;
    synced: BookmarkNode;
  };
}

const flat: Array<{ url: string; title: string; folder: string }> = [];

function walk(node: BookmarkNode, path: string): void {
  if (node.type === 'url' && node.url) {
    flat.push({ url: node.url, title: node.name, folder: path });
  } else if (node.type === 'folder' && node.children) {
    const nextPath = path ? `${path} / ${node.name}` : node.name;
    for (const child of node.children) walk(child, nextPath);
  }
}

const raw = JSON.parse(readFileSync(COMET_BOOKMARKS, 'utf-8')) as BookmarkFile;
walk(raw.roots.bookmark_bar, 'Bookmarks Bar');
walk(raw.roots.other, 'Other Bookmarks');
walk(raw.roots.synced, 'Mobile Bookmarks');

// Group by top-level folder
const grouped: Record<string, typeof flat> = {};
for (const bm of flat) {
  const topFolder = bm.folder.split(' / ')[0] ?? 'Other';
  (grouped[topFolder] ??= []).push(bm);
}

// Save to Obsidian
const dir = join(VAULT, 'work', 'automation');
mkdirSync(dir, { recursive: true });

const sections = Object.entries(grouped)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([folder, items]) => {
    const lines = items.map(bm => `- [${bm.title || bm.url}](${bm.url})`).join('\n');
    return `## ${folder} (${items.length})\n${lines}`;
  });

const note = `---
date: ${new Date().toISOString()}
tags: [automation, bookmarks]
---

# Comet Browser Bookmarks
Total: ${flat.length} bookmarks across ${Object.keys(grouped).length} folders.

${sections.join('\n\n')}
`;

writeFileSync(join(dir, 'bookmarks.md'), note, 'utf-8');
console.error('Obsidian note written: work/automation/bookmarks.md');

// Save to Supabase
try {
  await supabase.from('bookmarks').upsert(
    flat.map(bm => ({ url: bm.url, title: bm.title, folder: bm.folder, scanned_at: new Date().toISOString() })),
    { onConflict: 'url' }
  );
  console.error(`Saved ${flat.length} bookmarks to Supabase`);
} catch (err) {
  console.error('Supabase write skipped:', (err as Error).message);
}

console.log(JSON.stringify(
  Object.entries(grouped).map(([folder, items]) => ({ folder, count: items.length })),
  null, 2
));
