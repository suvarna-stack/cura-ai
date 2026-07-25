import { apiClient } from '../../../lib/axios'
import { fetchMe } from '../../auth/api/authService'
import type { CoderProfile } from '../types/settings.types'

/**
 * Settings API — live since Phase 4. The profile card is fed from the
 * logged-in account (/api/auth/me); `scope` and `imedUserId` have no real
 * backend source yet (hospital master data still TBD — see
 * medcode-api/docs/imed-integration.md open question 4), so they show
 * honest placeholders.
 */
export async function fetchCoderProfile(): Promise<CoderProfile> {
  const me = await fetchMe()
  return {
    fullName: me.fullName ?? me.email,
    role: me.role === 'admin' ? 'Administrator' : 'Medical Coder',
    scope: 'All departments',
    imedUserId: '—', // no iMed employee-id mapping yet (open question 4)
  }
}

/** Locally-approved case ids (demo tooling reads the optimistic set). */
export async function fetchApprovedCaseIds(): Promise<string[]> {
  try {
    return JSON.parse(localStorage.getItem('approvedCases') ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Reset demo approvals — server-side POST /api/demo/reset (restores the demo
 * baseline; 404 when DEMO_TOOLS_ENABLED is off), then clears the local
 * optimistic sets and reloads so the UI refetches the reset payload.
 */
export async function resetDemoApprovals(): Promise<void> {
  await apiClient.post('/demo/reset', {})
  localStorage.removeItem('approvedCases')
  localStorage.removeItem('reopenedCases')
  window.location.reload()
}
