/**
 * Media metadata lookup via TMDB, TVDB, Trakt, and Watchmode.
 * Used when a research query is about a movie, TV show, or entertainment.
 */

export interface MediaInfo {
  title: string;
  year?: number;
  type: 'movie' | 'tv' | 'unknown';
  overview?: string;
  rating?: number;
  genres?: string[];
  streamingOn?: string[];
  traktUrl?: string;
  tmdbId?: number;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const WATCHMODE_BASE = 'https://api.watchmode.com/v1';

async function searchTmdb(title: string): Promise<MediaInfo | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?query=${encodeURIComponent(title)}&api_key=${key}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      results?: Array<{
        id: number;
        title?: string;
        name?: string;
        media_type: string;
        overview?: string;
        vote_average?: number;
        genre_ids?: number[];
        release_date?: string;
        first_air_date?: string;
      }>;
    };
    const hit = data.results?.[0];
    if (!hit) return null;

    const yearStr = hit.release_date ?? hit.first_air_date ?? '';
    return {
      title: hit.title ?? hit.name ?? title,
      year: yearStr ? parseInt(yearStr.substring(0, 4)) : undefined,
      type: hit.media_type === 'movie' ? 'movie' : hit.media_type === 'tv' ? 'tv' : 'unknown',
      overview: hit.overview,
      rating: hit.vote_average,
      tmdbId: hit.id,
    };
  } catch {
    return null;
  }
}

async function getStreamingAvailability(title: string, year?: number): Promise<string[]> {
  const key = process.env.WATCHMODE_API_KEY;
  if (!key) return [];

  try {
    const searchRes = await fetch(
      `${WATCHMODE_BASE}/search/?apiKey=${key}&search_value=${encodeURIComponent(title)}&search_type=1`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json() as { title_results?: Array<{ id: number; year: number }> };
    const match = year
      ? searchData.title_results?.find(r => Math.abs(r.year - year) <= 1)
      : searchData.title_results?.[0];
    if (!match) return [];

    const sourcesRes = await fetch(
      `${WATCHMODE_BASE}/title/${match.id}/sources/?apiKey=${key}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!sourcesRes.ok) return [];

    const sourcesData = await sourcesRes.json() as Array<{ name: string; type: string }>;
    return [...new Set(sourcesData.filter(s => s.type === 'sub').map(s => s.name))].slice(0, 6);
  } catch {
    return [];
  }
}

export async function mediaLookup(title: string): Promise<MediaInfo | null> {
  const info = await searchTmdb(title);
  if (!info) return null;

  info.streamingOn = await getStreamingAvailability(info.title, info.year);
  return info;
}

export function isMediaQuery(query: string): boolean {
  const mediaKeywords = /\b(movie|film|show|series|episode|season|watch|stream|streaming|netflix|hulu|disney|hbo|prime video|tv show|anime)\b/i;
  return mediaKeywords.test(query);
}
