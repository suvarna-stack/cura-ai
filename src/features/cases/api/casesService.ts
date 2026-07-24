import type {
  ApiCaseDetail,
  ApiCasesResponse,
  ApiStoredCode,
} from '../types/api.types'
import { SEED_CASE_DETAILS, SEED_CASES } from '../mock/seedCases'

/**
 * Toggle mock responses until the real cases API is ready.
 * When false, wire the TODO apiClient calls below.
 */
const USE_MOCK = true

/** True when a live API base is configured (approvals persist server-side). */
export const hasLiveServer = Boolean(import.meta.env.VITE_API_BASE)

/**
 * Placeholder cases API — wire to shared apiClient when the backend is ready.
 */
export async function fetchCases(): Promise<ApiCasesResponse> {
  if (USE_MOCK) {
    return structuredClone(SEED_CASES)
  }
  // TODO: const { data } = await apiClient.get<ApiCasesResponse>('/cases')
  throw new Error('fetchCases is not implemented')
}

export async function fetchCaseDetail(id: string): Promise<ApiCaseDetail> {
  if (USE_MOCK) {
    const detail = SEED_CASE_DETAILS[id]
    if (!detail) throw new Error(`No mock detail for case ${id}`)
    return structuredClone(detail)
  }
  // TODO: const { data } = await apiClient.get<ApiCaseDetail>(`/cases/${id}`)
  void id
  throw new Error('fetchCaseDetail is not implemented')
}

/** True when the detail came from a live server (includes working-state keys). */
export const isLiveDetail = (d: ApiCaseDetail) => 'codeEdits' in d

async function sendPlaceholder(
  _path: string,
  _method: string,
  _body: unknown,
): Promise<boolean> {
  if (USE_MOCK) return false
  // TODO: await apiClient.request(...)
  return false
}

/** POST /cases/approve — finalize cases (placeholder). */
export const approveCases = (ids: string[], coder = 'web.coder') =>
  sendPlaceholder('/cases/approve', 'POST', { ids, coder })

/** POST /cases/{id}/reopen — undo an approve (placeholder). */
export const reopenCase = (id: string, coder = 'web.coder') =>
  sendPlaceholder(`/cases/${id}/reopen`, 'POST', { coder })

/** PUT /cases/{id}/codes — save working code edits (placeholder). */
export const saveCodesRemote = (id: string, codes: ApiStoredCode[]) =>
  sendPlaceholder(`/cases/${id}/codes`, 'PUT', codes)

/** PUT /cases/{id}/draft — save report draft (placeholder). */
export const saveDraftRemote = (id: string, text: string) =>
  sendPlaceholder(`/cases/${id}/draft`, 'PUT', { text })
