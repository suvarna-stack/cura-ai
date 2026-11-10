import { apiClient } from '../../../lib/axios'
import { fetchAccounts } from '../../accounts/api/accountService'
import type {
  DashboardAccountRow,
  DashboardOverview,
} from '../types/dashboard.types'

/**
 * Admin dashboard API — live against medcode-api since Phase 4
 * (GET /api/admin/dashboard; admin token required).
 */

interface ServerDashboard {
  totalCoderAccounts: number
  activeToday: number
  totalCases: number
  systemStatus: string // "operational"
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const { data } = await apiClient.get<ServerDashboard>('/admin/dashboard')
  return {
    totalAccounts: data.totalCoderAccounts,
    activeToday: data.activeToday,
    totalCases: data.totalCases,
    // "operational" → "Operational" for the card
    systemStatus:
      data.systemStatus.charAt(0).toUpperCase() + data.systemStatus.slice(1),
  }
}

/** The accounts summary table reuses the accounts list (same endpoint). */
export async function fetchDashboardAccounts(): Promise<DashboardAccountRow[]> {
  const accounts = await fetchAccounts()
  return accounts.map(({ id, name, status }) => ({ id, name, status }))
}
