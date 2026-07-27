export type KbStatus = 'queued' | 'processing' | 'indexed' | 'failed'

/** One document in the RAG knowledge base (id == RAG `source`). */
export interface KbDoc {
  id: string
  name: string
  sizeBytes: number
  pages: number
  chunks: number
  status: KbStatus
  progress: number
  uploadedAt: string
  error?: string
}

/** Live index stats from the RAG service (GET /admin/knowledge/stats). */
export interface KnowledgeStats {
  documentsIndexed: number
  chunksInIndex: number
  embedModel: string
  llmModel: string
  retrievalMode: string
}

/** Summary of the last completed rebuild, derived client-side. */
export interface TrainingRun {
  finishedAt: string
  docCount: number
  chunkCount: number
  model: string
  durationMs: number
}

export interface RetrievalHit {
  docName: string
  page: number | null
  score: number
  snippet: string
  /** Why the chunk was retrieved (vector match vs graph expansion). */
  via: string
}

/** Full RAG answer from the local LLM (slow — used by the optional AI test). */
export interface ChatAnswer {
  answer: string
  mode: string
  hits: RetrievalHit[]
}

const KB = 1024

export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(0)} KB`
  return `${(bytes / KB / KB).toFixed(1)} MB`
}
