import type { Track } from "./library";

export type DuplicateGroup = {
  key: string;
  method: "metadata" | "fingerprint";
  confidence: number; // 0..1
  tracks: Track[];
};

function norm(s?: string) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function groupBy<T>(items: T[], keyFn: (t: T) => string | undefined) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    if (!k) continue;
    const arr = map.get(k) ?? [];
    arr.push(it);
    map.set(k, arr);
  }
  return map;
}

export function findDuplicates(tracks: Track[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();

  // 1) Fingerprint match — highest confidence
  const byFp = groupBy(tracks, (t) => (t.fingerprint ? t.fingerprint.slice(0, 40) : undefined));
  for (const [key, list] of byFp) {
    if (list.length < 2) continue;
    list.forEach((t) => seen.add(t.id));
    groups.push({ key: `fp:${key}`, method: "fingerprint", confidence: 0.98, tracks: list });
  }

  // 2) Metadata match on remaining — artist+title (+duration bucket)
  const remaining = tracks.filter((t) => !seen.has(t.id));
  const byMeta = groupBy(remaining, (t) => {
    if (!t.artist || !t.title) return undefined;
    const durBucket = t.duration ? Math.round(t.duration / 3) : "x";
    return `${norm(t.artist)}::${norm(t.title)}::${durBucket}`;
  });
  for (const [key, list] of byMeta) {
    if (list.length < 2) continue;
    groups.push({ key: `meta:${key}`, method: "metadata", confidence: 0.82, tracks: list });
  }

  return groups.sort((a, b) => b.confidence - a.confidence);
}

export function pickBestOfGroup(g: DuplicateGroup): Track {
  // Prefer: higher bitrate, then larger size, then more complete tags.
  return [...g.tracks].sort((a, b) => {
    const br = (b.bitrate ?? 0) - (a.bitrate ?? 0);
    if (br) return br;
    const sz = (b.size ?? 0) - (a.size ?? 0);
    if (sz) return sz;
    const ta = [a.artist, a.title, a.album, a.year].filter(Boolean).length;
    const tb = [b.artist, b.title, b.album, b.year].filter(Boolean).length;
    return tb - ta;
  })[0];
}
