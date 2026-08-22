import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  BrainCircuit,
  CloudUpload,
  GripVertical,
  FileSpreadsheet,
  FileText,
  Pencil,
  Trash2,
  Play,
  Database,
  Search,
  Sparkles,
  RefreshCw,
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
  reorderKnowledgeDocs,
  setKnowledgeDocType,
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
  KbDocType,
  KnowledgeStats,
  RetrievalHit,
  TrainingRun,
} from '../types/training.types'
import { formatSize } from '../types/training.types'

const POLL_MS = 2500
const LAST_RUN_KEY = 'medcode:lastTrainingRun'

/** The two upload boxes — every document is ICD-10 or ICD-9, never untyped.
 *  Mirrors the coder Add Code modal: pick the box, not a dropdown. */
const UPLOAD_BOXES: { type: KbDocType; label: string; hint: string }[] = [
  { type: 'icd10', label: 'ICD-10 references',
    hint: 'Diagnosis code lists & guidelines — PDF or CSV' },
  { type: 'icd9cm', label: 'ICD-9 references',
    hint: 'Procedure code lists & guidelines — PDF or CSV' },
]

/** Per-row box control: the active box is filled, clicking the other moves
 *  the document there (chunks re-tag in place — routing follows immediately). */
function BoxPills({
  doc, disabled, onSet,
}: {
  doc: KbDoc
  disabled: boolean
  onSet: (docType: KbDocType) => void
}) {
  return (
    <div className="flex gap-1">
      {(['icd10', 'icd9cm'] as KbDocType[]).map((type) => {
        const active = doc.docType === type
        const filled = type === 'icd10'
          ? 'bg-primary/15 text-primary border-primary/40'
          : 'bg-info/15 text-info border-info/40'
        return (
          <button
            key={type}
            type="button"
            disabled={disabled || active}
            title={active ? undefined
              : `Move to the ${type === 'icd10' ? 'ICD-10' : 'ICD-9'} box`}
            onClick={() => onSet(type)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-colors disabled:cursor-default ${
              active ? filled
                : 'border-border text-muted opacity-60 hover:opacity-100 disabled:opacity-30'
            }`}
          >
            {type === 'icd10' ? 'ICD-10' : 'ICD-9'}
          </button>
        )
      })}
    </div>
  )
}

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

  // which box is being dragged over / uploaded into (null = neither)
  const [dragging, setDragging] = useState<KbDocType | null>(null)
  const [uploading, setUploading] = useState<KbDocType | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<KbDoc | null>(null)
  const [renaming, setRenaming] = useState<KbDoc | null>(null)
  // row-level mutation (re-tag / reorder) in flight — disables row controls
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  // drag-and-drop reranking: the row being dragged and the row hovered over
  const [drag, setDrag] = useState<{ docType: KbDocType; id: string } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [training, setTraining] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const [syncingCodes, setSyncingCodes] = useState(false)
  // Both buttons below run long and rewrite shared state — the vector index the
  // coding AI queries, and the icd_codes table medcode-api reads. Ask first.
  const [confirmingTrain, setConfirmingTrain] = useState(false)
  const [confirmingCodeSync, setConfirmingCodeSync] = useState(false)
  const [codeSync, setCodeSync] = useState<CodeSyncResult | null>(null)
  const [codeSyncError, setCodeSyncError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hits, setHits] = useState<RetrievalHit[] | null>(null)
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState<ChatAnswer | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  // which box the shared hidden file input is picking for (set on click/focus)
  const pickingFor = useRef<KbDocType>('icd10')
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

  const addFiles = (files: FileList | null, docType: KbDocType) => {
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
    setUploading(docType)
    void (async () => {
      try {
        await uploadKnowledgeDocs(fileList, docType)
        await refresh()
      } catch (err) {
        setUploadError(apiErrorMessage(err, 'Upload failed.'))
      } finally {
        setUploading(null)
      }
    })()
  }

  /** Move a document into a box (tag it / re-tag it); routing follows at once. */
  const retag = (d: KbDoc, docType: KbDocType) => {
    if (mutatingId) return
    setMutatingId(d.id)
    setUploadError(null)
    void (async () => {
      try {
        await setKnowledgeDocType(d.id, docType)
        await refresh()
      } catch (err) {
        setUploadError(apiErrorMessage(err, 'Could not move the document.'))
      } finally {
        setMutatingId(null)
      }
    })()
  }

  /** Drop the dragged document at another row's position (same box only). */
  const reorderTo = (list: KbDoc[], docType: KbDocType, fromId: string, toId: string) => {
    if (fromId === toId || mutatingId) return
    const ids = list.map((d) => d.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from === -1 || to === -1) return
    ids.splice(to, 0, ...ids.splice(from, 1))
    setMutatingId(fromId)
    // optimistic: rewrite ranks locally so the row moves immediately
    setDocs((prev) =>
      prev.map((d) => {
        const r = ids.indexOf(d.id)
        return r === -1 ? d : { ...d, rank: r + 1 }
      }),
    )
    void (async () => {
      try {
        await reorderKnowledgeDocs(docType, ids)
      } catch (err) {
        setUploadError(apiErrorMessage(err, 'Could not reorder the documents.'))
        await refresh() // roll the optimistic order back to server truth
      } finally {
        setMutatingId(null)
      }
    })()
  }

  // the three table sections: each box sorted by read-first rank, plus the
  // legacy untagged docs waiting to be assigned a box
  const byRank = (a: KbDoc, b: KbDoc) =>
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name)
  const icd10Docs = docs.filter((d) => d.docType === 'icd10').sort(byRank)
  const icd9Docs = docs.filter((d) => d.docType === 'icd9cm').sort(byRank)
  const untaggedDocs = docs.filter((d) => !d.docType)

  const startTraining = () => {
    setConfirmingTrain(false)
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
    setConfirmingCodeSync(false)
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

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card padded={false} className="p-5 shadow-none lg:col-span-2">
          <h2 className="mb-3 text-[16px] font-bold text-text">
            Knowledge base
          </h2>
          {/* two boxes, one per code system (user request 2026-08-20): the box
              IS the doc_type tag — everything dropped in it uploads as that
              system, mirroring the coder Add Code modal's two-box pattern.
              click/drag on a zone is a mouse convenience; the sr-only file
              inputs inside are the keyboard/screen-reader path */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UPLOAD_BOXES.map((box) => {
              const isIcd10 = box.type === 'icd10'
              const accent = isIcd10 ? 'text-primary' : 'text-info'
              const active = dragging === box.type
              return (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div
                  key={box.type}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(box.type)
                  }}
                  onDragLeave={() => setDragging(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(null)
                    addFiles(e.dataTransfer.files, box.type)
                  }}
                  onClick={() => {
                    pickingFor.current = box.type
                    fileInput.current?.click()
                  }}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors ${
                    isIcd10
                      ? `focus-within:border-primary focus-within:bg-primary/5 ${
                          active
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/60 hover:bg-primary/5'
                        }`
                      : `focus-within:border-info focus-within:bg-info/5 ${
                          active
                            ? 'border-info bg-info/10'
                            : 'border-border hover:border-info/60 hover:bg-info/5'
                        }`
                  }`}
                >
                  {uploading === box.type ? (
                    <RefreshCw
                      size={22}
                      className={`mx-auto mb-1.5 animate-spin ${accent}`}
                    />
                  ) : (
                    <CloudUpload
                      size={22}
                      className={`mx-auto mb-1.5 ${accent}`}
                    />
                  )}
                  <p role="status" className="text-[13px] font-bold text-text">
                    {uploading === box.type ? 'Uploading…' : box.label}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {uploading === box.type
                      ? 'Indexing starts automatically'
                      : box.hint}
                  </p>
                  {/* sr-only (not display:none) keeps the button focusable —
                      Tab to it, Enter/Space opens the OS picker for THIS box */}
                  <button
                    type="button"
                    aria-label={`Upload ${box.label} (PDF or CSV)`}
                    className="sr-only"
                    onClick={(e) => {
                      e.stopPropagation()
                      pickingFor.current = box.type
                      fileInput.current?.click()
                    }}
                  />
                </div>
              )
            })}
          </div>
          {/* one shared hidden input; pickingFor names the box that opened it */}
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,text/csv,.csv"
            multiple
            aria-hidden="true"
            tabIndex={-1}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files, pickingFor.current)
              e.target.value = ''
            }}
          />
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
                <tr className="border-b border-border text-[13px] tracking-wide text-muted uppercase">
                  {['Document', 'Box', 'Size', 'Pages', 'Chunks', 'Status', 'Actions'].map(
                    (h, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-2 py-3 font-semibold whitespace-nowrap"
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
                      colSpan={7}
                      className="px-2 py-6 text-center text-[12px] text-muted"
                    >
                      No documents yet — the AI has nothing to retrieve from.
                    </td>
                  </tr>
                )}
                {/* one section per upload box (rows in read-first order, with
                    up/down controls), plus the legacy untagged docs awaiting a
                    box. Shared column layout keeps sections aligned. */}
                {docs.length > 0 && ([
                  { key: 'icd10' as const, label: 'ICD-10 · read order', cls: 'text-primary', list: icd10Docs,
                    empty: 'No ICD-10 documents yet — drop files in the ICD-10 box above.' },
                  { key: 'icd9cm' as const, label: 'ICD-9 · read order', cls: 'text-info', list: icd9Docs,
                    empty: 'No ICD-9 documents yet — drop files in the ICD-9 box above.' },
                ]).map((sec) => (
                  <Fragment key={sec.key}>
                    <tr>
                      <td colSpan={7} className="px-2 pt-4 pb-1.5">
                        <span className={`text-[12px] font-bold tracking-wide uppercase ${sec.cls}`}>
                          {sec.label} ({sec.list.length})
                        </span>
                      </td>
                    </tr>
                    {sec.list.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-2 pb-2 text-[12px] text-muted">
                          {sec.empty}
                        </td>
                      </tr>
                    )}
                    {sec.list.map((d, i) => (
                      <tr
                        key={d.id}
                        draggable={mutatingId === null}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', d.id)
                          setDrag({ docType: sec.key, id: d.id })
                        }}
                        onDragOver={(e) => {
                          if (drag?.docType !== sec.key) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          setDragOverId(d.id)
                        }}
                        onDragLeave={() => {
                          if (dragOverId === d.id) setDragOverId(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (drag?.docType === sec.key) {
                            reorderTo(sec.list, sec.key, drag.id, d.id)
                          }
                          setDrag(null)
                          setDragOverId(null)
                        }}
                        onDragEnd={() => {
                          setDrag(null)
                          setDragOverId(null)
                        }}
                        className={`border-b border-border/60 align-middle transition-colors last:border-0 ${
                          drag?.id === d.id ? 'opacity-40' : ''
                        } ${
                          dragOverId === d.id && drag?.id !== d.id
                            ? 'bg-primary/5 [box-shadow:inset_0_2px_0_var(--color-primary)]'
                            : ''
                        }`}
                      >
                        <td className="px-2 py-3.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <GripVertical
                              size={15}
                              aria-hidden="true"
                              className="shrink-0 cursor-grab text-muted/60"
                            />
                            <span className="w-5 shrink-0 text-right text-[12px] font-bold text-muted">
                              {i + 1}.
                            </span>
                            {d.name.toLowerCase().endsWith('.csv') ? (
                              <FileSpreadsheet size={15} className="shrink-0 text-muted" />
                            ) : (
                              <FileText size={15} className="shrink-0 text-muted" />
                            )}
                            <div className="min-w-0">
                              <p
                                className="max-w-[19rem] truncate text-[14px] font-semibold text-text"
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
                        <td className="px-2 py-3.5">
                          <BoxPills doc={d} disabled={mutatingId !== null}
                            onSet={(type) => retag(d, type)} />
                        </td>
                        <td className="px-2 py-3.5 text-[13px] whitespace-nowrap text-muted">
                          {formatSize(d.sizeBytes)}
                        </td>
                        <td className="px-2 py-3.5 text-[13px] text-muted">
                          {d.pages || '—'}
                        </td>
                        <td className="px-2 py-3.5 text-[13px] text-muted">
                          {d.chunks || '—'}
                        </td>
                        <td className="px-2 py-3.5">
                          <StatusPill doc={d} />
                        </td>
                        <td className="px-2 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Rename document"
                              onClick={() => setRenaming(d)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Remove from knowledge base"
                              onClick={() => setDeleting(d)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {untaggedDocs.length > 0 && (
                  <Fragment>
                    <tr>
                      <td colSpan={7} className="px-2 pt-4 pb-1.5">
                        <span className="text-[12px] font-bold tracking-wide text-muted uppercase">
                          Not tagged yet ({untaggedDocs.length})
                        </span>
                        <span className="ml-2 text-[12px] font-normal text-muted">
                          — pick a box so the AI knows which system each file covers
                        </span>
                      </td>
                    </tr>
                    {untaggedDocs.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border/60 align-middle last:border-0"
                      >
                        <td className="px-2 py-3.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-[35px] shrink-0" />
                            {d.name.toLowerCase().endsWith('.csv') ? (
                              <FileSpreadsheet size={15} className="shrink-0 text-muted" />
                            ) : (
                              <FileText size={15} className="shrink-0 text-muted" />
                            )}
                            <div className="min-w-0">
                              <p
                                className="max-w-[19rem] truncate text-[14px] font-semibold text-text"
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
                        <td className="px-2 py-3.5">
                          <BoxPills doc={d} disabled={mutatingId !== null}
                            onSet={(type) => retag(d, type)} />
                        </td>
                        <td className="px-2 py-3.5 text-[13px] whitespace-nowrap text-muted">
                          {formatSize(d.sizeBytes)}
                        </td>
                        <td className="px-2 py-3.5 text-[13px] text-muted">
                          {d.pages || '—'}
                        </td>
                        <td className="px-2 py-3.5 text-[13px] text-muted">
                          {d.chunks || '—'}
                        </td>
                        <td className="px-2 py-3.5">
                          <StatusPill doc={d} />
                        </td>
                        <td className="px-2 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Rename document"
                              onClick={() => setRenaming(d)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Remove from knowledge base"
                              onClick={() => setDeleting(d)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/15"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )}
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
            onClick={() => setConfirmingTrain(true)}
            disabled={training || busy || uploading !== null || !docs.length}
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
              onClick={() => setConfirmingCodeSync(true)}
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

      {confirmingTrain && (
        <ConfirmModal
          title={lastRun ? 'Retrain the index' : 'Train the AI'}
          message={`Re-embed all ${docs.length} document${docs.length === 1 ? '' : 's'} and rebuild the vector index the coding AI queries? Suggestions keep using the current index until the rebuild finishes.`}
          confirmLabel={lastRun ? 'Retrain index' : 'Train AI'}
          variant="primary"
          onConfirm={startTraining}
          onClose={() => setConfirmingTrain(false)}
        />
      )}

      {confirmingCodeSync && (
        <ConfirmModal
          title="Sync codes to system DB"
          message={`Extract ICD codes and titles from all ${docs.length} uploaded document${docs.length === 1 ? '' : 's'} into the system's icd_codes table? New codes are inserted; existing descriptions are never overwritten.`}
          confirmLabel="Sync codes"
          variant="primary"
          onConfirm={runCodeSync}
          onClose={() => setConfirmingCodeSync(false)}
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
