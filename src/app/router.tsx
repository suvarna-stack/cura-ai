import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { LoginForm } from '../features/auth/components/LoginForm'
import { AccountsPage } from '../features/accounts/components/AccountsPage'
import { DashboardPage } from '../features/dashboard/components/DashboardPage'
import { TrainingPage } from '../features/training/components/TrainingPage'

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
      </Route>

      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  )
}