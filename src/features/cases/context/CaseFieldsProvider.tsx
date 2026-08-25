import { useEffect, useState, type ReactNode } from 'react'
import { CaseFieldsCtx } from './CaseFieldsContext'
import {
  DEFAULT_CASE_FIELDS,
  fetchCaseFieldSettings,
  type CaseFieldSettings,
} from '../api/caseFieldSettingsService'

/**
 * Fetches the admin's field switches once, when the coder workspace mounts.
 *
 * No refetch and no polling: this is site policy that changes once in a blue
 * moon, and a list whose columns rearrange mid-review would be worse than one
 * that needs a reload after an admin flips a switch.
 *
 * A failed request keeps the defaults rather than blocking the workspace —
 * the case list is the job, the field policy is a detail of how it is drawn.
 */
export function CaseFieldsProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<CaseFieldSettings>(DEFAULT_CASE_FIELDS)

  useEffect(() => {
    let cancelled = false
    void fetchCaseFieldSettings()
      .then((next) => {
        if (!cancelled) setFields(next)
      })
      .catch(() => {
        // keep DEFAULT_CASE_FIELDS: showing VN + HN is what every hospital
        // that has not touched the switches gets anyway
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <CaseFieldsCtx.Provider value={fields}>{children}</CaseFieldsCtx.Provider>
}
