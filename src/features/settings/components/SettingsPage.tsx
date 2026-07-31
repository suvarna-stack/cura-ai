import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useEffect, useState, type CSSProperties } from 'react'
import {
  Sun,
  Moon,
  Palette,
  User,
  Check,
  RotateCcw,
  Languages,
} from 'lucide-react'
import { useTheme, themes } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import type { Lang } from '../../cases/context/LanguageContext'
import { GlassCard } from '../../cases/components/global/GlassCard'
import type { ThemeId } from '../../cases/types/theme.types'
import {
  fetchApprovedCaseIds,
  fetchCoderProfile,
  resetDemoApprovals,
} from '../api/settingsService'
import type { CoderProfile } from '../types/settings.types'

// blank skeleton while /auth/me loads (Phase 4: mock profile is gone)
const EMPTY_PROFILE: CoderProfile = {
  fullName: '…',
  role: '',
  scope: '',
  imedUserId: '—',
}

const themeOrder: ThemeId[] = [
  'light-rose',
  'dark-rose',
  'light-green',
  'mono',
]

const langOptions: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'th', label: 'ไทย' },
]

export function SettingsPage() {
  const { gl, themeId, setThemeId } = useTheme()
  const { lang, setLang, t } = useLang()
  useDocumentTitle(t("settings.title"))

  const [profile, setProfile] = useState<CoderProfile>(EMPTY_PROFILE)
  const [approvedIds, setApprovedIds] = useState<string[]>([])
  const [resetProgress, setResetProgress] = useState<number | null>(null)
  const resetting = resetProgress !== null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [nextProfile, ids] = await Promise.all([
          fetchCoderProfile(),
          fetchApprovedCaseIds(),
        ])
        if (!cancelled) {
          setProfile(nextProfile)
          setApprovedIds(ids)
        }
      } catch {
        // keep mock / empty
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const approvedCount = approvedIds.length

  const accountRows = [
    { label: 'Full name', value: profile.fullName },
    { label: 'Role', value: profile.role },
    { label: 'Scope', value: profile.scope },
    { label: 'iMed user ID', value: profile.imedUserId },
  ]

  const resetDemo = async () => {
    setResetProgress(0)
    try {
      await resetDemoApprovals()
    } catch {
      setResetProgress(null)
    }
  }

  return (
    <main
      className="flex flex-1 flex-col overflow-auto"
      style={{ scrollbarWidth: 'none' } as CSSProperties}
    >
      <header
        className="sticky top-0 z-10 flex items-center px-6 py-3.5"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          borderBottom: gl.borderSm,
        }}
      >
        <div>
          <h1
            className="text-[19px] font-bold"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: gl.text,
            }}
          >
            {t('settings.title')}
          </h1>
          <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
            {t('settings.sub')}
          </p>
        </div>
      </header>

      <div className="max-w-2xl space-y-6 p-6">
        <GlassCard className="p-5">
          <div className="mb-5 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                background: `rgba(${gl.accentRgb},0.15)`,
                border: `1px solid rgba(${gl.accentRgb},0.25)`,
              }}
            >
              <Palette size={15} style={{ color: gl.accent }} />
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: gl.text }}>
                {t('settings.appearance')}
              </p>
              <p
                className="text-[12px] font-normal"
                style={{ color: gl.muted }}
              >
                {t('settings.appearanceSub')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {themeOrder.map((id) => {
              const theme = themes[id]
              const active = themeId === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setThemeId(id)}
                  className="relative flex flex-col gap-3 rounded-2xl p-4 text-left transition-all hover:opacity-90"
                  style={
                    active
                      ? {
                          border: `2px solid ${theme.gl.accent}`,
                          background: `rgba(${theme.gl.accentRgb},0.12)`,
                          boxShadow: `0 0 20px rgba(${theme.gl.accentRgb},0.20)`,
                        }
                      : { border: gl.border, background: gl.row }
                  }
                >
                  <div
                    className="relative h-16 w-full overflow-hidden rounded-xl"
                    style={
                      {
                        ...theme.bg,
                        backgroundSize: 'cover',
                      } as CSSProperties
                    }
                  >
                    <div className="absolute inset-0 flex items-end gap-1 p-2">
                      {theme.preview.map((c, i) => (
                        <div
                          key={i}
                          className="h-4 flex-1 rounded-md"
                          style={{ background: c, opacity: 0.85 }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p
                        className="text-[13px] font-bold"
                        style={{ color: gl.text }}
                      >
                        {theme.label}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {theme.gl.isDark ? (
                          <Moon size={9} style={{ color: gl.muted }} />
                        ) : (
                          <Sun size={9} style={{ color: gl.muted }} />
                        )}
                        <p
                          className="text-[12px] font-normal"
                          style={{ color: gl.muted }}
                        >
                          {theme.gl.isDark ? 'Dark' : 'Light'}
                        </p>
                      </div>
                    </div>
                    {active && (
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ background: theme.gl.accentGrad }}
                      >
                        <Check
                          size={11}
                          style={{
                            color: theme.gl.isDark ? '#1a0a00' : '#fff',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                background: `rgba(${gl.accentRgb},0.15)`,
                border: `1px solid rgba(${gl.accentRgb},0.25)`,
              }}
            >
              <Languages size={15} style={{ color: gl.accent }} />
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: gl.text }}>
                {t('settings.language')}
              </p>
              <p
                className="text-[12px] font-normal"
                style={{ color: gl.muted }}
              >
                {t('settings.languageSub')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {langOptions.map((o) => {
              const active = lang === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setLang(o.id)}
                  className="flex items-center justify-between rounded-2xl p-4 text-left transition-all hover:opacity-90"
                  style={
                    active
                      ? {
                          border: `2px solid ${gl.accent}`,
                          background: `rgba(${gl.accentRgb},0.12)`,
                        }
                      : { border: gl.border, background: gl.row }
                  }
                >
                  <p
                    className="text-[13px] font-bold"
                    style={{ color: gl.text }}
                  >
                    {o.label}
                  </p>
                  {active && (
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ background: gl.accentGrad }}
                    >
                      <Check
                        size={11}
                        style={{ color: gl.isDark ? '#1a0a00' : '#fff' }}
                      />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                background: `rgba(${gl.accentRgb},0.15)`,
                border: `1px solid rgba(${gl.accentRgb},0.25)`,
              }}
            >
              <User size={15} style={{ color: gl.accent }} />
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: gl.text }}>
                {t('settings.account')}
              </p>
              <p
                className="text-[12px] font-normal"
                style={{ color: gl.muted }}
              >
                {t('settings.accountSub')}
              </p>
            </div>
          </div>
          {accountRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2.5"
              style={{ borderBottom: gl.borderSm }}
            >
              <span
                className="text-[12px] font-normal"
                style={{ color: gl.muted }}
              >
                {row.label}
              </span>
              <span
                className="text-[12px] font-semibold"
                style={{ color: gl.text }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{
                background: `rgba(${gl.accentRgb},0.15)`,
                border: `1px solid rgba(${gl.accentRgb},0.25)`,
              }}
            >
              <RotateCcw size={15} style={{ color: gl.accent }} />
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: gl.text }}>
                Demo tools
              </p>
              <p
                className="text-[12px] font-normal"
                style={{ color: gl.muted }}
              >
                Reopen every approved case and return it to its original tab
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span
              className="text-[12px] font-normal"
              style={{ color: gl.muted }}
            >
              {resetting
                ? 'Resetting…'
                : approvedCount > 0
                  ? `${approvedCount} case${approvedCount === 1 ? '' : 's'} currently approved in this browser`
                  : 'No approved cases — nothing to reset'}
            </span>
            <button
              type="button"
              onClick={() => void resetDemo()}
              disabled={approvedCount === 0 || resetting}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all hover:opacity-90 disabled:opacity-40"
              style={{
                background: gl.accentGrad,
                color: gl.isDark ? '#1a0a00' : '#fff',
              }}
            >
              <RotateCcw size={12} /> Reset demo
            </button>
          </div>
        </GlassCard>
      </div>
    </main>
  )
}
