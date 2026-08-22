import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart2,
  Bot,
  Settings,
  Cpu,
  LogOut,
} from 'lucide-react'
import { ConfirmDialog } from './global/ConfirmDialog'
import { useTheme } from '../context/ThemeContext'
import { useLang } from '../context/LanguageContext'
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
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  // The agent page is a chat: lock the shell to the viewport so only its
  // message list scrolls. Every other page keeps normal document scrolling.
  const chatShell = pathname.startsWith('/agent')
  // Logging out drops the held case lock and any unapproved code edits, so the
  // button asks first rather than ending the session on a stray click.
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = () => {
    if (loggingOut) return
    setLoggingOut(true)
    void logout().finally(() => navigate('/login', { replace: true }))
  }

  return (
    <div
      className={
        chatShell
          ? 'flex h-dvh flex-col overflow-hidden'
          : 'flex min-h-dvh flex-col'
      }
    >
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

        <nav aria-label="Primary" className="flex items-center gap-1">
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

        {/* logged-in coder + logout (coders never see the admin sidebar).
            Syncing lives in the Dashboard's date bar, not up here. */}
        <div className="ml-auto flex items-center gap-2">
          {/* identity badge — quietest of the three, it is a label not a control */}
          {user && (
            <span
              className="hidden rounded-full px-3 py-1 text-[12px] font-bold sm:inline"
              style={{
                color: gl.accent,
                background: `rgba(${gl.accentRgb},0.12)`,
                border: `1px solid rgba(${gl.accentRgb},0.20)`,
              }}
              title={user.email}
            >
              {user.fullName ?? user.email}
            </span>
          )}
          {/* Logout — neutral glass chip */}
          <button
            type="button"
            onClick={() => setConfirmingLogout(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold transition hover:brightness-95"
            style={{ color: gl.text, background: gl.card, border: gl.borderSm }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      {confirmingLogout && (
        <ConfirmDialog
          icon={LogOut}
          busy={loggingOut}
          title={t('confirm.logout.title')}
          body={t('confirm.logout.body')}
          confirmLabel={t('confirm.logout.confirm')}
          onConfirm={handleLogout}
          onClose={() => setConfirmingLogout(false)}
        />
      )}

      {/* #main skip-link target — the pages inside render their own <main> */}
      <div id="main" tabIndex={-1} className="flex min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
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
