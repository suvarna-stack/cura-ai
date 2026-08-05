import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BrainCircuit,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  Pencil,
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
import { ConfirmModal, Modal } from '../../../components/ui/Modal'
import {
  apiErrorMessage,
  fetchKnowledgeDocs,
  fetchKnowledgeStats,
  removeKnowledgeDoc,
  renameKnowledgeDoc,
  startTrainingRun,
  syncCodesToSystem,
  testChat,
  testRetrieval,
  uploadKnowledgeDocs,
} from '../api/trainingService'
import type { CodeSyncResult } from '../api/trainingService'
import type {
  ChatAnswer,
  KbDoc,
  KnowledgeStats,
  RetrievalHit,
  TrainingRun,
} from '../types/training.types'
import { formatSize } from '../types/training.types'

const POLL_MS = 2500
const LAST_RUN_KEY = 'medcode:lastTrainingRun'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function loadLastRun(): TrainingRun | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY)
    return raw ? (JSON.parse(raw) as TrainingRun) : null
  } catch {
    return null
  }
}

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
        <AlertTriangle size={11} /> Failed
      </Badge>
    )
  }
  return (
    <Badge variant="success" className="gap-1.5 whitespace-nowrap">
      <CheckCircle2 size={11} /> Indexed
    </Badge>
  )
}

function RenameDocModal({
  doc,
  onRenamed,
  onClose,
}: {
  doc: KbDoc
  onRenamed: () => Promise<unknown> | void
  onClose: () => void
}) {
  const [name, setName] = useState(doc.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = name.trim() !== '' && name.trim() !== doc.name && !saving

  const save = () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    void (async () => {
      try {
        await renameKnowledgeDoc(doc.id, name.trim())
        await onRenamed()
        onClose()
      } catch (err) {
        setError(apiErrorMessage(err, 'Could not rename the document.'))
        setSaving(false)
      }
    })()
  }

  return (
    <Modal title="Rename document" onClose={onClose}>
      <div className="space-y-4">
        <Input
          label="File name"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
        <p className="text-[11px] text-muted">
          Display name only — the indexed chunks are untouched. The file
          extension is kept automatically.
        </p>
        {error && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-error">
            <AlertTriangle size={12} className="mt-[1px] shrink-0" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={save}>
            {saving ? 'Renaming…' : 'Rename'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function TrainingPage() {
  useDocumentTitle("AI Training")
  const [docs, setDocs] = useState<KbDoc[]>([])
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [ragError, setRagError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<TrainingRun | null>(loadLastRun)

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<KbDoc | null>(null)
  const [renaming, setRenaming] = useState<KbDoc | null>(null)

  const [training, setTraining] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const [syncingCodes, setSyncingCodes] = useState(false)
  const [codeSync, setCodeSync] = useState<CodeSyncResult | null>(null)
  const [codeSyncError, setCodeSyncError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hits, setHits] = useState<RetrievalHit[] | null>(null)
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState<ChatAnswer | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const logEnd = useRef<HTMLDivElement>(null)
  const prevStatus = useRef<Map<string, KbDoc['status']>>(new Map())
  const trainStart = useRef(0)
  const sawTrainingBusy = useRef(false)

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [log])

  /** Pull live docs + stats from the API; logs per-document transitions. */
  const refresh = useCallback(async () => {
    const [nextDocs, nextStats] = await Promise.all([
      fetchKnowledgeDocs(),
      fetchKnowledgeStats(),
    ])
    setRagError(null)
    setStats(nextStats)
    setDocs(nextDocs)

    for (const d of nextDocs) {
      const prev = prevStatus.current.get(d.id)
      if (prev && prev !== d.status) {
        if (d.status === 'indexed') {
          setLog((l) => [
            ...l,
            `✓ ${d.name} — ${d.chunks.toLocaleString()} chunks indexed`,
          ])
        } else if (d.status === 'failed') {
          setLog((l) => [...l, `✗ ${d.name} — ${d.error ?? 'ingest failed'}`])
        }
      }
      prevStatus.current.set(d.id, d.status)
    }
    return nextDocs
  }, [])

  useEffect(() => {
    void refresh().catch((err) => {
      setRagError(
        apiErrorMessage(err, 'Could not reach the AI training service.'),
      )
    })
  }, [refresh])

  const indexed = docs.filter((d) => d.status === 'indexed')
  const totalChunks = indexed.reduce((s, d) => s + d.chunks, 0)
  const busy = docs.some(
    (d) => d.status === 'processing' || d.status === 'queued',
  )
  const hasIndex = (stats?.chunksInIndex ?? 0) > 0

  // Poll while anything is ingesting (uploads index themselves) or training.
  useEffect(() => {
    if (!busy && !training && !uploading) return
    const id = window.setInterval(() => {
      void refresh().catch(() => {
        /* transient — next tick retries */
      })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [busy, training, uploading, refresh])

  // Detect the end of a training run: the rebuild flips every doc to
  // queued/processing first, so wait until we've seen it busy at least once
  // (with a timeout escape in case the rebuild finished between two polls).
  useEffect(() => {
    if (!training) return
    if (busy) {
      sawTrainingBusy.current = true
      return
    }
    const elapsed = Date.now() - trainStart.current
    if (!sawTrainingBusy.current && elapsed < 15_000) return

    const run: TrainingRun = {
      finishedAt: new Date().toISOString(),
      docCount: indexed.length,
      chunkCount: totalChunks,
      model: stats?.embedModel ?? 'unknown',
      durationMs: elapsed,
    }
    setLastRun(run)
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run))
    setTraining(false)
    setLog((l) => [
      ...l,
      `✓ Index rebuilt — ${indexed.length} documents, ${totalChunks.toLocaleString()} chunks in ${(elapsed / 1000).toFixed(1)}s`,
    ])
  }, [training, busy, indexed.length, totalChunks, stats])

  // Overall progress during a run = mean per-document ingest progress.
  const trainProgress = training
    ? docs.length
      ? Math.round(
          docs.reduce(
            (s, d) => s + (d.status === 'indexed' ? 100 : d.progress),
            0,
          ) / docs.length,
        )
      : 0
    : 100

  const addFiles = (files: FileList | null) => {
    if (!files?.length || uploading) return
    const fileList = Array.from(files)
    const isAccepted = (f: File) => {
      const name = f.name.toLowerCase()
      return (
        f.type === 'application/pdf' ||
        f.type === 'text/csv' ||
        name.endsWith('.pdf') ||
        name.endsWith('.csv')
      )
    }
    const rejected = fileList.find((f) => !isAccepted(f))
    if (rejected) {
      setUploadError(
        `"${rejected.name}" is not a PDF or CSV — only PDF and CSV files are accepted.`,
      )
      return
    }
    setUploadError(null)
    setUploading(true)
    void (async () => {
      try {
        await uploadKnowledgeDocs(fileList)
        await refresh()
      } catch (err) {
        setUploadError(apiErrorMessage(err, 'Upload failed.'))
      } finally {
        setUploading(false)
      }
    })()
  }

  const startTraining = () => {
    if (training || busy || !docs.length) return
    setTraining(true)
    trainStart.current = Date.now()
    sawTrainingBusy.current = false
    setLog([
      `▸ Rebuild started — re-embedding ${docs.length} document${docs.length === 1 ? '' : 's'}`,
    ])
    void (async () => {
      try {
        await startTrainingRun()
        await refresh()
      } catch (err) {
        setTraining(false)
        setLog((l) => [
          ...l,
          `✗ ${apiErrorMessage(err, 'Could not start the training run.')}`,
        ])
      }
    })()
  }

  const runCodeSync = () => {
    if (syncingCodes) return
    setSyncingCodes(true)
    setCodeSyncError(null)
    void (async () => {
      try {
        setCodeSync(await syncCodesToSystem())
      } catch (err) {
        setCodeSync(null)
        setCodeSyncError(
          apiErrorMessage(err, 'Could not sync codes to the system database.'),
        )
      } finally {
        setSyncingCodes(false)
      }
    })()
  }

  const runSearch = () => {
    if (!query.trim() || searching) return
    setSearching(true)
    setSearchError(null)
    setAnswer(null)
    void (async () => {
      try {
        setHits(await testRetrieval(query))
      } catch (err) {
        setHits(null)
        setSearchError(apiErrorMessage(err, 'Retrieval failed.'))
      } finally {
        setSearching(false)
      }
    })()
  }

  const runAnswer = () => {
    if (!query.trim() || answering) return
    setAnswering(true)
    setSearchError(null)
    void (async () => {
      try {
        setAnswer(await testChat(query))
      } catch (err) {
        setSearchError(apiErrorMessage(err, 'The AI answer failed.'))
      } finally {
        setAnswering(false)
      }
    })()
  }

  const tiles = [
    {
      label: 'Documents indexed',
      value: String(stats?.documentsIndexed ?? indexed.length),
      icon: FileText,
    },
    {
      label: 'Chunks in index',
      value: (stats?.chunksInIndex ?? totalChunks).toLocaleString(),
      icon: ListTree,
    },
  ]

  return (
    <>
      <h1 className="mb-1 text-[19px] font-bold text-text">AI Training</h1>
      <p className="mb-6 text-[12px] text-muted">
        Upload the coding references the AI retrieves from (RAG). Documents
        index themselves on upload; retrain to rebuild the whole vector index.
      </p>

      {ragError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-[12px] font-semibold text-error">
          <AlertTriangle size={14} className="mt-[1px] shrink-0" />
          {ragError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} padded={false} className="p-5 shadow-none">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/15">
              <t.icon size={16} className="text-primary" />
            </div>
            <p className="text-[19px] leading-tight font-bold break-words text-text">
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
          {/* click/drag on the zone is a mouse convenience; the sr-only file
              input inside is the keyboard/screen-reader path */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
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
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors focus-within:border-primary focus-within:bg-primary/5 ${
              dragging
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/60 hover:bg-primary/5'
            }`}
          >
            {uploading ? (
              <RefreshCw
                size={26}
                className="mx-auto mb-2 animate-spin text-primary"
              />
            ) : (
              <CloudUpload size={26} className="mx-auto mb-2 text-primary" />
            )}
            <p role="status" className="text-[13px] font-semibold text-text">
              {uploading
                ? 'Uploading…'
                : 'Drop PDFs or CSVs here, or click to browse'}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Coding guidelines, grouper handbooks, hospital SOPs, code lists —
              PDF or CSV
            </p>
            {/* sr-only (not display:none) keeps the input focusable — Tab to it,
                Enter/Space opens the OS picker; the visual dropzone is decoration */}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,text/csv,.csv"
              multiple
              aria-label="Upload PDF documents"
              className="sr-only"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {uploadError && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12px] font-semibold text-error">
              <AlertTriangle size={12} className="mt-[1px] shrink-0" />
              {uploadError}
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Knowledge-base documents</caption>
              <thead>
                <tr className="border-b border-border text-[12px] tracking-wide text-muted uppercase">
                  {['Document', 'Size', 'Pages', 'Chunks', 'Status', 'Actions'].map(
                    (h, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-2 py-2.5 font-semibold whitespace-nowrap"
                      >
                        {/* the actions column header is visually blank by design */}
                        {h === 'Actions' ? <span className="sr-only">{h}</span> : h}
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
                        {d.name.toLowerCase().endsWith('.csv') ? (
                          <FileSpreadsheet
                            size={13}
                            className="shrink-0 text-muted"
                          />
                        ) : (
                          <FileText
                            size={13}
                            className="shrink-0 text-muted"
                          />
                        )}
                        <div className="min-w-0">
                          <p
                            className="max-w-[19rem] truncate text-[13px] font-semibold text-text"
                            title={d.name}
                          >
                            {d.name}
                          </p>
                          <p className="text-[12px] text-muted">
                            {d.uploadedAt ? fmtDate(d.uploadedAt) : '—'}
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
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Rename document"
                          onClick={() => setRenaming(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title="Remove from knowledge base"
                          onClick={() => setDeleting(d)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
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
          <p className="mb-4 text-[12px] text-muted">
            Re-embeds every document and rebuilds the vector index the coding
            AI queries. Uploads already index themselves — retrain after
            removing documents or changing models.
          </p>

          <Button
            onClick={startTraining}
            disabled={training || busy || uploading || !docs.length}
            fullWidth
          >
            {training ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Training…{' '}
                {trainProgress}%
              </>
            ) : (
              <>
                <Play size={14} /> {lastRun ? 'Retrain index' : 'Train AI'}
              </>
            )}
          </Button>
          {busy && !training && (
            <p className="mt-2 text-[12px] text-muted">
              Waiting for uploads to finish ingesting…
            </p>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-[12px] text-muted">
              Extract ICD codes + titles from uploaded documents into{' '}
              <code>icd_codes</code>. Existing descriptions are never
              overwritten.
            </p>
            <Button
              variant="secondary"
              onClick={runCodeSync}
              disabled={syncingCodes || !docs.length}
              fullWidth
            >
              {syncingCodes ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Syncing
                  codes…
                </>
              ) : (
                <>
                  <Database size={14} /> Sync codes to system DB
                </>
              )}
            </Button>
            {!docs.length && (
              <p className="mt-2 text-[12px] text-muted">
                Upload at least one PDF first.
              </p>
            )}
            {codeSync && (
              <p className="mt-2 text-[12px] font-semibold text-success">
                {codeSync.extracted.toLocaleString()} codes found —{' '}
                {codeSync.added.toLocaleString()} added,{' '}
                {codeSync.descriptionsFilled.toLocaleString()} descriptions
                filled, {codeSync.unchanged.toLocaleString()} already present.
              </p>
            )}
            {codeSyncError && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] font-semibold text-error">
                <AlertTriangle size={12} className="mt-[1px] shrink-0" />
                {codeSyncError}
              </p>
            )}
          </div>

          {(training || log.length > 0) && (
            <>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full border border-border bg-bg">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${training ? trainProgress : 100}%` }}
                />
              </div>
              <div className="mt-3 max-h-52 min-h-[7rem] flex-1 overflow-y-auto rounded-lg bg-text/95 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-success">
                {log.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {training && <p className="animate-pulse">▸ working…</p>}
                <div ref={logEnd} />
              </div>
            </>
          )}

          {lastRun && !training && (
            <p className="mt-3 text-[12px] text-muted">
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
        <p className="mb-4 text-[12px] text-muted">
          Ask what a coder would ask and see which chunks the index hands the
          AI. Optionally generate a full AI answer from those chunks.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            runSearch()
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. how to sequence the principal diagnosis for an OPD visit"
          />
          <Button
            type="submit"
            disabled={!query.trim() || !hasIndex || searching}
            className="shrink-0 whitespace-nowrap"
          >
            {searching ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              'Search'
            )}
          </Button>
        </form>
        {!hasIndex && (
          <p className="mt-2 text-[12px] text-muted">
            Upload and index at least one document before testing retrieval.
          </p>
        )}
        {searchError && (
          <p className="mt-3 flex items-start gap-1.5 text-[12px] font-semibold text-error">
            <AlertTriangle size={13} className="mt-[1px] shrink-0" />
            {searchError}
          </p>
        )}
        {hits && hits.length === 0 && (
          <p className="mt-4 text-[12px] text-muted">
            No chunks matched — try rephrasing the question.
          </p>
        )}
        {hits && hits.length > 0 && (
          <>
            <div className="mt-4 space-y-2">
              {hits.map((h, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-bg px-4 py-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="truncate text-[12px] font-bold text-text">
                      {h.docName}
                      {h.page != null && (
                        <span className="font-semibold text-muted">
                          {' '}
                          · p.{h.page}
                        </span>
                      )}
                      <span className="ml-2 font-medium text-muted">
                        {h.via}
                      </span>
                    </p>
                    <span className="text-[12px] font-bold whitespace-nowrap text-primary">
                      {h.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed whitespace-pre-line text-muted">
                    {h.snippet}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={runAnswer}
                disabled={answering}
              >
                {answering ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />{' '}
                    Generating… (the local model is slow)
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Generate AI answer
                  </>
                )}
              </Button>
            </div>
            {answer && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-primary">
                  <Sparkles size={13} /> AI answer{' '}
                  <span className="font-medium text-muted">
                    ({answer.mode} retrieval)
                  </span>
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-line text-text">
                  {answer.answer}
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {deleting && (
        <ConfirmModal
          title="Remove document"
          message={`Remove "${deleting.name}" from the knowledge base? Its chunks are deleted from the index immediately.`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            const doc = deleting
            setDeleting(null)
            void (async () => {
              try {
                await removeKnowledgeDoc(doc.id)
                prevStatus.current.delete(doc.id)
                await refresh()
              } catch (err) {
                setUploadError(
                  apiErrorMessage(err, `Could not remove "${doc.name}".`),
                )
              }
            })()
          }}
          onClose={() => setDeleting(null)}
        />
      )}

      {renaming && (
        <RenameDocModal
          doc={renaming}
          onRenamed={refresh}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  )
}
