import type {
  KbDoc,
  RetrievalHit,
  TrainingRun,
} from '../types/training.types'
import { SEED_DOCS } from '../types/training.types'

/**
 * Placeholder training / RAG API — wire to shared apiClient when ready.
 */
export async function fetchKnowledgeDocs(): Promise<KbDoc[]> {
  // TODO: const { data } = await apiClient.get<KbDoc[]>('/admin/knowledge/docs')
  return [...SEED_DOCS]
}

export async function fetchLastTrainingRun(): Promise<TrainingRun | null> {
  // TODO: const { data } = await apiClient.get<TrainingRun | null>('/admin/knowledge/runs/latest')
  return null
}

export async function uploadKnowledgeDocs(files: File[]): Promise<KbDoc[]> {
  void files
  // TODO: upload via apiClient multipart
  throw new Error('uploadKnowledgeDocs is not implemented')
}

export async function removeKnowledgeDoc(id: string): Promise<void> {
  void id
  // TODO: await apiClient.delete(`/admin/knowledge/docs/${id}`)
  throw new Error('removeKnowledgeDoc is not implemented')
}

export async function startTrainingRun(): Promise<TrainingRun> {
  // TODO: const { data } = await apiClient.post<TrainingRun>('/admin/knowledge/train')
  throw new Error('startTrainingRun is not implemented')
}

export async function testRetrieval(
  query: string,
): Promise<RetrievalHit[]> {
  void query
  // TODO: const { data } = await apiClient.post<RetrievalHit[]>('/admin/knowledge/retrieve', { query })
  return []
}
