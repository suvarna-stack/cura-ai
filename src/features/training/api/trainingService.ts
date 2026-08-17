import { apiClient } from '../../../lib/axios'
import type {
  ChatAnswer,
  KbDoc,
  KnowledgeStats,
  RetrievalHit,
} from '../types/training.types'

/**
 * Training / RAG API — proxied by medcode-api (/api/admin/knowledge/**, admin
 * token required) to the RAG FastAPI service. Uploads and training return
 * immediately; real progress is polled via fetchKnowledgeDocs().
 */

// --------------------------- wire formats (RAG service, snake_case) --------

interface RagDocument {
  source: string
  filename: string
  size_bytes: number
  pages: number
  chunks: number
  status: KbDoc['status']
  progress: number
  error?: string | null
  uploaded_at: string
}

interface RagStats {
  documents_indexed: number
  chunks_in_index: number
  embed_model: string
  llm_model: string
  retrieval_mode: string
}

interface RagChunk {
  text: string
  source: string
  /** current display filename from the RAG registry (follows renames) */
  display_name?: string
  score: number
  via: string
  metadata: Record<string, unknown>
}

interface RagRetrieveResponse {
  question: string
  mode: string
  hits: RagChunk[]
}

interface RagChatResponse {
  question: string
  answer: string
  mode: string
  contexts: RagChunk[]
}

// --------------------------- mapping ---------------------------------------

function toKbDoc(d: RagDocument): KbDoc {
  return {
    id: d.source,
    name: d.filename || d.source,
    sizeBytes: d.size_bytes,
    pages: d.pages,
    chunks: d.chunks,
    status: d.status,
    progress: d.progress,
    uploadedAt: d.uploaded_at,
    error: d.error ?? undefined,
  }
}

function toHit(c: RagChunk): RetrievalHit {
  const page = c.metadata?.page
  return {
    docName: c.display_name || c.source,
    page: typeof page === 'number' ? page : null,
    score: c.score,
    snippet: c.text,
    via: c.via,
  }
}

// --------------------------- calls ------------------------------------------

export async function fetchKnowledgeDocs(): Promise<KbDoc[]> {
  const { data } = await apiClient.get<RagDocument[]>('/admin/knowledge/docs')
  return data.map(toKbDoc)
}

export async function fetchKnowledgeStats(): Promise<KnowledgeStats> {
  const { data } = await apiClient.get<RagStats>('/admin/knowledge/stats')
  return {
    documentsIndexed: data.documents_indexed,
    chunksInIndex: data.chunks_in_index,
    embedModel: data.embed_model,
    llmModel: data.llm_model,
    retrievalMode: data.retrieval_mode,
  }
}

/** Upload files (PDF/CSV) one by one; the RAG service ingests each in the background. */
export async function uploadKnowledgeDocs(files: File[]): Promise<void> {
  for (const file of files) {
    const form = new FormData()
    form.append('file', file)
    await apiClient.post('/admin/knowledge/docs', form)
  }
}

export async function removeKnowledgeDoc(id: string): Promise<void> {
  await apiClient.delete(`/admin/knowledge/docs/${encodeURIComponent(id)}`)
}

/** Rename a document's display filename; the index is untouched (no re-embed).
 *  The RAG side preserves the file extension, appending it when missing. */
export async function renameKnowledgeDoc(
  id: string,
  filename: string,
): Promise<KbDoc> {
  const { data } = await apiClient.patch<RagDocument>(
    `/admin/knowledge/docs/${encodeURIComponent(id)}`,
    { filename },
  )
  return toKbDoc(data)
}

/** Kick off a full index rebuild; poll fetchKnowledgeDocs() for progress. */
export async function startTrainingRun(): Promise<{ documents: number }> {
  const { data } = await apiClient.post<{ status: string; documents: number }>(
    '/admin/knowledge/train',
  )
  return { documents: data.documents }
}

export async function testRetrieval(query: string): Promise<RetrievalHit[]> {
  const { data } = await apiClient.post<RagRetrieveResponse>(
    '/admin/knowledge/retrieve',
    { question: query },
  )
  return data.hits.map(toHit)
}

export interface CodeSyncResult {
  documentsScanned: number
  extracted: number
  added: number
  descriptionsFilled: number
  unchanged: number
}

/** Extract ICD codes from the uploaded documents into the system DB. */
export async function syncCodesToSystem(): Promise<CodeSyncResult> {
  const { data } = await apiClient.post<CodeSyncResult>(
    '/admin/knowledge/sync-codes',
  )
  return data
}

/** Full RAG answer from the local LLM — can take a while on CPU. */
export async function testChat(query: string): Promise<ChatAnswer> {
  const { data } = await apiClient.post<RagChatResponse>(
    '/admin/knowledge/chat',
    { question: query, max_new_tokens: 300 },
  )
  return {
    answer: data.answer,
    mode: data.mode,
    hits: data.contexts.map(toHit),
  }
}

/** Human-readable message from an Axios error (the API's {"error": ...}). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
