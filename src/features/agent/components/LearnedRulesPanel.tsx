import { BellOff, Bell, Lock, Trash2, X } from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import type { LearnedNote } from '../types/agent.types'

/**
 * Everything this hospital has taught the agent, in one reviewable list.
 *
 * This panel is the audit trail that makes Suggest & Learn safe to use: who
 * taught what, how often it has fired, and one click to mute a rule that has
 * started doing the wrong thing. Muting keeps the rule visible but pulls its
 * chunk out of the index; deleting forgets it entirely.
 *
 * Everyone reads every rule — a shared knowledge layer is the point — but the
 * mute and delete buttons appear only on rules the signed-in coder may act on
 * (`canManage`, mirroring the server's own rule). On someone else's rule they
 * are replaced by a lock, so it reads as "not yours" rather than as a button
 * that quietly 403s.
 */
export function LearnedRulesPanel({
  notes,
  loading,
  busyId,
  canManage,
  onToggle,
  onDelete,
  onClose,
}: {
  notes: LearnedNote[]
  loading: boolean
  busyId: string | null
  /** may the signed-in coder mute/delete this rule? (author or admin) */
  canManage: (note: LearnedNote) => boolean
  onToggle: (note: LearnedNote) => void
  onDelete: (note: LearnedNote) => void
  onClose: () => void
}) {
  const { gl } = useTheme()
  const { t } = useLang()

  return (
    <aside
      className="flex w-80 shrink-0 flex-col overflow-hidden"
      style={{
        background: gl.headerBg,
        backdropFilter: gl.blur20,
        WebkitBackdropFilter: gl.blur20,
        borderLeft: gl.borderSm,
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span
          className="text-[12px] font-bold tracking-wide"
          style={{ color: gl.text }}
        >
          🧠 {t('agent.learn.rules')} ({notes.length})
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('agent.learn.rules.close')}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:opacity-80"
          style={{ color: gl.muted }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {loading && (
          <p className="px-1 text-[11px]" style={{ color: gl.muted }}>
            {t('agent.learn.rules.loading')}
          </p>
        )}
        {!loading && notes.length === 0 && (
          <p
            className="px-1 text-[11px] leading-relaxed"
            style={{ color: gl.muted }}
          >
            {t('agent.learn.rules.empty')}
          </p>
        )}

        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-xl px-3 py-2.5"
            style={{
              background: gl.card,
              border: gl.borderSm,
              opacity: note.active ? 1 : 0.55,
            }}
          >
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: gl.text }}
            >
              {note.scenario || note.raw_text}
            </p>

            {note.codes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {note.codes.map((c) => (
                  <span
                    key={c.code}
                    className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
                    style={{
                      background: `rgba(${gl.accentRgb},0.12)`,
                      color: c.role === 'exclude' ? gl.danger : gl.accent,
                      textDecoration:
                        c.role === 'exclude' ? 'line-through' : 'none',
                    }}
                    title={c.description || c.system}
                  >
                    {c.code}
                  </span>
                ))}
              </div>
            )}

            {note.rule && (
              <p className="mt-1.5 text-[10px]" style={{ color: gl.muted }}>
                {note.rule}
              </p>
            )}

            <div className="mt-2 flex items-center gap-2">
              <span className="text-[9px]" style={{ color: gl.muted }}>
                {note.created_by || '—'} · {(note.created_at || '').slice(0, 10)}
                {note.hits > 0 && ` · ${t('agent.learn.used')} ${note.hits}×`}
              </span>
              {canManage(note) ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === note.id}
                    onClick={() => onToggle(note)}
                    title={
                      note.active
                        ? t('agent.learn.mute')
                        : t('agent.learn.unmute')
                    }
                    aria-label={
                      note.active
                        ? t('agent.learn.mute')
                        : t('agent.learn.unmute')
                    }
                    className="ml-auto shrink-0 transition-all hover:opacity-70 disabled:opacity-40"
                    style={{ color: note.active ? gl.muted : gl.accent }}
                  >
                    {note.active ? <BellOff size={12} /> : <Bell size={12} />}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === note.id}
                    onClick={() => onDelete(note)}
                    title={t('agent.learn.forget')}
                    aria-label={t('agent.learn.forget')}
                    className="shrink-0 transition-all hover:opacity-70 disabled:opacity-40"
                    style={{ color: gl.danger }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              ) : (
                <span
                  title={t('agent.learn.readonly')}
                  aria-label={t('agent.learn.readonly')}
                  className="ml-auto flex shrink-0 items-center"
                  style={{ color: gl.muted }}
                >
                  <Lock size={12} aria-hidden="true" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
