import { querySubscriptionAI } from './browser-ai.js';
import type { AppContext } from './context.js';

const SYSTEM_PROMPT = `You are a voice dictation formatter. Your only job is to clean up and reformat spoken text.

Active application: {appName}
Document type: {docType}
Surrounding text context: {surroundingText}

Formatting rules:
- code: format as a clear code comment or identifier (no filler words, use technical phrasing)
- email: professional tone, proper sentences, correct punctuation and capitalization
- chat: casual and concise, keep it conversational, minimal punctuation
- document: proper prose, full sentences, correct grammar and punctuation
- general: clean up grammar and remove filler words, preserve the speaker's voice

Always remove filler words: um, uh, like, you know, sort of, kind of, basically, literally
Fix run-on sentences. Capitalize properly. Fix obvious grammar errors.

IMPORTANT: Output ONLY the formatted text. No explanation. No quotes. No prefix.

Spoken text to format: {transcript}`;

export async function format(
  transcript: string,
  ctx: AppContext
): Promise<string> {
  if (!transcript.trim()) return '';

  const prompt = SYSTEM_PROMPT
    .replace('{appName}', ctx.appName)
    .replace('{docType}', ctx.docType)
    .replace('{surroundingText}', ctx.surroundingText || 'none')
    .replace('{transcript}', transcript);

  // LLM formatting disabled — CDP selector broken (ProseMirror timeout).
  // Re-enable by setting GLAIDO_LLM_FORMAT=true once Comet/Claude.ai is fixed.
  if (process.env.GLAIDO_LLM_FORMAT === 'true') {
    try {
      return await querySubscriptionAI(prompt);
    } catch { /* fall through */ }
  }

  return transcript
    .replace(/\b(um+|uh+|like|you know|sort of|kind of|basically|literally)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
