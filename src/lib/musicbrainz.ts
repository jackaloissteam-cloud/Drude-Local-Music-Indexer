import type { Track } from "./library";

const MB_URL = "https://musicbrainz.org/ws/2/recording";
const RATE_MS = 1100; // MusicBrainz asks for max 1 req/sec

export type MBResult = {
  artist?: string;
  title?: string;
  album?: string;
  year?: number;
  score?: number;
};

// Parse "Artist - Title" / "01 - Title" style filenames as a fallback query.
function parseFilename(name: string): { artist?: string; title?: string } {
  const bare = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  // Strip leading track numbers like "01 ", "01. ", "01 - "
  const noTrack = bare.replace(/^\d{1,3}\s*[-.)\s]\s*/, "");
  const parts = noTrack.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { title: noTrack };
}

function buildQuery(t: Track): string | null {
  const hints = parseFilename(t.filename);
  const artist = t.artist || hints.artist;
  const title = t.title || hints.title;
  if (!title) return null;
  const parts: string[] = [`recording:"${title.replace(/"/g, "")}"`];
  if (artist) parts.push(`artist:"${artist.replace(/"/g, "")}"`);
  return parts.join(" AND ");
}

export async function lookupTrack(t: Track): Promise<MBResult | null> {
  const query = buildQuery(t);
  if (!query) return null;
  const url = `${MB_URL}/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const data = await res.json();
  const rec = data?.recordings?.[0];
  if (!rec) return null;
  const artist = rec["artist-credit"]?.map((a: any) => a.name).join(", ");
  const release = rec.releases?.[0];
  const yearStr: string | undefined = release?.date || rec["first-release-date"];
  const year = yearStr ? parseInt(yearStr.slice(0, 4), 10) : undefined;
  return {
    artist: artist || undefined,
    title: rec.title || undefined,
    album: release?.title || undefined,
    year: Number.isFinite(year) ? year : undefined,
    score: typeof rec.score === "number" ? rec.score : undefined,
  };
}

export type LookupProgress = {
  done: number;
  total: number;
  updated: number;
  failed: number;
  currentTitle?: string;
};

export async function lookupMissing(
  tracks: Track[],
  onProgress: (p: LookupProgress) => void,
  minScore = 85,
  signal?: AbortSignal,
): Promise<Map<string, Partial<Track>>> {
  const patches = new Map<string, Partial<Track>>();
  let done = 0;
  let updated = 0;
  let failed = 0;
  for (const t of tracks) {
    if (signal?.aborted) break;
    onProgress({ done, total: tracks.length, updated, failed, currentTitle: t.title || t.filename });
    try {
      const r = await lookupTrack(t);
      if (r && (r.score ?? 100) >= minScore) {
        const patch: Partial<Track> = {};
        if (!t.artist && r.artist) patch.artist = r.artist;
        if (!t.title && r.title) patch.title = r.title;
        if (!t.album && r.album) patch.album = r.album;
        if (!t.year && r.year) patch.year = r.year;
        if (Object.keys(patch).length > 0) {
          patches.set(t.id, patch);
          updated++;
        }
      }
    } catch {
      failed++;
    }
    done++;
    onProgress({ done, total: tracks.length, updated, failed, currentTitle: t.title || t.filename });
    if (done < tracks.length) await new Promise((r) => setTimeout(r, RATE_MS));
  }
  return patches;
}
