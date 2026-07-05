export type Track = {
  id: string;
  path: string;
  filename: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  title?: string;
  track?: number;
  disc?: number;
  year?: number;
  genre?: string;
  duration?: number; // seconds
  bitrate?: number; // kbps
  size?: number; // bytes
  format?: string; // mp3, flac, m4a...
  fingerprint?: string; // Chromaprint
  acoustidId?: string;
  scannedAt?: string;
};

export type Library = {
  version: 1;
  root?: string;
  scannedAt?: string;
  tracks: Track[];
};

export const EMPTY_LIBRARY: Library = { version: 1, tracks: [] };

export function isTrackComplete(t: Track): boolean {
  return Boolean(t.artist && t.title && t.album);
}

export function formatDuration(sec?: number): string {
  if (!sec || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatSize(bytes?: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function proposedPath(t: Track): string {
  const safe = (s?: string) => (s ?? "Unknown").replace(/[\/\\:*?"<>|]/g, "_").trim() || "Unknown";
  const artist = safe(t.albumArtist || t.artist);
  const album = safe(t.album);
  const track = t.track ? String(t.track).padStart(2, "0") + " " : "";
  const title = safe(t.title || t.filename.replace(/\.[^.]+$/, ""));
  const ext = t.format ? `.${t.format}` : (t.filename.match(/\.[^.]+$/)?.[0] ?? "");
  return `${artist}/${album}/${track}${title}${ext}`;
}
