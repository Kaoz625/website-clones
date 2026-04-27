import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import type { Source } from './web-search.js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

const VAULT = process.env.OBSIDIAN_VAULT_PATH ?? `${process.env.HOME}/Documents/NYCTailblazers/LLM-Brains/brain`;

export interface ResearchRun {
  query: string;
  requestor: string;
  sources: Source[];
  aiResponses: Array<{ site: string; response: string }>;
  summary: string;
  timestamp?: string;
}

export async function saveToMemory(run: ResearchRun): Promise<void> {
  const timestamp = run.timestamp ?? new Date().toISOString();
  const slug = run.query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40);

  await Promise.all([
    saveToObsidian(run, timestamp, slug),
    saveToSupabase(run, timestamp),
  ]);
}

function saveToObsidian(run: ResearchRun, timestamp: string, slug: string): void {
  const dir = join(VAULT, 'raw', 'research');
  mkdirSync(dir, { recursive: true });

  const citations = run.sources
    .map((s, i) => `${i + 1}. [${s.title}](${s.url})${s.date ? ` (${s.date})` : ''}`)
    .join('\n');

  const aiSection = run.aiResponses
    .map(r => `### ${r.site}\n${r.response}`)
    .join('\n\n');

  const note = `---
title: "${run.query}"
date: ${timestamp}
requestor: ${run.requestor}
tags: [research, ${run.requestor}]
---

# Research: ${run.query}

## Summary
${run.summary}

## AI Responses
${aiSection}

## Web Sources
${citations}
`;

  const filename = `${timestamp.replace(/[:.]/g, '-').substring(0, 19)}-${slug}.md`;
  writeFileSync(join(dir, filename), note, 'utf-8');
  console.error(`Obsidian note saved: raw/research/${filename}`);
}

async function saveToSupabase(run: ResearchRun, timestamp: string): Promise<void> {
  try {
    await supabase.from('research_runs').insert({
      query: run.query,
      requestor: run.requestor,
      sources: run.sources,
      ai_responses: run.aiResponses,
      summary: run.summary,
      created_at: timestamp,
    });
    console.error('Saved to Supabase: research_runs');
  } catch (err) {
    console.error('Supabase write skipped (not connected):', (err as Error).message);
  }
}
