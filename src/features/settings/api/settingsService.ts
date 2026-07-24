import type { CoderProfile } from '../types/settings.types'
import { MOCK_CODER_PROFILE } from '../types/settings.types'

/**
 * Toggle mock responses until the real settings API is ready.
 */
const USE_MOCK = true

/**
 * Placeholder settings API — wire to shared apiClient when ready.
 */
export async function fetchCoderProfile(): Promise<CoderProfile> {
  if (USE_MOCK) {
    return { ...MOCK_CODER_PROFILE }
  }
  // TODO: const { data } = await apiClient.get<CoderProfile>('/me')
  throw new Error('fetchCoderProfile is not implemented')
}

/** Local + optional server approved case ids (demo reset tooling). */
export async function fetchApprovedCaseIds(): Promise<string[]> {
  if (USE_MOCK) {
    try {
      return JSON.parse(
        localStorage.getItem('approvedCases') ?? '[]',
      ) as string[]
    } catch {
      return []
    }
  }
  // TODO: const { data } = await apiClient.get<string[]>('/cases/approved-ids')
  throw new Error('fetchApprovedCaseIds is not implemented')
}

/**
 * Reset demo approvals — clears localStorage and reloads.
 * Real backend: POST /demo/reset (placeholder).
 */
export async function resetDemoApprovals(): Promise<void> {
  if (USE_MOCK) {
    localStorage.removeItem('approvedCases')
    localStorage.removeItem('reopenedCases')
    window.location.reload()
    return
  }
  // TODO: await apiClient.post('/demo/reset')
  throw new Error('resetDemoApprovals is not implemented')
}
