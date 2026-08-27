import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import type { LearnedCode, LearnedNote } from '../types/agent.types'

const ROLES: LearnedCode['role'][] = ['principal', 'secondary', 'exclude']

/** ICD-10 ("E11.22") or ICD-9 procedure ("47.09") shape. */
const CODE_RE = /^([A-Z]\d{2}(\.\d{1,4})?|\d{2,3}\.\d{1,2})$/

function systemOf(code: string): LearnedCode['system'] {
  return /^[A-Z]/.test(code) ? 'ICD-10' : 'ICD-9'
}

/**
 * The confirm card of Suggest & Learn: what the AI understood from the
 * coder's sentence, shown BEFORE anything is stored. Every field is editable,
 * because the whole point is that a human signs off on the rule that is about
 * to start influencing suggestions — a wrong code caught here costs a click,
 * caught later it costs a chart.
 */
export function LearnedNoteCard({
  note,
  saving,
  onSave,
  onDiscard,
}: {
  note: LearnedNote
  saving: boolean
  onSave: (note: LearnedNote) => void
  onDiscard: () => void
}) {
  const { gl } = useTheme()
  const { t } = useLang()
  const [draft, setDraft] = useState<LearnedNote>(note)
  const [editing, setEditing] = useState(false)
  const [newCode, setNewCode] = useState('')

  const roleColor = (role: LearnedCode['role']) =>
    role === 'exclude' ? gl.danger : role === 'principal' ? gl.accent : gl.muted

  function addCode() {
    const code = newCode.trim().toUpperCase()
    if (!CODE_RE.test(code) || draft.codes.some((c) => c.code === code)) return
    setDraft({
      ...draft,
      codes: [
        ...draft.codes,
        { code, system: systemOf(code), description: '', role: 'secondary' },
      ],
    })
    setNewCode('')
  }

  function setRole(code: string, role: LearnedCode['role']) {
    setDraft({
      ...draft,
      codes: draft.codes.map((c) => (c.code === code ? { ...c, role } : c)),
    })
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="flex gap-3">
      <span
        className="w-12 shrink-0 pt-1 text-[10px] font-bold tracking-wider"
        style={{ color: gl.muted }}
      >
        {label}
      </span>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[12px] outline-none"
          style={{
            background: gl.inputBg,
            border: gl.borderSm,
            color: gl.text,
          }}
        />
      ) : (
        <span className="flex-1 text-[12px]" style={{ color: gl.text }}>
          {value || <span style={{ color: gl.muted }}>—</span>}
        </span>
      )}
    </div>
  )

  return (
    <div
      className="flex max-w-[92%] flex-col gap-2.5 rounded-2xl px-4 py-3.5"
      style={{
        background: gl.card,
        backdropFilter: gl.blur20,
        border: `1px solid rgba(${gl.accentRgb},0.35)`,
        boxShadow: gl.shadow,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-bold tracking-wide"
          style={{ color: gl.accent }}
        >
          🧠 {t('agent.learn.card.title')}
        </span>
        {draft.extraction === 'rules' && (
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold"
            style={{ background: gl.row, color: gl.muted }}
            title={t('agent.learn.card.rulesHint')}
          >
            {t('agent.learn.card.rules')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="hover-glow ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-all"
          style={{ background: gl.row, border: gl.borderSm, color: gl.muted }}
        >
          {editing ? <Check size={11} /> : <Pencil size={11} />}
          {editing ? t('agent.learn.done') : t('agent.learn.edit')}
        </button>
      </div>

      {field(
        t('agent.learn.when'),
        draft.scenario,
        (v) => setDraft({ ...draft, scenario: v }),
        t('agent.learn.when.ph'),
      )}

      <div className="flex gap-3">
        <span
          className="w-12 shrink-0 pt-1 text-[10px] font-bold tracking-wider"
          style={{ color: gl.muted }}
        >
          {t('agent.learn.codes')}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {draft.codes.length === 0 && (
            <span className="text-[12px]" style={{ color: gl.muted }}>
              —
            </span>
          )}
          {draft.codes.map((c) => (
            <div key={c.code} className="flex items-center gap-2">
              <span
                className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold"
                style={{
                  background: `rgba(${gl.accentRgb},0.12)`,
                  color: roleColor(c.role),
                  textDecoration:
                    c.role === 'exclude' ? 'line-through' : 'none',
                }}
              >
                {c.code}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[11px]"
                style={{ color: gl.muted }}
                title={c.description}
              >
                {c.description || c.system}
              </span>
              {editing ? (
                <>
                  <select
                    value={c.role}
                    onChange={(e) =>
                      setRole(c.code, e.target.value as LearnedCode['role'])
                    }
                    className="shrink-0 rounded-md px-1 py-0.5 text-[10px] outline-none"
                    style={{
                      background: gl.inputBg,
                      border: gl.borderSm,
                      color: gl.text,
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`agent.learn.role.${r}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={t('agent.learn.removeCode')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        codes: draft.codes.filter((x) => x.code !== c.code),
                      })
                    }
                    className="hover-glow hover-glow-halo shrink-0 transition-all"
                    style={{ color: gl.danger }}
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              ) : (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold"
                  style={{
                    background: gl.row,
                    color: roleColor(c.role),
                  }}
                >
                  {t(`agent.learn.role.${c.role}`)}
                </span>
              )}
            </div>
          ))}
          {editing && (
            <div className="flex items-center gap-2">
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCode()
                  }
                }}
                placeholder={t('agent.learn.addCode')}
                className="w-28 rounded-lg px-2 py-1 font-mono text-[11px] outline-none"
                style={{
                  background: gl.inputBg,
                  border: gl.borderSm,
                  color: gl.text,
                }}
              />
              <button
                type="button"
                onClick={addCode}
                className="hover-glow flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-all"
                style={{
                  background: gl.row,
                  border: gl.borderSm,
                  color: gl.muted,
                }}
              >
                <Plus size={10} />
              </button>
            </div>
          )}
        </div>
      </div>

      {field(
        t('agent.learn.rule'),
        draft.rule,
        (v) => setDraft({ ...draft, rule: v }),
        t('agent.learn.rule.ph'),
      )}
      {(editing || draft.reason) &&
        field(
          t('agent.learn.reason'),
          draft.reason,
          (v) => setDraft({ ...draft, reason: v }),
          t('agent.learn.reason.ph'),
        )}

      <div
        className="mt-0.5 flex items-center gap-2 border-t pt-2.5"
        style={{ borderColor: `rgba(${gl.accentRgb},0.18)` }}
      >
        <span className="text-[10px]" style={{ color: gl.muted }}>
          {t('agent.learn.willApply')}
        </span>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="hover-glow ml-auto flex items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all disabled:opacity-50"
          style={{ background: gl.row, border: gl.borderSm, color: gl.muted }}
        >
          <X size={11} />
          {t('agent.learn.discard')}
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={
            saving || (draft.codes.length === 0 && !draft.scenario.trim())
          }
          className="hover-glow flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all disabled:opacity-50"
          style={{
            background: gl.accentGrad,
            color: gl.isDark ? '#1a0a00' : '#fff',
            boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.35)`,
          }}
        >
          <Check size={12} />
          {saving ? t('agent.learn.saving') : t('agent.learn.save')}
        </button>
      </div>
    </div>
  )
}
