/**
 * Resolves magnet links and torrent URLs to direct download links
 * via Real-Debrid (primary) with Torbox as fallback.
 */

const REAL_DEBRID_BASE = 'https://api.real-debrid.com/rest/1.0';
const TORBOX_BASE = 'https://api.torbox.app/v1/api';

export interface DebridResult {
  service: 'real-debrid' | 'torbox';
  originalLink: string;
  downloadLinks: string[];
  filename?: string;
}

async function resolveRealDebrid(magnetOrUrl: string): Promise<DebridResult | null> {
  const apiKey = process.env.REAL_DEBRID_API_KEY;
  if (!apiKey) return null;

  try {
    // Step 1: Add magnet
    const addRes = await fetch(`${REAL_DEBRID_BASE}/torrents/addMagnet`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `magnet=${encodeURIComponent(magnetOrUrl)}`,
      signal: AbortSignal.timeout(15_000),
    });
    if (!addRes.ok) return null;
    const addData = await addRes.json() as { id: string };

    // Step 2: Select all files
    await fetch(`${REAL_DEBRID_BASE}/torrents/selectFiles/${addData.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'files=all',
      signal: AbortSignal.timeout(10_000),
    });

    // Step 3: Poll for links (up to 30s)
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const infoRes = await fetch(`${REAL_DEBRID_BASE}/torrents/info/${addData.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const info = await infoRes.json() as { status: string; links: string[]; filename: string };
      if (info.status === 'downloaded' && info.links?.length > 0) {
        return {
          service: 'real-debrid',
          originalLink: magnetOrUrl,
          downloadLinks: info.links,
          filename: info.filename,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveTorbox(magnetOrUrl: string): Promise<DebridResult | null> {
  const apiKey = process.env.TORBOX_API_KEY;
  if (!apiKey) return null;

  try {
    const addRes = await fetch(`${TORBOX_BASE}/torrents/createtorrent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet: magnetOrUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!addRes.ok) return null;
    const addData = await addRes.json() as { data?: { torrent_id: number } };
    const torrentId = addData.data?.torrent_id;
    if (!torrentId) return null;

    // Poll for download link
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const linkRes = await fetch(`${TORBOX_BASE}/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&file_id=0`, {
        signal: AbortSignal.timeout(10_000),
      });
      const linkData = await linkRes.json() as { data?: string };
      if (linkData.data) {
        return {
          service: 'torbox',
          originalLink: magnetOrUrl,
          downloadLinks: [linkData.data],
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveDebrid(magnetOrUrl: string): Promise<DebridResult | null> {
  // Try Real-Debrid first, fall back to Torbox
  const rd = await resolveRealDebrid(magnetOrUrl);
  if (rd) return rd;

  const tb = await resolveTorbox(magnetOrUrl);
  return tb;
}
