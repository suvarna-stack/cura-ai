import { createContext, useContext } from 'react'
import {
  DEFAULT_CASE_FIELDS,
  type CaseFieldSettings,
} from '../api/caseFieldSettingsService'

/**
 * The admin's case-list field switches, fetched once per session.
 *
 * Context-free default is the safe one (VN + HN, no name), so a component
 * that somehow renders outside the provider shows the same thing a failed
 * fetch would — never a field the hospital chose to hide.
 */
export const CaseFieldsCtx = createContext<CaseFieldSettings>(DEFAULT_CASE_FIELDS)

export function useCaseFields(): CaseFieldSettings {
  return useContext(CaseFieldsCtx)
}
