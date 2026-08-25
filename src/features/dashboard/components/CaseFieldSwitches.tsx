import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { Card } from '../../../components/ui/Card'
import {
  DEFAULT_CASE_FIELDS,
  fetchCaseFieldSettings,
  updateCaseFieldSettings,
  type CaseFieldSettings,
} from '../../cases/api/caseFieldSettingsService'

/** One switch per field, in the order the coder reads them off a card. */
const FIELDS: {
  key: keyof CaseFieldSettings
  label: string
  hint: string
}[] = [
  {
    key: 'vn',
    label: 'Visit number (VN)',
    hint: 'The iMed transaction number. This is what a case is identified by everywhere else in the system.',
  },
  {
    key: 'hn',
    label: 'Hospital number (HN)',
    hint: 'iMed only fills HN for admissions, so OPD cases show it as “—”. Turning it off hides the row entirely instead.',
  },
  {
    key: 'name',
    label: 'Patient name',
    hint: 'No name exists in the hospital extract yet, so this shows a placeholder until iMed starts sending one.',
  },
]

/**
 * Administrator control over which identifier fields the coder case list
 * shows (2026-08-25).
 *
 * Global, not per account: two coders looking at the same list must see the
 * same fields, or "the HN is missing" becomes unanswerable over the phone.
 *
 * The switch governs DISPLAY only — the case payload still carries every
 * value, because case detail, search and the audit trail need them. Say so on
 * screen, so nobody reads these as a privacy control they are not.
 *
 * Saves immediately on toggle. A failed write rolls the switch back, so what
 * is on screen is always what the server actually holds.
 */
export function CaseFieldSwitches() {
  const [fields, setFields] = useState<CaseFieldSettings>(DEFAULT_CASE_FIELDS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<keyof CaseFieldSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchCaseFieldSettings()
      .then((next) => {
        if (!cancelled) setFields(next)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the current settings.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (key: keyof CaseFieldSettings) => {
    if (busy) return
    const next = !fields[key]
    const before = fields
    setFields({ ...fields, [key]: next }) // optimistic
    setBusy(key)
    setError(null)
    void updateCaseFieldSettings({ [key]: next })
      .then(setFields)
      .catch(() => {
        setFields(before) // never leave a switch showing a state that did not save
        setError('That change did not save. Try again.')
      })
      .finally(() => setBusy(null))
  }

  return (
    <Card padded={false} className="mb-8 overflow-hidden shadow-none">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-primary" />
          <h2 className="text-[14px] font-bold text-text">Case list fields</h2>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Which identifiers every coder sees on the case list. Display only —
          the data is still used for search, case detail and the audit trail.
        </p>
      </div>

      <div className="divide-y divide-border/60">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text">{f.label}</p>
              <p className="mt-0.5 text-[12px] text-muted">{f.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fields[f.key]}
              aria-label={f.label}
              disabled={loading || busy !== null}
              onClick={() => toggle(f.key)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                fields[f.key] ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${
                  fields[f.key] ? 'left-[1.375rem]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="px-5 pb-4 text-[12px] font-semibold text-error">
          {error}
        </p>
      )}
    </Card>
  )
}
