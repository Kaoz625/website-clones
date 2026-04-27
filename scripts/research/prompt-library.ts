import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? 'http://localhost:54321',
  process.env.SUPABASE_KEY ?? ''
);

export interface PromptRecord {
  id?: number;
  site: string;
  prompt_template: string;
  context: string;
  response_quality?: number; // 1-5
  created_at?: string;
}

export async function loadBestPrompt(site: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('prompt_library')
      .select('prompt_template')
      .eq('site', site)
      .order('response_quality', { ascending: false })
      .limit(1)
      .single();
    return data?.prompt_template ?? null;
  } catch {
    return null;
  }
}

export async function savePrompt(site: string, promptTemplate: string, context: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('prompt_library')
      .insert({ site, prompt_template: promptTemplate, context })
      .select('id')
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function ratePrompt(id: number, score: number): Promise<void> {
  try {
    await supabase.from('prompt_library').update({ response_quality: score }).eq('id', id);
  } catch {
    // Non-fatal — best effort
  }
}
