import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart2,
  Bot,
  Settings,
  LogOut,
  RefreshCw,
} from 'lucide-react'
import { ConfirmDialog } from './global/ConfirmDialog'
import { CuraLockup } from '../../../components/brand/CuraMark'
import { CuraSpinner } from '../../../components/brand/CuraSpinner'
import { DateRangeDialog } from './global/DateRangeDialog'
import type { DateRange } from '../utils/dateRange'
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
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { syncing, requestSync } = useSync()
  // Sync moved up here from the Dashboard's date bar (2026-08-25) so it sits
  // beside the account chip and is reachable from every page, not just the
  // list. Picking the period is the first step; SyncProvider still asks for
  // confirmation after, because a sync re-pulls hospital records.
  const [syncPickerOpen, setSyncPickerOpen] = useState(false)
  const location = useLocation()
  const { pathname } = location
  // The agent page is a chat: lock the shell to the viewport so only its
  // message list scrolls. Every other page keeps normal document scrolling.
  const chatShell = pathname.startsWith('/agent')
  // The top nav is a tab bar, so the Dashboard tab keeps its own stack: a case
  // the coder has open is remembered while they detour to Agent / Analytics /
  // Settings, and Dashboard brings that case back instead of dropping them on
  // the list with their place lost. Clicking Dashboard from *inside* the case
  // section still pops to the list (tab-bar convention) — same as Back does.
  // The memory lives only in this component; the case itself loses nothing by
  // being left, since code edits are held by utils/caseLocal + the server.
  const inCases = pathname === '/cases' || pathname.startsWith('/cases/')
  const onCaseDetail = inCases && pathname !== '/cases'
  const here = `${pathname}${location.search}`
  const [openCase, setOpenCase] = useState<{
    to: string
    state: unknown
  } | null>(() =>
    // mounting straight on a case (deep link, reload) counts as open too
    onCaseDetail ? { to: here, state: location.state } : null,
  )
  const [seen, setSeen] = useState(here)
  if (seen !== here) {
    setSeen(here) // render-phase update, same as hooks/useCaseDetail does
    if (onCaseDetail) setOpenCase({ to: here, state: location.state })
    else if (inCases) setOpenCase(null) // back on the list: nothing open now
  }

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
        <div className="mr-6">
          <CuraLockup
            markSize={20}
            wordSize={14}
            tone={gl.isDark ? 'dark' : 'light'}
          />
        </div>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV.map((item) => {
            // resume the open case only from another tab — never while the
            // coder is already in it, where Dashboard means "back to the list"
            const resume =
              item.to === '/cases' && !onCaseDetail ? openCase : null
            return (
              <NavLink
                key={item.to}
                to={resume?.to ?? item.to}
                state={resume?.state}
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
            )
          })}
        </nav>

        {/* sync + logged-in coder + logout (coders never see the admin sidebar) */}
        <div className="ml-auto flex items-center gap-2">
          {/* the one action in the header, so it carries the accent */}
          <button
            type="button"
            onClick={() => setSyncPickerOpen(true)}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold transition hover:brightness-110 disabled:opacity-60"
            style={{
              background: gl.accentGrad,
              color: gl.isDark ? '#1a0a00' : '#fff',
            }}
          >
            {syncing ? (
              <CuraSpinner
                variant="label"
                size={16}
                tone="dark"
                label={t('sync.syncing')}
              />
            ) : (
              <RefreshCw size={14} />
            )}
            {syncing ? t('sync.syncing') : t('sync.button')}
          </button>
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

      {syncPickerOpen && (
        <DateRangeDialog
          value={null}
          title={t('sync.period')}
          confirmLabel={t('sync.button')}
          allLabel="Everything"
          onApply={(r: DateRange | null) =>
            requestSync(r ? { from: r.from, to: r.to } : undefined)
          }
          onClose={() => setSyncPickerOpen(false)}
        />
      )}

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
