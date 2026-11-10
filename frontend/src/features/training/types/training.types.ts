export type KbStatus = 'queued' | 'processing' | 'indexed' | 'failed'

/** Which upload box a document came through (RAG `doc_type`). The tag is
 *  stamped into every indexed chunk's metadata. */
export type KbDocType = 'icd10' | 'icd9cm'

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
  /** null/undefined = legacy upload from before the two-box split */
  docType?: KbDocType | null
  /** read-first priority inside its box (1 = the AI reads it first) */
  rank?: number | null
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
