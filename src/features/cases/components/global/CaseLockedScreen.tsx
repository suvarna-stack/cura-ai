// ============================================================
// Shown instead of a case detail page when another coder holds
// the case's working lock: who has it, and the one action that
// makes sense (back to the dashboard). The lock frees itself
// ~90s after the holder leaves, so "try again shortly" is true.
// ============================================================
import { Lock } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'

export function CaseLockedScreen({
  caseId,
  holderName,
  onBack,
}: {
  caseId: string
  holderName: string
  onBack: () => void
}) {
  const { gl } = useTheme()
  const { t } = useLang()
  return (
    <main
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center"
      style={{ color: gl.text }}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}
      >
        <Lock size={24} />
      </div>
      <p className="text-[15px] font-bold">{t('case.locked.title')}</p>
      <p
        className="mt-1.5 max-w-md text-[13px] leading-relaxed"
        style={{ color: gl.muted }}
      >
        {t('case.locked.by')} <strong style={{ color: gl.text }}>{holderName}</strong>
        {' · '}
        {t('case.locked.case')} {caseId}
      </p>
      <p className="mt-1 text-[12px]" style={{ color: gl.muted }}>
        {t('case.locked.hint')}
      </p>
      <button
        onClick={onBack}
        className="mt-4 rounded-lg px-4 py-2 text-[12px] font-bold transition-all hover:opacity-90"
        style={{
          background: `rgba(${gl.accentRgb},0.12)`,
          color: gl.accent,
          border: `1px solid rgba(${gl.accentRgb},0.25)`,
        }}
      >
        {t('case.locked.back')}
      </button>
    </main>
  )
}
