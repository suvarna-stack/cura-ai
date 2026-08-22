// ============================================================
// Case grounding for the in-case AI dock.
//
// The chat API takes {question, history} and nothing else, so a
// case is handed to the model the only way the contract allows:
// as a synthetic FIRST exchange in `history`. That placement is
// deliberate —
//
//   * the RAG side language-routes on `question` alone
//     (_is_thai), and a Thai hospital record pasted into the
//     question would force every English question into Thai;
//   * it also routes ICD-10 vs ICD-9 retrieval on `question`
//     alone (detect_code_system), and a context block naming
//     both systems would collapse that to "mixed";
//   * on the FIRST question RAG prepends the previous user turn
//     to the vector query, so the case's own clinical words do
//     reach retrieval — which is exactly what we want.
//
// RAG keeps the last `chat_history_turns` (8) turns, slicing from
// the END, so the caller must budget: the context pair costs two
// turns and the real conversation is trimmed to the remaining six
// (see HISTORY_BUDGET). Otherwise the grounding silently falls off
// the back of a long chat.
// ============================================================
import type { AgentChatTurn } from '../types/agent.types'
import type { ApiCaseDetail } from '../../cases/types/api.types'
import type { StoredCode } from '../../cases/utils/caseLocal'

/** RAG's chat_history_turns (8) minus the two turns the context pair costs. */
export const HISTORY_BUDGET = 6

/** Everything the dock needs to describe the case it is sitting on. */
export interface CaseAgentContext {
  caseId: string
  vn?: string
  hn?: string | null
  dept?: string
  detail: ApiCaseDetail | null
  /** the working code list as the coder currently sees it */
  codes: StoredCode[]
}

/** Narrative sections worth sending, in the order a coder reads them. */
const NARRATIVE = [
  'Chief Complaint',
  'Present Illness',
  'Physical Examination',
  'Assessment',
  'Subjective',
  'Objective',
  'Plan',
]

const clip = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s

const isIcd9 = (type: string) => /icd[- ]?9|pcs/i.test(type)

/** "I21.09 — ST elevation myocardial infarction" (description trimmed). */
function codeLine(k: StoredCode): string {
  const desc = (k.desc ?? '').split(' · ')[0].trim()
  return desc ? `${k.code} — ${clip(desc, 90)}` : k.code
}

/**
 * The case as a short briefing. Capped hard (~1600 chars): this text also
 * becomes part of the first retrieval query, and a wall of hospital prose
 * buries the coder's actual question in the vector search.
 */
export function buildCaseBriefing(ctx: CaseAgentContext): string {
  const lines: string[] = []
  const ident = [
    `VN ${ctx.vn ?? ctx.caseId}`,
    ctx.hn ? `HN ${ctx.hn}` : null,
    ctx.dept,
    ctx.detail?.case?.encountertype ?? null,
  ]
    .filter(Boolean)
    .join(' · ')
  lines.push(`Visit: ${ident}`)

  const secs = ctx.detail?.sections ?? []
  for (const field of NARRATIVE) {
    const hit = secs.find((s) => s.fieldname === field && s.value?.trim())
    if (hit?.value) lines.push(`${field}: ${clip(hit.value.trim(), 320)}`)
  }

  const icd10 = ctx.codes.filter((k) => !k.missing && !isIcd9(k.type))
  const icd9 = ctx.codes.filter((k) => !k.missing && isIcd9(k.type))
  if (icd10.length > 0)
    lines.push(`ICD-10 currently on the case: ${icd10.slice(0, 8).map(codeLine).join('; ')}`)
  if (icd9.length > 0)
    lines.push(`ICD-9 currently on the case: ${icd9.slice(0, 8).map(codeLine).join('; ')}`)
  if (icd10.length === 0 && icd9.length === 0)
    lines.push('No codes on the case yet.')

  return clip(lines.join('\n'), 1600)
}

/**
 * The briefing as the two history turns RAG will read. Nothing here is ever
 * rendered in the chat — the coder sees only what they typed.
 */
export function buildCaseContextTurns(ctx: CaseAgentContext): AgentChatTurn[] {
  return [
    {
      role: 'user',
      content:
        'I am reviewing this patient case in the coding dashboard. Use it as ' +
        'the background for my questions.\n\n' +
        buildCaseBriefing(ctx),
    },
    {
      role: 'assistant',
      content:
        'Understood — I have this case in front of me and will answer with it in mind.',
    },
  ]
}

/** One-line summary for the context chip above the composer. */
export function contextChipLabel(ctx: CaseAgentContext): string {
  const n = ctx.codes.filter((k) => !k.missing).length
  return [`VN ${ctx.vn ?? ctx.caseId}`, ctx.dept, n > 0 ? `${n} codes` : null]
    .filter(Boolean)
    .join(' · ')
}
