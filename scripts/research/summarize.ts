import type { Source } from './web-search.js';

export interface SummaryResult {
  parts: string[];      // One or more message-ready strings, each within charLimit
  totalParts: number;
}

/**
 * Combines AI responses and web sources into a reply-ready summary.
 * Splits into multiple parts if the total exceeds charLimit.
 * Each part is self-contained and includes a "Part N of M" header.
 */
export function buildReply(opts: {
  query: string;
  aiResponses: Array<{ site: string; response: string }>;
  webSources: Source[];
  charLimit?: number;
}): SummaryResult {
  const { query, aiResponses, webSources, charLimit = 19996 } = opts;

  // Build the main content
  const sections: string[] = [];

  // AI synthesis section (Perplexity first)
  for (const { site, response } of aiResponses) {
    if (response.trim()) {
      sections.push(`[${site.toUpperCase()}]\n${response.trim()}`);
    }
  }

  // Web sources section
  if (webSources.length > 0) {
    const citations = webSources
      .map((s, i) => {
        const meta = [s.author, s.date, s.publication].filter(Boolean).join(' · ');
        return `[${i + 1}] ${s.title}${meta ? ` (${meta})` : ''}\n${s.url}\n${s.excerpt.substring(0, 400)}`;
      })
      .join('\n\n');
    sections.push(`SOURCES:\n${citations}`);
  }

  const fullText = `Research: ${query}\n\n${sections.join('\n\n---\n\n')}`;

  // If it fits in one part, return it
  if (fullText.length <= charLimit) {
    return { parts: [fullText], totalParts: 1 };
  }

  // Split into parts
  const parts: string[] = [];
  let remaining = fullText;

  while (remaining.length > 0) {
    const partNum = parts.length + 1;
    const header = `[Part ${partNum}] Research: ${query}\n\n`;
    const available = charLimit - header.length - 20; // 20-char buffer
    const chunk = remaining.substring(0, available);
    remaining = remaining.substring(available);

    // Find a clean break point (paragraph boundary)
    const lastBreak = chunk.lastIndexOf('\n\n');
    if (lastBreak > available * 0.7 && remaining.length > 0) {
      parts.push(header + chunk.substring(0, lastBreak));
      remaining = chunk.substring(lastBreak + 2) + remaining;
    } else {
      parts.push(header + chunk);
    }
  }

  // Add "Part N of M" footers now that we know total
  const total = parts.length;
  const labeled = parts.map((p, i) => {
    // Replace header with full "Part N of M" label
    return p.replace(/\[Part \d+\]/, `[Part ${i + 1} of ${total}]`);
  });

  return { parts: labeled, totalParts: total };
}

export function buildStampGateMessage(query: string, remaining: number, nextPart: number): string {
  return (
    `I have ${remaining} more part(s) of your research on "${query}". ` +
    `Each message = 1 stamp (${remaining} more total). ` +
    `Reply "send more" to receive Part ${nextPart}, or "stop" to end here.`
  );
}
