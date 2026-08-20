import { apiClient } from '../../../lib/axios'
import { API_BASE_URL } from '../../../config/env'
import type { AgentChatTurn } from '../types/agent.types'

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
}

type AgentStreamEvent =
  | { type: 'meta'; mode: string; contexts: AgentContext[]
      code_system?: 'icd10' | 'icd9cm' | null }
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
}

function sourceLabels(contexts: AgentContext[]): string[] {
  const sources: string[] = []
  for (const c of contexts) {
    const page = c.metadata?.page
    const name = (c.display_name || c.source).replace(/\.[^.]+$/, '')
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
  }
}

/**
 * Streaming variant. `onDelta` receives the ACCUMULATED answer text after
 * each piece, so the caller just re-renders the message with it. Resolves
 * with the final reply once the terminal event arrives.
 *
 * Uses fetch (axios has no streaming body support); mirrors the axios
 * interceptor's auth header + 401 handling.
 */
export async function streamAgentMessage(
  question: string,
  history: AgentChatTurn[],
  maxNewTokens: number,
  onDelta: (accumulated: string) => void,
): Promise<AgentReply> {
  const token = localStorage.getItem('token')
  const resp = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ question, history, max_new_tokens: maxNewTokens }),
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

  const handle = (ev: AgentStreamEvent) => {
    if (ev.type === 'delta') {
      answer += ev.text
      onDelta(answer)
    } else if (ev.type === 'meta') {
      sources = sourceLabels(ev.contexts)
      searchedSystem = ev.code_system ?? null
    } else if (ev.type === 'done') {
      unverifiedCodes = ev.unverified_codes ?? []
    } else {
      throw new Error(ev.message)
    }
  }

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
  return { answer: answer.trim(), sources, unverifiedCodes, searchedSystem }
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
