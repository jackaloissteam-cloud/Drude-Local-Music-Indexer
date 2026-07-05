import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Library, Track, formatDuration, formatSize, isTrackComplete, proposedPath } from "@/lib/library";
import { findDuplicates, pickBestOfGroup } from "@/lib/dedupe";
import { SAMPLE_LIBRARY } from "@/lib/sample";
import { loadLibrary, saveLibrary } from "@/lib/storage";
import { lookupMissing, type LookupProgress } from "@/lib/musicbrainz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Disc3, Upload, Download, Search, Trash2, Pencil, Copy, Fingerprint, FileMusic, AlertTriangle, Sparkles, FolderTree, Wand2, X } from "lucide-react";

type Tab = "library" | "duplicates" | "import" | "schema";

const SAMPLE_INDEXER = `// scripts/indexer.ts — Node example
import { parseFile } from "music-metadata";
import { readdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const EXTS = new Set([".mp3", ".flac", ".m4a", ".ogg", ".wav"]);

async function* walk(dir) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else if (EXTS.has(extname(d.name).toLowerCase())) yield p;
  }
}

const tracks = [];
for await (const path of walk(process.argv[2])) {
  const m = await parseFile(path);
  tracks.push({
    id: randomUUID(),
    path,
    filename: path.split("/").pop(),
    artist: m.common.artist,
    album: m.common.album,
    title: m.common.title,
    track: m.common.track?.no ?? undefined,
    year: m.common.year,
    genre: m.common.genre?.[0],
    duration: m.format.duration,
    bitrate: m.format.bitrate ? Math.round(m.format.bitrate / 1000) : undefined,
    format: m.format.container?.toLowerCase(),
    // fingerprint: await chromaprint(path),  // optional
  });
}
console.log(JSON.stringify({ version: 1, root: process.argv[2], tracks }, null, 2));
`;

export default function Index() {
  const [lib, setLib] = useState<Library>(() => loadLibrary());
  const [tab, setTab] = useState<Tab>("library");
  const [q, setQ] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [editing, setEditing] = useState<Track | null>(null);

  useEffect(() => saveLibrary(lib), [lib]);

  const duplicates = useMemo(() => findDuplicates(lib.tracks), [lib.tracks]);
  const incompleteCount = useMemo(() => lib.tracks.filter((t) => !isTrackComplete(t)).length, [lib.tracks]);
  const totalSize = useMemo(() => lib.tracks.reduce((a, t) => a + (t.size ?? 0), 0), [lib.tracks]);
  const dupTrackCount = useMemo(() => duplicates.reduce((a, g) => a + g.tracks.length - 1, 0), [duplicates]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return lib.tracks.filter((t) => {
      if (onlyIncomplete && isTrackComplete(t)) return false;
      if (!query) return true;
      return [t.artist, t.album, t.title, t.filename, t.path]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(query));
    });
  }, [lib.tracks, q, onlyIncomplete]);

  const importFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Library;
      if (parsed?.version !== 1 || !Array.isArray(parsed.tracks)) throw new Error("Invalid library schema");
      setLib(parsed);
      setTab("library");
      toast.success(`Imported ${parsed.tracks.length} tracks`);
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  }, []);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(lib, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "library.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = () => {
    setLib(SAMPLE_LIBRARY);
    toast.success("Loaded sample library");
  };

  const clearAll = () => {
    if (!confirm("Clear the entire library?")) return;
    setLib({ version: 1, tracks: [] });
    toast.success("Library cleared");
  };

  const updateTrack = (id: string, patch: Partial<Track>) => {
    setLib((l) => ({ ...l, tracks: l.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  };

  const deleteTrack = (id: string) => {
    setLib((l) => ({ ...l, tracks: l.tracks.filter((t) => t.id !== id) }));
  };

  const resolveGroupKeepBest = (groupKey: string) => {
    const g = duplicates.find((x) => x.key === groupKey);
    if (!g) return;
    const best = pickBestOfGroup(g);
    const toRemove = g.tracks.filter((t) => t.id !== best.id).map((t) => t.id);
    setLib((l) => ({ ...l, tracks: l.tracks.filter((t) => !toRemove.includes(t.id)) }));
    toast.success(`Kept ${best.filename}, removed ${toRemove.length}`);
  };

  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupProgress, setLookupProgress] = useState<LookupProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runLookup = async () => {
    const targets = lib.tracks.filter((t) => !isTrackComplete(t));
    if (targets.length === 0) {
      toast.info("No tracks with missing tags.");
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLookupOpen(true);
    setLookupProgress({ done: 0, total: targets.length, updated: 0, failed: 0 });
    try {
      const patches = await lookupMissing(targets, setLookupProgress, 85, ctrl.signal);
      setLib((l) => ({
        ...l,
        tracks: l.tracks.map((t) => (patches.has(t.id) ? { ...t, ...patches.get(t.id) } : t)),
      }));
      toast.success(`Updated ${patches.size} of ${targets.length} tracks from MusicBrainz`);
    } catch (e) {
      toast.error(`Lookup failed: ${(e as Error).message}`);
    } finally {
      abortRef.current = null;
    }
  };

  const cancelLookup = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center shadow-lg shadow-primary/20">
              <Disc3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-serif text-2xl leading-none">Sift</h1>
              <p className="text-xs text-muted-foreground font-mono tracking-wide mt-1">LOCAL MUSIC INDEXER · REVIEW DASHBOARD</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadSample}>
              <Sparkles className="h-4 w-4" /> Sample
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={lib.tracks.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Tracks" value={lib.tracks.length.toLocaleString()} icon={<FileMusic className="h-4 w-4" />} />
          <StatCard label="Incomplete tags" value={incompleteCount.toLocaleString()} tone={incompleteCount ? "warning" : "muted"} icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="Duplicates" value={`${dupTrackCount} in ${duplicates.length} groups`} tone={dupTrackCount ? "warning" : "muted"} icon={<Fingerprint className="h-4 w-4" />} />
          <StatCard label="Total size" value={formatSize(totalSize)} icon={<FolderTree className="h-4 w-4" />} />
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="duplicates">
              Duplicates {duplicates.length > 0 && <span className="ml-2 text-xs font-mono text-primary">{duplicates.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-6">
            {lib.tracks.length === 0 ? (
              <EmptyState onSample={loadSample} onImport={() => setTab("import")} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search artist, album, title, path…"
                      className="pl-9 bg-card border-border"
                    />
                  </div>
                  <Button
                    variant={onlyIncomplete ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOnlyIncomplete((v) => !v)}
                  >
                    <AlertTriangle className="h-4 w-4" /> Missing tags only
                  </Button>
                  <Button
                    size="sm"
                    onClick={runLookup}
                    disabled={incompleteCount === 0}
                    title="Query MusicBrainz for tracks with missing artist/title/album"
                  >
                    <Wand2 className="h-4 w-4" /> Fetch missing tags ({incompleteCount})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Clear
                  </Button>
                </div>
                <TracksTable tracks={filtered} onEdit={setEditing} onDelete={deleteTrack} />
                <p className="mt-3 text-xs text-muted-foreground font-mono">
                  Showing {filtered.length} of {lib.tracks.length}
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="duplicates" className="mt-6">
            <DuplicatesView
              groups={duplicates}
              onResolve={resolveGroupKeepBest}
              onDelete={deleteTrack}
              onEdit={setEditing}
            />
          </TabsContent>

          <TabsContent value="import" className="mt-6">
            <ImportPanel onFile={importFile} onSample={loadSample} indexerCode={SAMPLE_INDEXER} />
          </TabsContent>

          <TabsContent value="schema" className="mt-6">
            <SchemaPanel />
          </TabsContent>
        </Tabs>
      </main>

      <TagEditor track={editing} onClose={() => setEditing(null)} onSave={(patch) => { if (editing) updateTrack(editing.id, patch); setEditing(null); }} />

      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-7xl px-6 py-6 flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>SIFT · v0.1</span>
          <span>Data stays in your browser — nothing uploaded.</span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, icon, tone = "default" }: { label: string; value: string; icon: React.ReactNode; tone?: "default" | "warning" | "muted" }) {
  const toneCls = tone === "warning" ? "text-warning" : tone === "muted" ? "text-muted-foreground" : "text-primary";
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
        <span className={toneCls}>{icon}</span> {label}
      </div>
      <div className="mt-2 text-2xl font-serif">{value}</div>
    </div>
  );
}

function TracksTable({ tracks, onEdit, onDelete }: { tracks: Track[]; onEdit: (t: Track) => void; onDelete: (id: string) => void }) {
  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 w-8"></th>
              <th className="text-left px-4 py-2.5">Title</th>
              <th className="text-left px-4 py-2.5">Artist</th>
              <th className="text-left px-4 py-2.5">Album</th>
              <th className="text-right px-4 py-2.5">Time</th>
              <th className="text-right px-4 py-2.5">Bitrate</th>
              <th className="text-left px-4 py-2.5">Fmt</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t) => {
              const complete = isTrackComplete(t);
              return (
                <tr key={t.id} className="border-t border-border hover:bg-secondary/30 transition-colors group">
                  <td className="px-4 py-2.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${complete ? "bg-success" : "bg-warning"}`} title={complete ? "Complete" : "Missing tags"} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium truncate max-w-[280px]">{t.title || <span className="text-muted-foreground italic">{t.filename}</span>}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate max-w-[280px]">{t.path}</div>
                  </td>
                  <td className="px-4 py-2.5">{t.artist || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-2.5">{t.album || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{formatDuration(t.duration)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">{t.bitrate ? `${t.bitrate}k` : "—"}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="font-mono text-[10px] uppercase">{t.format || "—"}</Badge></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(t.id)} className="hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              );
            })}
            {tracks.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No tracks match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DuplicatesView({
  groups,
  onResolve,
  onDelete,
  onEdit,
}: {
  groups: ReturnType<typeof findDuplicates>;
  onResolve: (key: string) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Track) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="border border-border rounded-md bg-card p-12 text-center">
        <Fingerprint className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="font-serif text-xl">No duplicates found.</p>
        <p className="text-sm text-muted-foreground mt-1">Detection runs on Chromaprint fingerprints first, then artist + title + duration.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const best = pickBestOfGroup(g);
        return (
          <div key={g.key} className="border border-border rounded-md bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-secondary/40 border-b border-border">
              <div className="flex items-center gap-3">
                <Badge variant={g.method === "fingerprint" ? "default" : "secondary"} className="font-mono uppercase text-[10px]">
                  {g.method === "fingerprint" ? <><Fingerprint className="h-3 w-3 mr-1" /> Fingerprint</> : "Metadata"}
                </Badge>
                <span className="text-sm text-muted-foreground font-mono">confidence {(g.confidence * 100).toFixed(0)}%</span>
                <span className="text-sm text-muted-foreground">· {g.tracks.length} files</span>
              </div>
              <Button size="sm" onClick={() => onResolve(g.key)}>
                Keep best, remove {g.tracks.length - 1}
              </Button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {g.tracks.map((t) => {
                  const isBest = t.id === best.id;
                  return (
                    <tr key={t.id} className="border-t border-border first:border-t-0">
                      <td className="px-4 py-2.5 w-8">
                        {isBest && <Badge className="font-mono text-[10px]">BEST</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{t.title || t.filename}</div>
                        <div className="text-xs text-muted-foreground font-mono">{t.path}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs whitespace-nowrap">
                        {t.bitrate ? `${t.bitrate}k` : "—"} · {formatSize(t.size)} · {formatDuration(t.duration)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => onDelete(t.id)} className="hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function ImportPanel({ onFile, onSample, indexerCode }: { onFile: (f: File) => void; onSample: () => void; indexerCode: string }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border bg-card"}`}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-serif text-xl mb-1">Drop your library.json</p>
          <p className="text-sm text-muted-foreground mb-4">Output from your local indexer script.</p>
          <div className="flex items-center justify-center gap-2">
            <label>
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <span className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium cursor-pointer hover:opacity-90">
                Choose file
              </span>
            </label>
            <Button variant="outline" size="sm" onClick={onSample}><Sparkles className="h-4 w-4" /> Load sample</Button>
          </div>
        </div>
      </div>
      <CodeBlock title="scripts/indexer.ts" code={indexerCode} />
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Copied");
  };
  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/40">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</span>
        <Button variant="ghost" size="sm" onClick={copy}><Copy className="h-3.5 w-3.5" /></Button>
      </div>
      <pre className="text-xs font-mono p-4 overflow-x-auto max-h-[420px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SchemaPanel() {
  const schema = `type Track = {
  id: string;
  path: string;                // absolute file path
  filename: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  title?: string;
  track?: number;
  disc?: number;
  year?: number;
  genre?: string;
  duration?: number;           // seconds
  bitrate?: number;            // kbps
  size?: number;               // bytes
  format?: "mp3" | "flac" | "m4a" | "ogg" | "wav";
  fingerprint?: string;        // Chromaprint (base64)
  acoustidId?: string;         // MBID from AcoustID lookup
  scannedAt?: string;          // ISO date
};

type Library = {
  version: 1;
  root?: string;
  scannedAt?: string;
  tracks: Track[];
};`;

  const workflow = `1. indexer.ts    →  walk folders · music-metadata · optional Chromaprint
2. Upload library.json here — review, dedupe, fix tags
3. Export the corrected library.json
4. tagger.ts     →  write ID3/Vorbis tags back to files
5. renamer.ts    →  move files to /Artist/Album/NN Title.ext`;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <CodeBlock title="library.json schema" code={schema} />
      <CodeBlock title="workflow" code={workflow} />
    </div>
  );
}

function EmptyState({ onSample, onImport }: { onSample: () => void; onImport: () => void }) {
  return (
    <div className="border border-dashed border-border rounded-lg bg-card/50 p-16 text-center">
      <Disc3 className="h-12 w-12 mx-auto text-primary/40 mb-4" />
      <h2 className="font-serif text-3xl mb-2">Your library is empty.</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        Run your local indexer script and drop the resulting <span className="font-mono text-foreground">library.json</span> here. Or start with a sample dataset.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={onImport}><Upload className="h-4 w-4" /> Import library.json</Button>
        <Button variant="outline" onClick={onSample}><Sparkles className="h-4 w-4" /> Load sample</Button>
      </div>
    </div>
  );
}

function TagEditor({ track, onClose, onSave }: { track: Track | null; onClose: () => void; onSave: (patch: Partial<Track>) => void }) {
  const [form, setForm] = useState<Partial<Track>>({});
  useEffect(() => { setForm(track ?? {}); }, [track]);
  if (!track) return null;
  const preview = proposedPath({ ...track, ...form });
  return (
    <Dialog open={!!track} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Edit tags</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} full />
          <Field label="Artist" value={form.artist} onChange={(v) => setForm({ ...form, artist: v })} />
          <Field label="Album artist" value={form.albumArtist} onChange={(v) => setForm({ ...form, albumArtist: v })} />
          <Field label="Album" value={form.album} onChange={(v) => setForm({ ...form, album: v })} full />
          <Field label="Track #" type="number" value={form.track?.toString()} onChange={(v) => setForm({ ...form, track: v ? Number(v) : undefined })} />
          <Field label="Year" type="number" value={form.year?.toString()} onChange={(v) => setForm({ ...form, year: v ? Number(v) : undefined })} />
          <Field label="Genre" value={form.genre} onChange={(v) => setForm({ ...form, genre: v })} full />
        </div>
        <div className="mt-2 border border-border rounded-md p-3 bg-background">
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Proposed path</div>
          <code className="text-xs font-mono break-all">{preview}</code>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text", full }: { label: string; value?: string; onChange: (v: string) => void; type?: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{label}</Label>
      <Input className="mt-1 bg-background border-border" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
