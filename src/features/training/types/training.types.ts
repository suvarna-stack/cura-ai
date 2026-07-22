export type KbStatus = 'queued' | 'processing' | 'indexed' | 'failed'

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

export interface TrainingRun {
  finishedAt: string
  docCount: number
  chunkCount: number
  model: string
  durationMs: number
}

export interface RetrievalHit {
  docName: string
  page: number
  score: number
  snippet: string
}

export const EMBED_MODEL = 'medcode-embed-th-v1'
export const CHUNK_TOKENS = 800
export const CHUNK_OVERLAP = 120

const KB = 1024

export function estimatePages(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / KB / 45))
}

export function estimateChunks(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / KB / 8))
}

export function estimateTokens(chunks: number): number {
  return chunks * CHUNK_TOKENS
}

export function formatSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(0)} KB`
  return `${(bytes / KB / KB).toFixed(1)} MB`
}

function seedDoc(
  id: string,
  name: string,
  sizeBytes: number,
  uploadedAt: string,
): KbDoc {
  return {
    id,
    name,
    sizeBytes,
    pages: estimatePages(sizeBytes),
    chunks: estimateChunks(sizeBytes),
    status: 'indexed',
    progress: 100,
    uploadedAt,
  }
}

export const SEED_DOCS: KbDoc[] = [
  seedDoc(
    'k1',
    'ICD-10-TM Standard Coding Guideline (2024).pdf',
    4_820_000,
    '2026-06-02T09:14:00.000Z',
  ),
  seedDoc(
    'k2',
    'ICD-9-CM Procedure Coding Manual.pdf',
    3_140_000,
    '2026-06-02T09:31:00.000Z',
  ),
  seedDoc(
    'k3',
    'Thai DRG v6.3 Grouper Handbook.pdf',
    2_060_000,
    '2026-06-11T13:05:00.000Z',
  ),
  seedDoc('k4', 'Hospital Coding SOP — OPD.pdf', 684_000, '2026-06-24T10:47:00.000Z'),
  seedDoc(
    'k5',
    'UC / OFC Coverage Billing Rules.pdf',
    921_000,
    '2026-07-03T15:22:00.000Z',
  ),
]
