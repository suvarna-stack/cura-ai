import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { CuraSplash } from '../components/brand/CuraSplash'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { LoginForm } from '../features/auth/components/LoginForm'
import { roleHome, useAuth } from '../features/auth/hooks/useAuth'
import type { UserRole } from '../features/auth/types/auth.types'
import { AccountsPage } from '../features/accounts/components/AccountsPage'
import { DashboardPage } from '../features/dashboard/components/DashboardPage'
import { TrainingPage } from '../features/training/components/TrainingPage'
import { CasesLayout } from '../features/cases/components/CasesLayout'
import { CasesPageRoute } from '../features/cases/components/CasesPageRoute'
import {
  CaseDetailRoute,
  FinishedCaseDetailRoute,
  IncompleteCaseDetailRoute,
  ViewHistoryRoute,
} from '../features/cases/components/CaseDetailRoutes'
import { AnalyticsPage } from '../features/analytics/components/AnalyticsPage'
import { AgentPage } from '../features/agent/components/AgentPage'
import { SettingsPage } from '../features/settings/components/SettingsPage'

/**
 * Role gate (Phase 3): coder pages are for coders ONLY, admin pages for
 * admins ONLY — a logged-in user visiting the other role's pages is sent to
 * their own home, and anonymous visitors go to /login. The backend enforces
 * the same rules (401/403), so this routing is UX, not the security boundary.
 */
function RequireRole({ role }: { role: UserRole }) {
  const { user, ready } = useAuth()
  // Nothing for the first quarter-second, so a fast token check never flashes
  // a splash; the branded one takes over only once the wait is real.
  const showSplash = useDelayedFlag(!ready)

  if (!ready) return showSplash ? <CuraSplash status="Loading workspace…" /> : null

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (user.role !== role) {
    return <Navigate to={roleHome(user.role)} replace />
  }
  return <Outlet />
}

/** Everyone's landing spot: role home when logged in, /login otherwise. */
function HomeRedirect() {
  const { user, ready } = useAuth()
  const showSplash = useDelayedFlag(!ready)
  if (!ready) return showSplash ? <CuraSplash status="Loading workspace…" /> : null
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginForm />} />

      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="training" element={<TrainingPage />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="coder" />}>
        <Route element={<CasesLayout />}>
          <Route path="/cases">
            <Route index element={<CasesPageRoute />} />
            <Route path=":id" element={<CaseDetailRoute />} />
            <Route path=":id/incomplete" element={<IncompleteCaseDetailRoute />} />
            <Route path=":id/finished" element={<FinishedCaseDetailRoute />} />
            <Route path=":id/history" element={<ViewHistoryRoute />} />
          </Route>
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}
