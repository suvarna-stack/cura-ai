import { useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  BrainCircuit,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../features/auth/hooks/useAuth'
import { useModalA11y } from '../hooks/useModalA11y'

// Strict role separation (Phase 3): no cross-link to the coder's /cases —
// admins see admin pages only (the router would bounce it anyway).
const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/accounts', label: 'Accounts', icon: Users, end: false },
  { to: '/admin/training', label: 'AI Training', icon: BrainCircuit, end: false },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerKeyDown = useModalA11y(drawerRef, {
    onClose: () => setMobileOpen(false),
    active: mobileOpen,
  })

  const handleLogout = () => {
    void logout().finally(() => navigate('/login', { replace: true }))
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-5">
        <ShieldCheck size={20} className="shrink-0 text-primary" />
        <div>
          <p className="text-[14px] font-bold leading-tight text-text">
            MedCode AI
          </p>
          <p className="text-[12px] font-semibold leading-tight text-primary">
            SuperAdmin
          </p>
        </div>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-1 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 border-l-2 px-5 py-2.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? 'border-primary bg-primary/10 text-text'
                  : 'border-transparent text-muted hover:bg-surface-muted hover:text-text'
              }`
            }
          >
            <item.icon size={15} /> {item.label}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 border-t border-border px-5 py-3.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <LogOut size={15} /> Logout
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* keyboard users skip the sidebar on every page (WCAG 2.4.1) */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-bold"
      >
        Skip to main content
      </a>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation">
          <div
            role="presentation"
            className="absolute inset-0 bg-overlay"
            onClick={() => setMobileOpen(false)}
          />
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape/Tab handling on the dialog container is the APG dialog pattern */}
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            onKeyDown={drawerKeyDown}
            className="absolute top-0 left-0 h-full w-60 border-r border-border bg-surface"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 text-muted hover:text-text"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-muted hover:text-text"
          >
            <Menu size={18} />
          </button>
          <p className="text-[13px] font-bold">
            MedCode AI <span className="text-primary">SuperAdmin</span>
          </p>
        </div>
        <main id="main" tabIndex={-1} className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
