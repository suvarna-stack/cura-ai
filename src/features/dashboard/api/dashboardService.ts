import type {
  DashboardAccountRow,
  DashboardOverview,
} from '../types/dashboard.types'

/**
 * Placeholder dashboard API — wire to shared apiClient when the backend is ready.
 */
export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  // TODO: const { data } = await apiClient.get<DashboardOverview>('/admin/dashboard')
  return {
    totalAccounts: 0,
    activeToday: 0,
    totalCases: 0,
    systemStatus: 'Operational',
  }
}

export async function fetchDashboardAccounts(): Promise<DashboardAccountRow[]> {
  // TODO: const { data } = await apiClient.get<DashboardAccountRow[]>('/admin/accounts/summary')
  return []
}
