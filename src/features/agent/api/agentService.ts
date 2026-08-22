import { apiClient } from '../../../lib/axios'
import { API_BASE_URL } from '../../../config/env'
import type {
  AgentChatTurn,
  AppliedNote,
  LearnedNote,
} from '../types/agent.types'

/**
 * The coder AI Agent — POST /api/agent/chat[/stream] (any authenticated role).
 * A RAG-grounded local LLM: answers cite the uploaded coding references and
 * follow the question's language (English or Thai). The server is stateless;
 * we re-send the visible conversation as `history` on every call.
 *
 * Streaming is the primary path (first words in seconds, answer types out);
 * the blocking call is kept as a fallback for older backends.
 */

interface AgentContext {
  text: string
  source: string
  /** current display filename from the RAG registry (follows renames) */
  display_name?: string
  score: number
  via: string
  metadata: Record<string, unknown>
}

interface AgentChatResponse {
  question: string
  answer: string
  mode: string
  contexts: AgentContext[]
  /** codes the answer cites that appear in no retrieved chunk */
  unverified_codes?: string[]
  /** which upload box retrieval was routed to, when the question named one */
  code_system?: 'icd10' | 'icd9cm' | null
  /** coder-taught rules (Suggest & Learn) that matched and shaped this answer */
  learned_notes?: AppliedNote[]
}

type AgentStreamEvent =
  | { type: 'meta'; mode: string; contexts: AgentContext[]
      code_system?: 'icd10' | 'icd9cm' | null
      learned_notes?: AppliedNote[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; unverified_codes?: string[] }
  | { type: 'error'; message: string }

export interface AgentReply {
  answer: string
  /** deduplicated "source p.N" labels, best hits first */
  sources: string[]
  /** ICD codes the answer cites that its sources never contained */
  unverifiedCodes: string[]
  /** the upload box retrieval was routed to, or null when both were searched */
  searchedSystem: 'icd10' | 'icd9cm' | null
  /** coder rules that fired for this answer — rendered as a 💡 callout */
  learnedNotes: AppliedNote[]
}

function sourceLabels(contexts: AgentContext[]): string[] {
  const sources: string[] = []
  for (const c of contexts) {
    const page = c.metadata?.page
    const name = c.source.startsWith('learned:')
      ? c.display_name || 'Coder note'
      : (c.display_name || c.source).replace(/\.[^.]+$/, '')
    const label = typeof page === 'number' ? `${name} p.${page}` : name
    if (!sources.includes(label)) sources.push(label)
  }
  return sources
}

export async function sendAgentMessage(
  question: string,
  history: AgentChatTurn[],
): Promise<AgentReply> {
  const { data } = await apiClient.post<AgentChatResponse>('/agent/chat', {
    question,
    history,
  })
  return {
    answer: data.answer,
    sources: sourceLabels(data.contexts),
    unverifiedCodes: data.unverified_codes ?? [],
    searchedSystem: data.code_system ?? null,
    learnedNotes: data.learned_notes ?? [],
  }
}

/**
 * Streaming variant. `onDelta` receives the ACCUMULATED answer text after
 * each piece, so the caller just re-renders the message with it. Resolves
 * with the final reply once the terminal event arrives.
 *
 * Uses fetch (axios has no streaming body support); mirrors the axios
 * interceptor's auth header + 401 handling.
 *
 * `signal` powers the Stop button: aborting mid-answer is not an error —
 * the reader stops and we resolve with whatever had already streamed, so
 * the caller keeps the partial reply instead of losing it.
 */
export async function streamAgentMessage(
  question: string,
  history: AgentChatTurn[],
  maxNewTokens: number,
  onDelta: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<AgentReply> {
  const token = localStorage.getItem('token')
  const resp = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, history, max_new_tokens: maxNewTokens }),
    signal,
  })
  if (resp.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('authUser')
    if (window.location.pathname !== '/login') window.location.assign('/login')
    throw new Error('unauthorized')
  }
  if (!resp.ok || !resp.body) {
    throw new Error(`stream unavailable (${resp.status})`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  let sources: string[] = []
  let unverifiedCodes: string[] = []
  let searchedSystem: 'icd10' | 'icd9cm' | null = null
  let learnedNotes: AppliedNote[] = []

  const handle = (ev: AgentStreamEvent) => {
    if (ev.type === 'delta') {
      answer += ev.text
      onDelta(answer)
    } else if (ev.type === 'meta') {
      sources = sourceLabels(ev.contexts)
      searchedSystem = ev.code_system ?? null
      learnedNotes = ev.learned_notes ?? []
    } else if (ev.type === 'done') {
      unverifiedCodes = ev.unverified_codes ?? []
    } else {
      throw new Error(ev.message)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const data = frame
          .split('\n')
          .find((l) => l.startsWith('data: '))
        if (data) handle(JSON.parse(data.slice(6)) as AgentStreamEvent)
      }
    }
  } catch (err) {
    // Stop pressed — keep the partial answer; anything else is a real failure.
    if (!signal?.aborted) throw err
  }
  return { answer: answer.trim(), sources, unverifiedCodes, searchedSystem,
           learnedNotes }
}

/** Human-readable message from an Axios error (the API's {"error": ...}). */
export function agentErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response
      ?.data
    if (data?.error) return data.error
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Conversation history — /api/agent/conversations (per-user, DB-backed).
// The chat call above stays stateless; these endpoints only persist what the
// user already saw, one user+assistant pair after each successful exchange.

export interface ConversationSummary {
  id: number
  mode: 'dict' | 'learn'
  title: string
  created_at: string
  updated_at: string
}

export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  sources: string[]
  unverified_codes: string[]
  /** "yyyy-MM-dd HH:mm:ss" server time */
  created_at: string
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[]
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const { data } = await apiClient.get<{ conversations: ConversationSummary[] }>(
    '/agent/conversations',
  )
  return data.conversations
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const { data } = await apiClient.get<ConversationDetail>(
    `/agent/conversations/${id}`,
  )
  return data
}

export async function createConversation(
  mode: 'dict' | 'learn',
  title: string,
): Promise<ConversationSummary> {
  const { data } = await apiClient.post<ConversationSummary>(
    '/agent/conversations',
    { mode, title },
  )
  return data
}

export async function appendMessages(
  id: number,
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    sources?: string[]
    unverified_codes?: string[]
  }>,
): Promise<void> {
  await apiClient.post(`/agent/conversations/${id}/messages`, { messages })
}

export async function deleteConversation(id: number): Promise<void> {
  await apiClient.delete(`/agent/conversations/${id}`)
}

// ---------------------------------------------------------------------------
// Suggest & Learn — /api/agent/learn/**.
// The coder teaches a rule in plain language; the AI extracts it, the coder
// confirms it, and it becomes an extra layer the RAG retrieval reads on top
// of the uploaded ICD references. Nothing here trains model weights: every
// rule stays visible, attributable, mutable and deletable.

/** Does this chat message read as a rule, or as a question? Advisory only. */
export async function classifyIntent(
  text: string,
): Promise<{ intent: 'teach' | 'ask'; confidence: number }> {
  const { data } = await apiClient.post<{
    intent: 'teach' | 'ask'
    confidence: number
  }>('/agent/learn/classify', { text })
  return data
}

/** Plain language -> draft rule for the confirm card. Stores nothing. */
export async function extractNote(text: string): Promise<LearnedNote> {
  const { data } = await apiClient.post<LearnedNote>('/agent/learn/extract', {
    text,
  })
  return data
}

/** Save a confirmed (or edited) draft; it starts affecting answers at once. */
export async function saveNote(note: LearnedNote): Promise<LearnedNote> {
  const { data } = await apiClient.post<LearnedNote>('/agent/learn/notes', {
    note,
  })
  return data
}

export async function listNotes(): Promise<LearnedNote[]> {
  const { data } = await apiClient.get<{ notes: LearnedNote[] }>(
    '/agent/learn/notes',
  )
  return data.notes
}

/** Mute (or un-mute) a rule without losing it. */
export async function toggleNote(
  id: string,
  active: boolean,
): Promise<LearnedNote> {
  const { data } = await apiClient.patch<LearnedNote>(
    `/agent/learn/notes/${id}?active=${active}`,
  )
  return data
}

export async function deleteNote(id: string): Promise<void> {
  await apiClient.delete(`/agent/learn/notes/${id}`)
}

/** Which taught rules apply to this narrative? (case page callout) */
export async function matchNotes(
  text: string,
  limit = 3,
): Promise<AppliedNote[]> {
  const { data } = await apiClient.post<{ notes: AppliedNote[] }>(
    '/agent/learn/match',
    { text, limit },
  )
  return data.notes
}
