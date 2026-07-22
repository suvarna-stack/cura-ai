import { useEffect, useState } from 'react'
import { Users, Activity, Database, CheckCircle2 } from 'lucide-react'
import { Badge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { SEED_ACCOUNTS } from '../../accounts/types/account.types'
import {
  fetchDashboardAccounts,
  fetchDashboardOverview,
} from '../api/dashboardService'
import type {
  DashboardAccountRow,
  DashboardOverview,
} from '../types/dashboard.types'

const FALLBACK_OVERVIEW: DashboardOverview = {
  totalAccounts: SEED_ACCOUNTS.length,
  activeToday: Math.min(
    3,
    SEED_ACCOUNTS.filter((a) => a.status === 'Active').length,
  ),
  totalCases: 127,
  systemStatus: 'Operational ✅',
}

const FALLBACK_ACCOUNTS: DashboardAccountRow[] = SEED_ACCOUNTS.map(
  ({ id, name, role, status }) => ({ id, name, role, status }),
)

export function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview>(FALLBACK_OVERVIEW)
  const [accounts, setAccounts] =
    useState<DashboardAccountRow[]>(FALLBACK_ACCOUNTS)

  useEffect(() => {
    void (async () => {
      try {
        const [nextOverview, nextAccounts] = await Promise.all([
          fetchDashboardOverview(),
          fetchDashboardAccounts(),
        ])
        // Keep seed UI until real API returns data
        if (nextOverview.totalAccounts > 0) setOverview(nextOverview)
        if (nextAccounts.length > 0) setAccounts(nextAccounts)
      } catch {
        // placeholders may throw later — seed UI stays
      }
    })()
  }, [])

  const cards = [
    {
      label: 'Total Coder Accounts',
      value: String(overview.totalAccounts),
      icon: Users,
    },
    {
      label: 'Active Today',
      value: String(overview.activeToday),
      icon: Activity,
    },
    {
      label: 'Total Cases in System',
      value: String(overview.totalCases),
      icon: Database,
    },
    {
      label: 'System Status',
      value: overview.systemStatus,
      icon: CheckCircle2,
    },
  ]

  return (
    <>
      <h1 className="mb-1 text-[19px] font-bold text-text">Dashboard</h1>
      <p className="mb-6 text-[12px] text-muted">
        System overview and account summary
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} padded={false} className="p-5 shadow-none">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/15">
              <c.icon size={16} className="text-primary" />
            </div>
            <p className="text-[19px] leading-tight font-bold text-text">
              {c.value}
            </p>
            <p className="mt-1 text-[12px] text-muted">{c.label}</p>
          </Card>
        ))}
      </div>

      <Card padded={false} className="overflow-hidden shadow-none">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-[14px] font-bold text-text">Coder Accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[11px] tracking-wide text-muted uppercase">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-5 py-3 text-[13px] font-semibold text-text">
                    {a.name}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-muted">{a.role}</td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={a.status === 'Active' ? 'success' : 'neutral'}
                    >
                      {a.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
