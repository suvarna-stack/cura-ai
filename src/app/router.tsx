import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { LoginForm } from '../features/auth/components/LoginForm'
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

function ProtectedRoute() {
  const isAuthenticated = Boolean(localStorage.getItem('token'))

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginForm />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="training" element={<TrainingPage />} />
        </Route>

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

      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  )
}
