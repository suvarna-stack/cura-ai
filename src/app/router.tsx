import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoginForm } from '../features/auth/components/LoginForm'

function ProtectedRoute() {
  // Placeholder — replace with real auth check
  const isAuthenticated = Boolean(localStorage.getItem('token'))

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

function LoginPage() {
  return <LoginForm />
}

function DashboardPlaceholder() {
  return <div>Dashboard</div>
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPlaceholder />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
