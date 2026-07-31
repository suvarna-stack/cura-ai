import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ThemeCtx, useThemeProvider } from './ThemeContext'
import { LanguageProvider } from './LanguageProvider'
import { SyncProvider } from './SyncProvider'
import { ApprovalsProvider } from './ApprovalsProvider'
import { ActivityLogProvider } from './ActivityLogProvider'
import { ToastCtx } from './ToastContext'

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; logId: string }>
  >([])

  const showToast = useCallback((message: string, logId = '') => {
    setToasts((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        message,
        logId,
      },
    ])
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1))
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [toasts])

  const current = toasts[0]

  return (
    <ToastCtx.Provider value={{ showToast }}>
      {children}
      {/* the live region stays mounted (screen readers often miss regions that
          appear together with their first message); only the text comes and goes */}
      <div
        role="status"
        aria-live="polite"
        className={
          current
            ? 'pointer-events-none fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-text shadow-card'
            : 'sr-only'
        }
      >
        {current?.message}
      </div>
    </ToastCtx.Provider>
  )
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const { themeId, setThemeId, gl, theme } = useThemeProvider()
  return (
    <ThemeCtx.Provider value={{ themeId, setThemeId, gl }}>
      <div
        // h-dvh, not h-full: nothing above (#root/body/html) carries a height,
        // so h-full collapsed to content height and every internal scroll area
        // (report panel, code columns' pinned "+ Add code" foot) stopped working
        className="flex h-dvh min-h-0 w-full flex-col overflow-hidden"
        style={
          {
            ...theme.bg,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            // keyboard focus ring (index.css :focus-visible) — text color always
            // contrasts with the theme background, so the ring does too
            '--focus-ring': gl.text,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </ThemeCtx.Provider>
  )
}

/** Feature-scoped providers for the coder cases UI. */
export function CasesProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SyncProvider>
          <ApprovalsProvider>
            <ActivityLogProvider>
              <ToastProvider>{children}</ToastProvider>
            </ActivityLogProvider>
          </ApprovalsProvider>
        </SyncProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
