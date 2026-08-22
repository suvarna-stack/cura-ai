export type ChatMode = 'learn' | 'dict'

/** One ICD code inside a taught rule, with the job the coder gave it. */
export type LearnedCode = {
  code: string
  system: 'ICD-10' | 'ICD-9'
  description: string
  /** principal = code first · secondary = add alongside · exclude = do NOT code */
  role: 'principal' | 'secondary' | 'exclude'
}

/** A coding rule the coder taught, as stored and re-indexed by the RAG side. */
export type LearnedNote = {
  id: string
  scenario: string
  codes: LearnedCode[]
  rule: string
  reason: string
  raw_text: string
  language: string
  doc_type: string | null
  active: boolean
  created_by: string
  /**
   * The author's user id — who may edit, mute or delete this rule. null on a
   * rule taught before the field existed, which falls back to `created_by`.
   */
  created_by_id: number | null
  created_at: string
  updated_at: string
  /** how many times this rule has fired in an answer */
  hits: number
  /** "llm" when the model parsed the sentence, "rules" when the fallback did */
  extraction: string
}

/** Compact form returned with an answer / suggestion for the 💡 callout. */
export type AppliedNote = {
  id: string
  summary: string
  scenario: string
  rule: string
  codes: LearnedCode[]
  created_by: string
  created_at: string
  via: string
}

export type AgentMessage = {
  id: number
  role: 'coder' | 'agent'
  text: string
  /**
   * Teaching turns render as cards instead of bubbles: 'note-draft' is the
   * confirm card ("this is what I understood"), 'note-saved' the receipt.
   */
  kind?: 'note-draft' | 'note-saved'
  /** the draft / saved rule behind a card message */
  note?: LearnedNote
  /** coder rules that fired for this answer — shown as a 💡 callout */
  learnedNotes?: AppliedNote[]
  /** deduplicated citation labels, e.g. "icd9 p.12" — agent replies only */
  sources?: string[]
  /** ICD codes the answer cites that its sources never contained */
  unverifiedCodes?: string[]
  /** which upload box retrieval searched, when the question named a system */
  searchedSystem?: 'icd10' | 'icd9cm' | null
  time: string
}

/** One prior turn sent back to the API (OpenAI-style roles). */
export type AgentChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

/** i18n keys (LanguageContext) for the three starter chips per mode. */
export const CHIP_KEYS: Record<ChatMode, string[]> = {
  learn: ['agent.chip.learn.0', 'agent.chip.learn.1', 'agent.chip.learn.2'],
  dict: ['agent.chip.dict.0', 'agent.chip.dict.1', 'agent.chip.dict.2'],
}

/** Starter chips shown while the composer is in teaching mode. */
export const TEACH_CHIP_KEYS = [
  'agent.chip.teach.0',
  'agent.chip.teach.1',
  'agent.chip.teach.2',
]

/** An empty draft, for the "add a rule by hand" path in the rules panel. */
export const EMPTY_NOTE: LearnedNote = {
  id: '',
  scenario: '',
  codes: [],
  rule: '',
  reason: '',
  raw_text: '',
  language: 'en',
  doc_type: null,
  active: true,
  created_by: '',
  created_by_id: null,
  created_at: '',
  updated_at: '',
  hits: 0,
  extraction: '',
}
