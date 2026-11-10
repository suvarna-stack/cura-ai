import { apiClient } from '../../../lib/axios'

/**
 * Which identifier fields the case list may show. Site policy set by an
 * administrator (2026-08-25), stored globally on the server — never per
 * browser, because two coders looking at the same list must see the same
 * fields.
 *
 * These govern DISPLAY only. The payload still carries every value: case
 * detail, search and the audit trail all need them.
 */
export interface CaseFieldSettings {
  vn: boolean
  hn: boolean
  /** Off by default — no patient name exists in the hospital extract yet
   *  (open Data-Mapping question Q1). The switch is here so it can be turned
   *  on the day iMed starts sending one, without a release. */
  name: boolean
}

/** What to render before the request lands, and if it fails: the two fields
 *  that always have data, and no name. Deliberately not "everything on" —
 *  a failed fetch must not flash a field the hospital turned off. */
export const DEFAULT_CASE_FIELDS: CaseFieldSettings = {
  vn: true,
  hn: true,
  name: false,
}

/** GET /api/case-field-settings — any signed-in account. */
export async function fetchCaseFieldSettings(): Promise<CaseFieldSettings> {
  const { data } = await apiClient.get<CaseFieldSettings>('/case-field-settings')
  return data
}

/**
 * PUT /api/admin/case-field-settings — admin only. Send just the switches you
 * are changing; omitted keys keep their value. Returns the full object.
 */
export async function updateCaseFieldSettings(
  changes: Partial<CaseFieldSettings>,
): Promise<CaseFieldSettings> {
  const { data } = await apiClient.put<CaseFieldSettings>(
    '/admin/case-field-settings',
    changes,
  )
  return data
}
