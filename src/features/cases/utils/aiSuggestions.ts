import type { SuggestedCode } from '../api/casesService'
import { loadCodeEdits, type StoredCode } from '../utils/caseLocal'

/** Procedure systems (ICD-9, *-PCS) → ICD-9 column; everything else → ICD-10. */
export const isIcd9Type = (type: string) => /icd[- ]?9|pcs/i.test(type)

export function suggestedToStored(s: SuggestedCode): StoredCode {
  return {
    code: s.code,
    type: s.system,
    desc: s.description || s.code,
    confidence: s.confidence,
  }
}

/** Average confidence from locally saved code edits (RAG suggestions / coder scores). */
export function avgStoredConfidence(caseId: string): number | null {
  const codes = loadCodeEdits(caseId)
  if (!codes?.length) return null
  const scored = codes.filter((c) => !c.missing && typeof c.confidence === 'number')
  if (!scored.length) return null
  return Math.round(scored.reduce((s, c) => s + c.confidence, 0) / scored.length)
}

/**
 * Fill empty ICD-9 / ICD-10 columns with RAG suggestions.
 * Never overwrites codes already present for that system (iMed import or
 * coder edits). Skips duplicate code values.
 */
export function fillEmptySystems(
  existing: StoredCode[],
  ai: SuggestedCode[],
): StoredCode[] {
  if (!ai.length) return existing

  const has9 = existing.some((c) => isIcd9Type(c.type) && !c.missing && c.code !== '???')
  const has10 = existing.some((c) => !isIcd9Type(c.type) && !c.missing && c.code !== '???')
  const seen = new Set(existing.map((c) => c.code.toUpperCase()))

  const add: StoredCode[] = []
  for (const s of ai) {
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
