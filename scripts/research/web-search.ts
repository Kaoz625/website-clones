#!/usr/bin/env tsx
/**
 * crawl4ai-powered supplemental web scraper.
 * Searches Google/Bing/DuckDuckGo for a query, then scrapes top result URLs
 * for full article text and metadata.
 *
 * Usage: npm run research:test -- "your query here"
 */

export interface Source {
  url: string;
  title: string;
  author?: string;
  date?: string;
  publication?: string;
  excerpt: string;
}

const CRAWL4AI_URL = process.env.CRAWL4AI_URL ?? 'http://localhost:11235';

async function checkCrawl4ai(): Promise<boolean> {
  try {
    const res = await fetch(`${CRAWL4AI_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function crawlUrl(url: string): Promise<Source | null> {
  try {
    const res = await fetch(`${CRAWL4AI_URL}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [url],
        word_count_threshold: 50,
        extraction_strategy: 'JsonCssExtractionStrategy',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { results?: Array<{ url: string; markdown?: string; metadata?: Record<string, string> }> };
    const result = data.results?.[0];
    if (!result?.markdown) return null;

    const meta = result.metadata ?? {};
    return {
      url,
      title: meta['title'] ?? meta['og:title'] ?? url,
      author: meta['author'] ?? meta['article:author'],
      date: meta['article:published_time'] ?? meta['date'],
      publication: meta['og:site_name'],
      excerpt: result.markdown.substring(0, 1500).trim(),
    };
  } catch {
    return null;
  }
}

async function searchUrls(query: string, maxResults: number): Promise<string[]> {
  // Use DuckDuckGo HTML search (no API key required)
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(`${CRAWL4AI_URL}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: [searchUrl],
        word_count_threshold: 0,
        css_selector: 'a.result__url, .result__a',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ links?: Array<{ href: string }> }> };
    const links = data.results?.[0]?.links ?? [];
    return links
      .map((l: { href: string }) => l.href)
      .filter((u: string) => u.startsWith('http') && !u.includes('duckduckgo'))
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

export async function webSearch(query: string, maxResults = 5): Promise<Source[]> {
  const alive = await checkCrawl4ai();
  if (!alive) {
    console.error(`crawl4ai not reachable at ${CRAWL4AI_URL}. Start it with: bash ~/.bootstrap/start-crawl4ai.sh`);
    return [];
  }

  const urls = await searchUrls(query, maxResults);
  if (urls.length === 0) return [];

  const results = await Promise.all(urls.map(crawlUrl));
  return results.filter((r): r is Source => r !== null);
}

// CLI entry point
if (process.argv[1]?.includes('web-search')) {
  const query = process.argv.slice(2).join(' ') || 'latest AI research news';
  console.error(`Searching: ${query}`);
  const sources = await webSearch(query);
  console.log(JSON.stringify(sources, null, 2));
  console.error(`\nFound ${sources.length} source(s)`);
}
