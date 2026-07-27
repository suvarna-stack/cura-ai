import { apiClient } from '../../../lib/axios'
import type {
  ApiCaseDetail,
  ApiCasesResponse,
  ApiStoredCode,
} from '../types/api.types'

/**
 * Cases API — live against medcode-api since Phase 4 (the USE_MOCK seed layer
 * is gone). All requests carry the login token via the shared apiClient; the
 * server stamps approve/reopen with the logged-in coder, so no coder name is
 * sent from here.
 */

/** Live server is the only mode now (kept for callers that still branch). */
export const hasLiveServer = true

/** GET /api/cases — the four-group dashboard payload. */
export async function fetchCases(): Promise<ApiCasesResponse> {
  const { data } = await apiClient.get<ApiCasesResponse>('/cases')
  return data
}

/** GET /api/cases/{id} — full detail incl. codeEdits/reportDraft. */
export async function fetchCaseDetail(id: string): Promise<ApiCaseDetail> {
  const { data } = await apiClient.get<ApiCaseDetail>(
    `/cases/${encodeURIComponent(id)}`,
  )
  return data
}

/** True when the detail came from a live server (includes working-state keys). */
export const isLiveDetail = (d: ApiCaseDetail) => 'codeEdits' in d

/** Fire a write; resolves true on success, false on failure (callers treat
 *  writes as best-effort on top of their optimistic local state). */
async function send(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<boolean> {
  try {
    await apiClient.request({ url, method, data: body })
    return true
  } catch {
    return false
  }
}

/** POST /api/cases/approve — the server records the logged-in coder. */
export const approveCases = (ids: string[]) =>
  send('/cases/approve', 'POST', { ids })

/** POST /api/cases/{id}/reopen — undo an approve (actor = logged-in coder). */
export const reopenCase = (id: string) =>
  send(`/cases/${encodeURIComponent(id)}/reopen`, 'POST', {})

/** PUT /api/cases/{id}/codes — save working code edits (bare array). */
export const saveCodesRemote = (id: string, codes: ApiStoredCode[]) =>
  send(`/cases/${encodeURIComponent(id)}/codes`, 'PUT', codes)

/** PUT /api/cases/{id}/draft — save report draft (deprecated feature). */
export const saveDraftRemote = (id: string, text: string) =>
  send(`/cases/${encodeURIComponent(id)}/draft`, 'PUT', { text })

/** POST /api/sync — pull every hospital case into medcode (non-destructive). */
export interface SyncResult {
  ok: boolean
  imported: string[]
  refreshed: string[]
  skippedApproved: string[]
  failed: Array<{ caseId: string; error: string }>
}

export async function syncFromHospital(): Promise<SyncResult> {
  const { data } = await apiClient.post<SyncResult>('/sync')
  return data
}

/** One RAG suggestion for a case (POST /api/cases/{id}/suggest-codes). */
export interface SuggestedCode {
  code: string
  system: string
  description: string
  confidence: number
  source?: string
}

export async function suggestCodes(caseId: string): Promise<SuggestedCode[]> {
  const { data } = await apiClient.post<{ codes: SuggestedCode[] }>(
    `/cases/${encodeURIComponent(caseId)}/suggest-codes`,
  )
  return data.codes ?? []
}
