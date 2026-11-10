import type { SuggestedCode } from '../api/casesService'
import { loadCodeEdits, type StoredCode } from '../utils/caseLocal'
import { avgAiConfidence } from '../utils/codeOrigin'

/** Procedure systems (ICD-9, *-PCS) → ICD-9 column; everything else → ICD-10. */
export const isIcd9Type = (type: string) => /icd[- ]?9|pcs/i.test(type)

/**
 * ICD-10 principal-diagnosis type label ("ICD-10 Primary Diagnosis", plus any
 * legacy "Primary…" spelling). The coding guideline allows exactly ONE per
 * case, so the add/edit dialogs use this to block a second one; an ICD-9
 * "Primary" is a procedure and doesn't count.
 */
const isIcd10PrimaryType = (type: string) =>
  !isIcd9Type(type) && /primary|principal/i.test(type)

/** True when the case already carries a real (resolved) primary ICD-10 row. */
export const hasIcd10Primary = (codes: { type: string; code: string; missing?: boolean }[], exceptIdx?: number) =>
  codes.some((c, i) => i !== exceptIdx && !c.missing && c.code !== '???' && isIcd10PrimaryType(c.type))

/**
 * Detail-row (code_system, code_role) → the UI's role-bearing type label, so
 * seeded codes open the Edit dialog with the right dropdown value and keep
 * their hospital role through approve (2026-07-30). ICD-9 stays the bare
 * system — its role is always "procedure".
 */
export function codeTypeFromRole(system: string, role: string): string {
  if (isIcd9Type(system)) return system
  switch (role) {
    case 'principal_diagnosis': return 'ICD-10 Primary Diagnosis'
    case 'secondary_diagnosis': return 'ICD-10 Comorbidity'
    case 'external_cause':      return 'ICD-10 External Cause'
    case 'other':               return 'ICD-10 Other'
    default:                    return system
  }
}

export function suggestedToStored(s: SuggestedCode): StoredCode {
  return {
    code: s.code,
    type: s.system,
    desc: s.description || s.code,
    confidence: s.confidence,
    origin: 'ai',
  }
}

/** Average confidence from locally saved code edits — the RAG rows only.
 *  Hospital-imported codes are facts carrying a stamped 100, so counting them
 *  would inflate the pill into meaninglessness (2026-08-07). */
export function avgStoredConfidence(caseId: string): number | null {
  const codes = loadCodeEdits(caseId)
  if (!codes?.length) return null
  return avgAiConfidence(codes)
}

/**
 * Fill empty ICD-9 / ICD-10 columns with RAG suggestions.
 * Never overwrites codes already present for that system (iMed import or
 * coder edits). Skips duplicate code values.
 *
 * The suggestions go in HIGHEST CONFIDENCE FIRST (2026-08-25), so the top card
 * of the AI group is the model's best guess. Sorting happens here rather than
 * at render because a column displays its rows in array order: sorting the
 * saved array keeps display order and stored order identical, so a coder can
 * still drag an AI row to a different priority without it snapping back, and
 * the positional "first ICD-10 is the principal diagnosis" pick still names
 * the code the coder can see at the top.
 */
export function fillEmptySystems(
  existing: StoredCode[],
  ai: SuggestedCode[],
): StoredCode[] {
  if (!ai.length) return existing

  const has9 = existing.some((c) => isIcd9Type(c.type) && !c.missing && c.code !== '???')
  const has10 = existing.some((c) => !isIcd9Type(c.type) && !c.missing && c.code !== '???')
  const seen = new Set(existing.map((c) => c.code.toUpperCase()))

  // one ranked list for both systems — each column filters out the other's
  // rows, so interleaving here still leaves each column sorted
  const ranked = [...ai].sort((a, b) => b.confidence - a.confidence)

  const add: StoredCode[] = []
  for (const s of ranked) {
    const key = s.code.toUpperCase()
    if (seen.has(key)) continue
    const nine = isIcd9Type(s.system)
    if (nine && has9) continue
    if (!nine && has10) continue
    seen.add(key)
    add.push(suggestedToStored(s))
  }
  return add.length ? [...existing.filter((c) => c.code !== '???'), ...add, ...existing.filter((c) => c.code === '???')] : existing
}
