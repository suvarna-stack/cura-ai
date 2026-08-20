export type ChatMode = 'learn' | 'dict'

export type AgentMessage = {
  id: number
  role: 'coder' | 'agent'
  text: string
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
