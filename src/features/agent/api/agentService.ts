import { apiClient } from '../../../lib/axios'
import type { AgentChatTurn } from '../types/agent.types'

/**
 * The coder AI Agent — POST /api/agent/chat (any authenticated role).
 * A RAG-grounded local LLM: answers cite the uploaded coding references and
 * follow the question's language (English or Thai). The server is stateless;
 * we re-send the visible conversation as `history` on every call.
 *
 * Latency: the model runs on CPU — answers take tens of seconds, and the
 * very first question after a server restart can take minutes while the
 * model loads. No timeout here on purpose; the page shows a thinking state.
 */

interface AgentChatResponse {
  question: string
  answer: string
  mode: string
  contexts: {
    text: string
    source: string
    /** current display filename from the RAG registry (follows renames) */
    display_name?: string
    score: number
    via: string
    metadata: Record<string, unknown>
  }[]
}

export interface AgentReply {
  answer: string
  /** deduplicated "source p.N" labels, best hits first */
  sources: string[]
}

export async function sendAgentMessage(
  question: string,
  history: AgentChatTurn[],
): Promise<AgentReply> {
  const { data } = await apiClient.post<AgentChatResponse>('/agent/chat', {
    question,
    history,
  })
  const sources: string[] = []
  for (const c of data.contexts) {
    const page = c.metadata?.page
    const name = (c.display_name || c.source).replace(/\.[^.]+$/, '')
    const label = typeof page === 'number' ? `${name} p.${page}` : name
    if (!sources.includes(label)) sources.push(label)
  }
  return { answer: data.answer, sources }
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
