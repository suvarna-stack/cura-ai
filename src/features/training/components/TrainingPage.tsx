import { useEffect, useRef, useState } from 'react'
import {
  BrainCircuit,
  CloudUpload,
  FileText,
  Trash2,
  Play,
  Database,
  Search,
  Sparkles,
  RefreshCw,
  ListTree,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { ConfirmModal } from '../../../components/ui/Modal'
import {
  fetchKnowledgeDocs,
  fetchLastTrainingRun,
  removeKnowledgeDoc,
  startTrainingRun,
  testRetrieval,
  uploadKnowledgeDocs,
} from '../api/trainingService'
import type {
  KbDoc,
  RetrievalHit,
  TrainingRun,
} from '../types/training.types'
import {
  CHUNK_OVERLAP,
  CHUNK_TOKENS,
  EMBED_MODEL,
  SEED_DOCS,
  estimateChunks,
  estimatePages,
  estimateTokens,
  formatSize,
} from '../types/training.types'

const STAGES = [
  'Loading documents from knowledge base',
  'Extracting text (PDF → plain text)',
  `Chunking (${CHUNK_TOKENS} tokens, ${CHUNK_OVERLAP} overlap)`,
  `Generating embeddings (${EMBED_MODEL})`,
  'Building vector index',
  'Validating retrieval on sample queries',
]

const TICK_MS = 90

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function StatusPill({ doc }: { doc: KbDoc }) {
  if (doc.status === 'processing') {
    return (
      <Badge variant="warning" className="gap-1.5 whitespace-nowrap">
        <RefreshCw size={11} className="animate-spin" /> Ingesting{' '}
        {doc.progress}%
      </Badge>
    )
  }
  if (doc.status === 'queued') {
    return (
      <Badge variant="neutral" className="whitespace-nowrap">
        Queued
      </Badge>
    )
  }
  if (doc.status === 'failed') {
    return (
      <Badge
        variant="error"
        title={doc.error}
        className="gap-1.5 whitespace-nowrap"
      >
        <AlertTriangle size={11} /> Rejected
      </Badge>
    )
  }
  return (
    <Badge variant="success" className="gap-1.5 whitespace-nowrap">
      <CheckCircle2 size={11} /> Indexed
    </Badge>
  )
}

/** Local deterministic retrieval stand-in until the API is wired. */
function simulateRetrieve(query: string, docs: KbDoc[], k = 3): RetrievalHit[] {
  const indexed = docs.filter((d) => d.status === 'indexed')
  if (!indexed.length || !query.trim()) return []

  let h = 0
  const normalized = query.trim().toLowerCase()
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) | 0
  }
  h = Math.abs(h)

  const snippets = [
    `Assign the code that most specifically describes the documented condition. When the record supports only a symptom, code the symptom — do not infer the underlying diagnosis. (matched on "${query.trim()}")`,
    `The principal diagnosis is the condition established after study to be chiefly responsible for the visit. It is listed first; sequencing is what the grouper reads. (matched on "${query.trim()}")`,
    `Where a procedure is performed, the ICD-9-CM code is recorded in addition to — never instead of — the diagnosis code. (matched on "${query.trim()}")`,
  ]

  return Array.from({ length: Math.min(k, indexed.length) }, (_, i) => {
    const doc = indexed[(h + i * 3) % indexed.length]
    return {
      docName: doc.name,
      page: 1 + ((h >> (i + 1)) % doc.pages),
      score: Number((0.93 - i * 0.07 - ((h >> i) % 4) / 100).toFixed(2)),
      snippet: snippets[i % snippets.length],
    }
  })
}

export function TrainingPage() {
  const [docs, setDocs] = useState<KbDoc[]>(SEED_DOCS)
  const [lastRun, setLastRun] = useState<TrainingRun | null>(null)
  const [dragging, setDragging] = useState(false)
  const [deleting, setDeleting] = useState<KbDoc | null>(null)

  const [training, setTraining] = useState(false)
  const [stage, setStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState<string[]>([])

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<RetrievalHit[] | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])
  const logEnd = useRef<HTMLDivElement>(null)

  useEffect(() => () => {
    timers.current.forEach(clearInterval)
  }, [])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [log])

  useEffect(() => {
    void (async () => {
      try {
        const [nextDocs, nextRun] = await Promise.all([
          fetchKnowledgeDocs(),
          fetchLastTrainingRun(),
        ])
        if (nextDocs.length > 0) setDocs(nextDocs)
        setLastRun(nextRun)
      } catch {
        // keep seed UI
      }
    })()
  }, [])

  const indexed = docs.filter((d) => d.status === 'indexed')
  const totalChunks = indexed.reduce((s, d) => s + d.chunks, 0)
  const busy = docs.some(
    (d) => d.status === 'processing' || d.status === 'queued',
  )
  const stale = lastRun ? lastRun.chunkCount !== totalChunks : indexed.length > 0

  const ingest = (doc: KbDoc) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: 'processing' } : d)),
    )
    const id = window.setInterval(() => {
      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== doc.id || d.status !== 'processing') return d
          const nextProgress = Math.min(100, d.progress + 8)
          if (nextProgress >= 100) {
            clearInterval(id)
            return { ...d, progress: 100, status: 'indexed' }
          }
          return { ...d, progress: nextProgress }
        }),
      )
    }, 190)
    timers.current.push(id)
  }

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const fileList = Array.from(files)
    void uploadKnowledgeDocs(fileList).catch(() => {
      /* placeholder — local UI ingest continues */
    })

    const incoming: KbDoc[] = fileList.map((f, i) => {
      const isPdf =
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      return {
        id: `k${Date.now()}${i}`,
        name: f.name,
        sizeBytes: f.size,
        pages: isPdf ? estimatePages(f.size) : 0,
        chunks: isPdf ? estimateChunks(f.size) : 0,
        status: isPdf ? 'queued' : 'failed',
        progress: 0,
        uploadedAt: new Date().toISOString(),
        error: isPdf
          ? undefined
          : 'Not a PDF — the ingester only accepts PDF files.',
      }
    })
    setDocs((prev) => [...prev, ...incoming])
    incoming.filter((d) => d.status === 'queued').forEach(ingest)
  }

  const startTraining = () => {
    if (training || !indexed.length) return
    void startTrainingRun().catch(() => {
      /* placeholder — local UI simulation continues */
    })

    setTraining(true)
    setStage(0)
    setProgress(0)
    setLog([
      `▸ Training run started — ${indexed.length} documents, ${totalChunks.toLocaleString()} chunks`,
    ])
    let tick = 0

    const id = window.setInterval(() => {
      tick += 1
      const pct = Math.min(100, tick * 2)
      setProgress(pct)
      const next = Math.min(
        STAGES.length - 1,
        Math.floor((pct / 100) * STAGES.length),
      )
      setStage((cur) => {
        if (next > cur) {
          setLog((l) => [...l, `✓ ${STAGES[cur]}`, `▸ ${STAGES[next]}`])
        }
        return next
      })
      if (pct >= 100) {
        clearInterval(id)
        setLog((l) => [
          ...l,
          `✓ ${STAGES[STAGES.length - 1]}`,
          `✓ Index rebuilt — ${totalChunks.toLocaleString()} vectors, ${estimateTokens(totalChunks).toLocaleString()} tokens embedded`,
        ])
        const run: TrainingRun = {
          finishedAt: new Date().toISOString(),
          docCount: indexed.length,
          chunkCount: totalChunks,
          model: EMBED_MODEL,
          durationMs: tick * TICK_MS,
        }
        setLastRun(run)
        setTraining(false)
      }
    }, TICK_MS)
    timers.current.push(id)
  }

  const tiles = [
    { label: 'Documents indexed', value: String(indexed.length), icon: FileText },
    {
      label: 'Chunks in index',
      value: totalChunks.toLocaleString(),
      icon: ListTree,
    },
    { label: 'Embedding model', value: EMBED_MODEL, icon: Sparkles, small: true },
    {
      label: 'Last trained',
      value: lastRun ? fmtDate(lastRun.finishedAt) : 'Never',
      icon: Database,
      small: true,
    },
  ]

  return (
    <>
      <h1 className="mb-1 text-[19px] font-bold text-text">AI Training</h1>
      <p className="mb-6 text-[12px] text-muted">
        Upload the coding references the AI retrieves from (RAG), then rebuild
        the vector index. Everything on this page is a prototype — no model is
        called yet.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} padded={false} className="p-5 shadow-none">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/15">
              <t.icon size={16} className="text-primary" />
            </div>
            <p
              className={`${t.small ? 'text-[13px]' : 'text-[19px]'} leading-tight font-bold break-words text-text`}
            >
              {t.value}
            </p>
            <p className="mt-1 text-[12px] text-muted">{t.label}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card padded={false} className="p-5 shadow-none lg:col-span-2">
          <h2 className="mb-3 text-[14px] font-bold text-text">
            Knowledge base
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
              dragging
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/60 hover:bg-primary/5'
            }`}
          >
            <CloudUpload size={26} className="mx-auto mb-2 text-primary" />
            <p className="text-[13px] font-semibold text-text">
              Drop PDFs here, or click to browse
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Coding guidelines, grouper handbooks, hospital SOPs — PDF only
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] tracking-wide text-muted uppercase">
                  {['Document', 'Size', 'Pages', 'Chunks', 'Status', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-2 py-2.5 font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-2 py-6 text-center text-[12px] text-muted"
                    >
                      No documents yet — the AI has nothing to retrieve from.
                    </td>
                  </tr>
                )}
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-border/60 align-middle last:border-0"
                  >
                    <td className="px-2 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText
                          size={13}
                          className="shrink-0 text-muted"
                        />
                        <div className="min-w-0">
                          <p
                            className="max-w-[19rem] truncate text-[13px] font-semibold text-text"
                            title={d.name}
                          >
                            {d.name}
                          </p>
                          <p className="text-[11px] text-muted">
                            {fmtDate(d.uploadedAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] whitespace-nowrap text-muted">
                      {formatSize(d.sizeBytes)}
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-muted">
                      {d.pages || '—'}
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-muted">
                      {d.chunks || '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusPill doc={d} />
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        title="Remove from knowledge base"
                        onClick={() => setDeleting(d)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padded={false} className="flex flex-col p-5 shadow-none">
          <h2 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-text">
            <BrainCircuit size={15} className="text-primary" /> Train
          </h2>
          <p className="mb-4 text-[11px] text-muted">
            Re-embeds every indexed document and rebuilds the vector index the
            coding AI queries.
          </p>

          {stale && !training && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] font-semibold text-warning">
              Knowledge base changed since the last run — retrain to pick it up.
            </div>
          )}

          <Button
            onClick={startTraining}
            disabled={training || busy || !indexed.length}
            fullWidth
          >
            {training ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Training…{' '}
                {progress}%
              </>
            ) : (
              <>
                <Play size={14} /> {lastRun ? 'Retrain index' : 'Train AI'}
              </>
            )}
          </Button>
          {busy && !training && (
            <p className="mt-2 text-[11px] text-muted">
              Waiting for uploads to finish ingesting…
            </p>
          )}

          {(training || log.length > 0) && (
            <>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full border border-border bg-bg">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {STAGES.map((s, i) => (
                  <li
                    key={s}
                    className={`flex items-start gap-2 text-[11px] ${
                      i < stage || (!training && progress >= 100)
                        ? 'font-semibold text-text'
                        : i === stage && training
                          ? 'font-semibold text-primary'
                          : 'text-muted'
                    }`}
                  >
                    {i < stage || (!training && progress >= 100) ? (
                      <CheckCircle2
                        size={12}
                        className="mt-[1px] shrink-0 text-success"
                      />
                    ) : i === stage && training ? (
                      <RefreshCw
                        size={12}
                        className="mt-[1px] shrink-0 animate-spin"
                      />
                    ) : (
                      <span className="mt-[1px] h-3 w-3 shrink-0 rounded-full border border-border" />
                    )}
                    {s}
                  </li>
                ))}
              </ul>
              <div className="mt-3 max-h-40 min-h-[7rem] flex-1 overflow-y-auto rounded-lg bg-text/95 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-success">
                {log.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                <div ref={logEnd} />
              </div>
            </>
          )}

          {lastRun && !training && (
            <p className="mt-3 text-[11px] text-muted">
              Last run {fmtDate(lastRun.finishedAt)} — {lastRun.docCount} docs,{' '}
              {lastRun.chunkCount.toLocaleString()} chunks in{' '}
              {(lastRun.durationMs / 1000).toFixed(1)}s.
            </p>
          )}
        </Card>
      </div>

      <Card padded={false} className="p-5 shadow-none">
        <h2 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-text">
          <Search size={15} className="text-primary" /> Test retrieval
        </h2>
        <p className="mb-4 text-[11px] text-muted">
          Ask what a coder would ask and see which chunks the index would hand
          the AI. Simulated results.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void testRetrieval(query).catch(() => {
              /* placeholder */
            })
            setHits(simulateRetrieve(query, docs))
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. how to sequence the principal diagnosis for an OPD visit"
          />
          <Button
            type="submit"
            disabled={!query.trim() || !lastRun}
            className="shrink-0 whitespace-nowrap"
          >
            Search
          </Button>
        </form>
        {!lastRun && (
          <p className="mt-2 text-[11px] text-muted">
            Train the index once before testing retrieval.
          </p>
        )}
        {hits && hits.length === 0 && (
          <p className="mt-4 text-[12px] text-muted">
            No chunks matched — the index is empty.
          </p>
        )}
        {hits && hits.length > 0 && (
          <div className="mt-4 space-y-2">
            {hits.map((h, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-bg px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="truncate text-[12px] font-bold text-text">
                    {h.docName}{' '}
                    <span className="font-semibold text-muted">
                      · p.{h.page}
                    </span>
                  </p>
                  <span className="text-[11px] font-bold whitespace-nowrap text-primary">
                    {h.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-muted">
                  {h.snippet}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {deleting && (
        <ConfirmModal
          title="Remove document"
          message={`Remove "${deleting.name}" from the knowledge base? Its chunks leave the index at the next training run.`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            setDocs((prev) => prev.filter((d) => d.id !== deleting.id))
            void removeKnowledgeDoc(deleting.id).catch(() => {
              /* placeholder */
            })
            setDeleting(null)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
