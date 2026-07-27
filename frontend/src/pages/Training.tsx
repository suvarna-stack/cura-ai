// ============================================================
// AI Training — LIVE version of the prototype page.
//
// Everything on this screen talks to the FastAPI Graph RAG
// backend: uploads really ingest (chunk -> embed -> graph),
// the table polls real status, and the retrieval test runs the
// actual bge-m3 + Qwen pipeline with graph or plain retrieval.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrainCircuit, CloudUpload, FileText, Trash2, Play, Search, Sparkles,
  RefreshCw, ListTree, CheckCircle2, AlertTriangle, Share2, WifiOff,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { ConfirmModal } from "../components/Modal";
import { api, formatDate, formatSize } from "../api";
import type { ChatResponse, DocumentInfo, Stats } from "../api";

const cardCls = "rounded-xl bg-admin-card border border-admin-border";
const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-admin-bg border border-admin-border text-[13px] text-admin-text outline-none focus:border-admin-accent transition-colors";

// ---- status pill ------------------------------------------------------------

function StatusPill({ doc }: { doc: DocumentInfo }) {
  if (doc.status === "processing")
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 whitespace-nowrap">
        <RefreshCw size={11} className="animate-spin" /> Ingesting {doc.progress}%
      </span>
    );
  if (doc.status === "queued")
    return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-admin-muted whitespace-nowrap">Queued</span>;
  if (doc.status === "failed")
    return (
      <span title={doc.error ?? undefined} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-700 whitespace-nowrap">
        <AlertTriangle size={11} /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 whitespace-nowrap">
      <CheckCircle2 size={11} /> Indexed
    </span>
  );
}

// ---- page -------------------------------------------------------------------

export default function Training() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [offline, setOffline] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocumentInfo | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  // retrieval test
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"graph" | "plain">("graph");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  // ---- data refresh ---------------------------------------------------------

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api.stats(), api.documents()]);
      setStats(s);
      setDocs(d);
      setOffline(false);
      return d;
    } catch {
      setOffline(true);
      return [];
    }
  }, []);

  // Poll fast while anything is ingesting, slowly otherwise.
  useEffect(() => {
    let timer: number;
    let cancelled = false;
    const tick = async () => {
      const d = await refresh();
      if (cancelled) return;
      const busy = d.some((x) => x.status === "processing" || x.status === "queued");
      timer = window.setTimeout(tick, busy ? 2000 : 8000);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh]);

  const busy = docs.some((d) => d.status === "processing" || d.status === "queued");

  // ---- upload ---------------------------------------------------------------

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    for (const f of Array.from(files)) {
      try {
        await api.upload(f);
      } catch (e) {
        // e.g. the scanned-PDF rejection from the backend
        setUploadError(`${f.name}: ${(e as Error).message}`);
      }
    }
    refresh();
  };

  // ---- rebuild --------------------------------------------------------------

  const startRebuild = async () => {
    setRebuilding(true);
    try {
      await api.rebuild();
      await refresh();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setRebuilding(false);
    }
  };

  // ---- retrieval test -------------------------------------------------------

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || asking) return;
    setAsking(true);
    setAskError(null);
    setResult(null);
    try {
      setResult(await api.chat(query.trim(), mode));
    } catch (err) {
      setAskError((err as Error).message);
    } finally {
      setAsking(false);
    }
  };

  // ---- tiles ----------------------------------------------------------------

  const tiles = [
    { label: "Documents indexed", value: stats ? String(stats.documents_indexed) : "…", icon: FileText },
    { label: "Chunks in index", value: stats ? stats.chunks_in_index.toLocaleString() : "…", icon: ListTree },
    { label: "Embedding model", value: stats ? stats.embed_model.split("/").pop()! : "…", icon: Sparkles, small: true },
    {
      label: "Knowledge graph",
      value: stats ? `${stats.graph.nodes_total.toLocaleString()} nodes · ${stats.graph.edges_total.toLocaleString()} edges` : "…",
      icon: Share2,
      small: true,
    },
  ];

  return (
    <AdminLayout>
      <h1 className="text-[19px] font-bold mb-1">AI Training</h1>
      <p className="text-[12px] text-admin-muted mb-6">
        Upload the coding references the AI retrieves from (Graph RAG). Each upload is chunked,
        embedded and added to the knowledge graph automatically — this page shows the real index.
      </p>

      {offline && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-[12px] text-red-700 font-semibold">
          <WifiOff size={14} /> Cannot reach the backend — start it with:&nbsp;
          <code className="font-mono">python run.py</code>&nbsp;(port 8000)
        </div>
      )}

      {/* stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map((t) => (
          <div key={t.label} className={`${cardCls} p-5`}>
            <div className="w-9 h-9 rounded-lg bg-admin-accent/15 border border-admin-accent/30 flex items-center justify-center mb-3">
              <t.icon size={16} className="text-admin-accent" />
            </div>
            <p className={`${t.small ? "text-[13px]" : "text-[19px]"} font-bold leading-tight break-words`}>{t.value}</p>
            <p className="text-[12px] text-admin-muted mt-1">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* ---- upload + table ---- */}
        <div className={`${cardCls} lg:col-span-2 p-5`}>
          <h2 className="text-[14px] font-bold mb-3">Knowledge base</h2>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={`rounded-xl border-2 border-dashed px-6 py-9 text-center cursor-pointer transition-colors ${
              dragging ? "border-admin-accent bg-admin-accent/10" : "border-admin-border hover:border-admin-accent/60 hover:bg-admin-accent/5"
            }`}>
            <CloudUpload size={26} className="text-admin-accent mx-auto mb-2" />
            <p className="text-[13px] font-semibold">Drop PDFs here, or click to browse</p>
            <p className="text-[11px] text-admin-muted mt-1">
              Coding guidelines, grouper handbooks, hospital SOPs — text PDFs only (scanned PDFs are rejected)
            </p>
            <input ref={fileInput} type="file" accept="application/pdf" multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {uploadError && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-700 font-semibold">
              {uploadError}
            </div>
          )}

          {/* document table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-admin-muted border-b border-admin-border">
                  {["Document", "Size", "Pages", "Chunks", "Status", ""].map((h, i) => (
                    <th key={i} className="px-2 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-[12px] text-admin-muted">
                    No documents yet — the AI has nothing to retrieve from.
                  </td></tr>
                )}
                {docs.map((d) => (
                  <tr key={d.source} className="border-b border-admin-border/60 last:border-0 align-middle">
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className="text-admin-muted shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate max-w-[19rem]" title={d.filename}>{d.filename || d.source}</p>
                          <p className="text-[11px] text-admin-muted">{formatDate(d.uploaded_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-admin-muted whitespace-nowrap">{formatSize(d.size_bytes)}</td>
                    <td className="px-2 py-2.5 text-[12px] text-admin-muted">{d.pages || "—"}</td>
                    <td className="px-2 py-2.5 text-[12px] text-admin-muted">{d.chunks || "—"}</td>
                    <td className="px-2 py-2.5"><StatusPill doc={d} /></td>
                    <td className="px-2 py-2.5">
                      <button title="Remove from knowledge base" onClick={() => setDeleting(d)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-admin-accent hover:bg-admin-accent/15 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- rebuild panel ---- */}
        <div className={`${cardCls} p-5 flex flex-col`}>
          <h2 className="text-[14px] font-bold mb-1 flex items-center gap-2">
            <BrainCircuit size={15} className="text-admin-accent" /> Rebuild index
          </h2>
          <p className="text-[11px] text-admin-muted mb-4">
            Uploads index themselves — no training button needed. Rebuild only after changing
            the embedding model or chunk settings: it wipes the vector index and knowledge
            graph, then re-ingests every stored PDF from scratch.
          </p>

          <button onClick={startRebuild} disabled={rebuilding || busy || docs.length === 0}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-admin-accent text-white text-[13px] font-bold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:hover:bg-admin-accent">
            {busy
              ? <><RefreshCw size={14} className="animate-spin" /> Ingesting…</>
              : <><Play size={14} /> Rebuild index</>}
          </button>
          {busy && (
            <p className="text-[11px] text-admin-muted mt-2">
              Embedding runs on the CPU — large manuals take a while. The page updates itself.
            </p>
          )}

          {stats && stats.graph.nodes_total > 0 && (
            <div className="mt-4 rounded-lg bg-admin-bg border border-admin-border px-3 py-2.5">
              <p className="text-[11px] font-bold mb-1.5">Graph contents</p>
              {Object.entries(stats.graph.nodes).map(([kind, n]) => (
                <p key={kind} className="text-[11px] text-admin-muted flex justify-between">
                  <span>{kind}</span><span className="font-semibold">{n.toLocaleString()}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- retrieval test ---- */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="text-[14px] font-bold flex items-center gap-2">
            <Search size={15} className="text-admin-accent" /> Test retrieval
          </h2>
          {/* graph / plain toggle */}
          <div className="flex rounded-lg border border-admin-border overflow-hidden">
            {(["graph", "plain"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  mode === m ? "bg-admin-accent text-white" : "bg-admin-card text-admin-muted hover:text-admin-text"
                }`}>
                {m === "graph" ? "Graph RAG" : "Plain RAG"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-admin-muted mb-4">
          Runs the real pipeline: bge-m3 retrieval {mode === "graph" ? "+ knowledge-graph expansion " : ""}
          then Qwen2.5 answers from the retrieved chunks. First question loads the models (~1 min).
        </p>

        <form className="flex gap-2" onSubmit={ask}>
          <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. what is the underlying cause of death?" />
          <button type="submit" disabled={!query.trim() || asking}
            className="px-4 py-2 rounded-lg bg-admin-accent text-white text-[13px] font-bold whitespace-nowrap hover:bg-green-700 transition-colors disabled:opacity-40 disabled:hover:bg-admin-accent">
            {asking ? <RefreshCw size={14} className="animate-spin" /> : "Ask"}
          </button>
        </form>

        {askError && (
          <p className="text-[12px] text-red-700 font-semibold mt-3">{askError}</p>
        )}
        {asking && (
          <p className="text-[12px] text-admin-muted mt-3">
            Retrieving and generating on the CPU — this can take up to a minute…
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-admin-accent/5 border border-admin-accent/30 px-4 py-3">
              <p className="text-[11px] font-bold text-admin-accent mb-1 uppercase tracking-wide">
                Answer ({result.mode} mode)
              </p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>
            <div className="space-y-2">
              {result.contexts.map((h, i) => (
                <div key={i} className="rounded-lg bg-admin-bg border border-admin-border px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-[12px] font-bold truncate">
                      {h.source}
                      {typeof h.metadata.page === "number" && (
                        <span className="text-admin-muted font-semibold"> · p.{h.metadata.page}</span>
                      )}
                    </p>
                    <span className="text-[11px] font-bold text-admin-accent whitespace-nowrap">{h.score.toFixed(3)}</span>
                  </div>
                  <p className="text-[11px] text-admin-muted mb-1.5 italic">via {h.via}</p>
                  <p className="text-[12px] text-admin-muted leading-relaxed">{h.text.slice(0, 300)}{h.text.length > 300 ? "…" : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {deleting && (
        <ConfirmModal
          title="Remove document"
          message={`Remove "${deleting.filename || deleting.source}" from the knowledge base? Its chunks leave the vector index and the knowledge graph immediately.`}
          confirmLabel="Remove"
          onConfirm={async () => {
            try { await api.deleteDocument(deleting.source); } catch { /* refresh shows truth */ }
            setDeleting(null);
            refresh();
          }}
          onClose={() => setDeleting(null)} />
      )}
    </AdminLayout>
  );
}
