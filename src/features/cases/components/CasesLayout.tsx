import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart2,
  Bot,
  Settings,
  Cpu,
  LogOut,
  RefreshCw,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useLang } from '../context/LanguageContext'
import { useSync } from '../context/SyncContext'
import { CasesProviders } from '../context/CasesProviders'
import { useAuth } from '../../auth/hooks/useAuth'

const NAV = [
  { to: '/cases', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: false },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart2, end: true },
  { to: '/agent', labelKey: 'nav.agent', icon: Bot, end: true },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, end: true },
]

function CoderShell() {
  const { gl } = useTheme()
  const { t } = useLang()
  const { syncing, lastSync, runSync } = useSync()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    void logout().finally(() => navigate('/login', { replace: true }))
  }

  return (
    <>
      <header
        className="sticky top-0 z-20 flex shrink-0 items-center gap-1 px-5 py-2.5"
        style={{
          background: gl.sidebar,
          backdropFilter: gl.blur24,
          WebkitBackdropFilter: gl.blur24,
          borderBottom: gl.sidebarBorder,
        }}
      >
        <div className="mr-6 flex select-none items-center gap-2">
          <Cpu size={18} style={{ color: gl.accent }} />
          <p
            className="text-[15px] leading-tight font-bold tracking-tight"
            style={{ color: gl.text }}
          >
            MedCode <span style={{ color: gl.accent }}>AI</span>
          </p>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  isActive ? '' : 'opacity-70 hover:opacity-100'
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? gl.accent : gl.text,
                background: isActive
                  ? `rgba(${gl.accentRgb},0.12)`
                  : 'transparent',
              })}
            >
              <item.icon size={14} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* logged-in coder + iMed sync + logout (coders never see the admin sidebar) */}
        <div className="ml-auto flex items-center gap-1.5">
          {user && (
            <span
              className="hidden text-[12px] font-semibold sm:inline"
              style={{ color: gl.text, opacity: 0.7 }}
              title={user.email}
            >
              {user.fullName ?? user.email}
            </span>
          )}
          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-100 disabled:opacity-50"
            style={{
              color: lastSync === 'sync.failed' ? gl.danger : gl.text,
              opacity: lastSync === 'sync.failed' ? 1 : 0.7,
            }}
            title={`${t('sync.label')} · ${t(lastSync)}`}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? t('sync.syncing') : t('sync.btn')}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold opacity-70 transition-opacity hover:opacity-100"
            style={{ color: gl.text }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </>
  )
}

/** Shared shell for coder workspace: cases, analytics, agent, settings. */
export function CasesLayout() {
  return (
    <CasesProviders>
      <CoderShell />
    </CasesProviders>
  )
}
