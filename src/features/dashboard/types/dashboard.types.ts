import type { Account } from '../../accounts/types/account.types'

export interface DashboardOverview {
  totalAccounts: number
  activeToday: number
  totalCases: number
  systemStatus: string
}

export interface DashboardAccountRow {
  id: string
  name: string
  role: Account['role']
  status: Account['status']
}
