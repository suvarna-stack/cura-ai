import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart2,
  Bot,
  Settings,
  Cpu,
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useLang } from '../context/LanguageContext'
import { CasesProviders } from '../context/CasesProviders'

const NAV = [
  { to: '/cases', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: false },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart2, end: true },
  { to: '/agent', labelKey: 'nav.agent', icon: Bot, end: true },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, end: true },
]

function CoderShell() {
  const { gl } = useTheme()
  const { t } = useLang()

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
