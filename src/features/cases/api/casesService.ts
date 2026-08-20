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

/** GET /api/cases/{id} — full detail incl. codeEdits. */
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

/** POST /api/sync — pull hospital cases into medcode (non-destructive). */
export interface SyncResult {
  ok: boolean
  imported: string[]
  refreshed: string[]
  skippedApproved: string[]
  failed: Array<{ caseId: string; error: string }>
  /** echo of the request window; absent when the sync was unwindowed */
  window?: { from: string | null; to: string | null }
}

/** Visit-date window (YYYY-MM-DD, inclusive); omit a side to leave it open. */
export interface SyncWindow {
  from?: string
  to?: string
}

export async function syncFromHospital(window?: SyncWindow): Promise<SyncResult> {
  const body =
    window && (window.from || window.to)
      ? { from: window.from || undefined, to: window.to || undefined }
      : {}
  const { data } = await apiClient.post<SyncResult>('/sync', body)
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

/**
 * A rule a coder taught the agent (Suggest & Learn) that matches this case.
 * Shown as a callout above the AI suggestions — the hospital's own guidance
 * outranks whatever the reference PDFs say around it.
 */
export interface SuggestedNote {
  id: string
  summary: string
  scenario: string
  rule: string
  codes: { code: string; system: string; description: string; role: string }[]
  createdBy: string
  via: string
}

export interface CaseSuggestion {
  codes: SuggestedCode[]
  notes: SuggestedNote[]
}

export async function suggestCodes(caseId: string): Promise<CaseSuggestion> {
  const { data } = await apiClient.post<{
    codes: SuggestedCode[]
    notes?: SuggestedNote[]
  }>(`/cases/${encodeURIComponent(caseId)}/suggest-codes`)
  return { codes: data.codes ?? [], notes: data.notes ?? [] }
}

/** One row from GET /api/icd-codes (catalog typeahead). */
export interface IcdCatalogHit {
  code: string
  system: string
  description: string
}

/** Bulk code -> description across both catalogs (ICD filter dialog).
 *  POST because the dialog sends every code on the loaded cases at once. */
export async function lookupIcdDescriptions(
  codes: string[],
): Promise<Record<string, string>> {
  if (codes.length === 0) return {}
  const { data } = await apiClient.post<Record<string, string>>(
    '/icd-codes/lookup',
    { codes: codes.slice(0, 1000) },
  )
  return data ?? {}
}

/** Search the shared icd_codes catalog (ICD-10 / ICD-9). */
export async function searchIcdCatalog(
  q: string,
  opts?: { system?: 'ICD-10' | 'ICD-9'; limit?: number },
): Promise<IcdCatalogHit[]> {
  const { data } = await apiClient.get<IcdCatalogHit[]>('/icd-codes', {
    params: {
      q,
      ...(opts?.system ? { system: opts.system } : {}),
      limit: opts?.limit ?? 20,
    },
  })
  return data ?? []
}
