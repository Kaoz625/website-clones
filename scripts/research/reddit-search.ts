#!/usr/bin/env tsx
/**
 * Reddit search via crawl4ai — finds relevant threads, discussions, and links.
 * Usage: npm run research:reddit -- "your topic"
 */

import type { Source } from './web-search.js';

const CRAWL4AI_URL = process.env.CRAWL4AI_URL ?? 'http://localhost:11235';

export interface RedditResult {
  url: string;
  subreddit: string;
  title: string;
  upvotes?: string;
  excerpt: string;
  links: string[];  // External links found in the thread
  magnetLinks: string[];  // Magnet links for debrid resolution
}

async function crawlRedditPage(url: string): Promise<RedditResult | null> {
  try {
    const res = await fetch(`${CRAWL4AI_URL}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url], word_count_threshold: 20 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      results?: Array<{
        url: string;
        markdown?: string;
        metadata?: Record<string, string>;
        links?: Array<{ href: string; text: string }>;
      }>;
    };
    const result = data.results?.[0];
    if (!result) return null;

    const meta = result.metadata ?? {};
    const allLinks = (result.links ?? []).map((l: { href: string }) => l.href);
    const magnetLinks = allLinks.filter((l: string) => l.startsWith('magnet:'));
    const externalLinks = allLinks.filter((l: string) =>
      l.startsWith('http') && !l.includes('reddit.com')
    );

    const subredditMatch = url.match(/reddit\.com\/r\/([^/]+)/);

    return {
      url,
      subreddit: subredditMatch?.[1] ?? 'unknown',
      title: meta['title'] ?? meta['og:title'] ?? '',
      excerpt: (result.markdown ?? '').substring(0, 1000).trim(),
      links: externalLinks.slice(0, 10),
      magnetLinks: magnetLinks.slice(0, 5),
    };
  } catch {
    return null;
  }
}

export async function redditSearch(query: string, maxResults = 5): Promise<RedditResult[]> {
  const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=${maxResults}`;

  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (research-bot/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      data?: { children?: Array<{ data: { url: string; permalink: string } }> };
    };
    const posts = data.data?.children ?? [];
    const urls = posts.map((p: { data: { permalink: string } }) =>
      `https://www.reddit.com${p.data.permalink}.json`
    );

    const results = await Promise.all(urls.slice(0, maxResults).map(crawlRedditPage));
    return results.filter((r): r is RedditResult => r !== null);
  } catch (err) {
    console.error('Reddit search failed:', (err as Error).message);
    return [];
  }
}

export function redditResultsToSources(results: RedditResult[]): Source[] {
  return results.map(r => ({
    url: r.url,
    title: r.title,
    publication: `Reddit r/${r.subreddit}`,
    excerpt: r.excerpt,
  }));
}

// CLI entry point
if (process.argv[1]?.includes('reddit-search')) {
  const query = process.argv.slice(2).join(' ') || 'free movies streaming 2024';
  console.error(`Reddit search: ${query}`);
  const results = await redditSearch(query);
  console.log(JSON.stringify(results, null, 2));
  console.error(`\nFound ${results.length} thread(s)`);
}
