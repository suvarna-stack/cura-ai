// ============================================================
// useAgentChat — the ask/answer core of the AI Agent, without a
// page around it.
//
// Extracted for the in-case dock (CaseAgentDock): streaming with
// a blocking fallback, a Stop button, and best-effort persistence
// into the same /api/agent/conversations history the Agent page
// lists. It deliberately does NOT carry Suggest & Learn — teaching
// a rule is a deliberate act that belongs on the full Agent page,
// so the dock only asks questions.
//
// AgentPage still owns its own copy of this flow; it also routes
// teach-vs-ask, renders note cards and reopens stored conversations,
// and folding those in here would have meant rewriting the page.
// ============================================================
import { useCallback, useRef, useState } from 'react'
import {
  agentErrorMessage,
  appendMessages,
  createConversation,
  sendAgentMessage,
  streamAgentMessage,
  type AgentReply,
} from '../api/agentService'
import type { AgentChatTurn, AgentMessage, ChatMode } from '../types/agent.types'
import { HISTORY_BUDGET } from '../utils/caseContext'

let uid = 1

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export interface UseAgentChatOptions {
  /** which agent surface this is — persisted with the conversation */
  mode?: ChatMode
  /** answer length cap; the dock stays short, it is a lookup not an essay */
  maxNewTokens?: number
  /** error text shown as an agent bubble when everything fails */
  errorText: string
  /** prefix for the stored conversation's title, e.g. "VN 680001" */
  titlePrefix?: string
}

export interface AgentChat {
  messages: AgentMessage[]
  /** question sent, nothing streamed back yet */
  pending: boolean
  /** an answer is streaming (Stop is meaningful) */
  streaming: boolean
  busy: boolean
  /**
   * Ask a question. `context` is prepended to the history the API sees and is
   * never rendered — it is passed per call (not held in the hook) so the
   * caller can decide, at click time, what the agent may see.
   */
  send: (text: string, context?: AgentChatTurn[]) => void
  stop: () => void
  reset: () => void
  /** Put a message in the thread without asking anything; returns its id. */
  append: (m: Omit<AgentMessage, 'id' | 'time'>) => number
  /** Rewrite one message in place — a draft card becoming its receipt. */
  patch: (id: number, next: Partial<AgentMessage>) => void
  remove: (id: number) => void
  /**
   * Persist an exchange this hook did not run itself (Suggest & Learn stores
   * a taught rule, not an answer), so a dock conversation reads back whole.
   */
  record: (question: string, answer: string) => void
}

export function useAgentChat(opts: UseAgentChatOptions): AgentChat {
  const { mode = 'dict', maxNewTokens = 224, errorText, titlePrefix } = opts

  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [pending, setPending] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // the conversation this dock session appends to; created on first exchange
  const convoIdRef = useRef<number | null>(null)

  /** Persist one Q/A pair. Best effort: the coder already has the answer. */
  const persist = useCallback(
    async (question: string, reply: AgentReply) => {
      try {
        let id = convoIdRef.current
        if (id === null) {
          const base = titlePrefix ? `${titlePrefix} · ${question}` : question
          const created = await createConversation(
            mode,
            base.length > 60 ? base.slice(0, 57) + '…' : base,
          )
          id = created.id
          convoIdRef.current = id
        }
        await appendMessages(id, [
          { role: 'user', content: question },
          {
            role: 'assistant',
            content: reply.answer,
            sources: reply.sources,
            unverified_codes: reply.unverifiedCodes,
          },
        ])
      } catch (err) {
        console.warn('agent history save failed', err)
      }
    },
    [mode, titlePrefix],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    convoIdRef.current = null
    setMessages([])
  }, [])

  const send = useCallback(
    (raw: string, context: AgentChatTurn[] = []) => {
      const text = raw.trim()
      if (!text || busyRef.current) return
      busyRef.current = true

      // RAG keeps only the last chat_history_turns turns and slices from the
      // END, so the grounding pair has to be paid for out of the same budget
      // — otherwise it falls off the back of a long conversation unnoticed.
      const budget = context.length > 0 ? HISTORY_BUDGET : HISTORY_BUDGET + 2
      const history: AgentChatTurn[] = [
        ...context,
        ...messages
          .filter((m) => m.text.trim() !== '')
          .map((m) => ({
            role: m.role === 'coder' ? ('user' as const) : ('assistant' as const),
            content: m.text,
          }))
          .slice(-budget),
      ]

      setMessages((prev) => [
        ...prev,
        { id: uid++, role: 'coder', text, time: now() },
      ])
      setPending(true)
      setStreaming(false)

      const agentId = uid++
      const upsert = (m: AgentMessage) =>
        setMessages((prev) =>
          prev.some((x) => x.id === agentId)
            ? prev.map((x) => (x.id === agentId ? m : x))
            : [...prev, m],
        )
      const fail = (err: unknown) =>
        setMessages((prev) => [
          ...prev,
          {
            id: uid++,
            role: 'agent',
            text: agentErrorMessage(err, errorText),
            time: now(),
          },
        ])
      const settle = (reply: AgentReply) => {
        upsert({
          id: agentId,
          role: 'agent',
          text: reply.answer,
          sources: reply.sources,
          unverifiedCodes: reply.unverifiedCodes,
          searchedSystem: reply.searchedSystem,
          learnedNotes: reply.learnedNotes,
          time: now(),
        })
        void persist(text, reply)
      }

      const controller = new AbortController()
      abortRef.current = controller
      let streamed = false

      void (async () => {
        try {
          const reply = await streamAgentMessage(
            text,
            history,
            maxNewTokens,
            (partial) => {
              streamed = true
              setPending(false)
              setStreaming(true)
              upsert({ id: agentId, role: 'agent', text: partial, time: now() })
            },
            controller.signal,
          )
          // Stop pressed: keep the partial text, save nothing — a truncated
          // answer is not something to hand back as history later.
          if (controller.signal.aborted) {
            upsert({ id: agentId, role: 'agent', text: reply.answer, time: now() })
          } else {
            settle(reply)
          }
        } catch (err) {
          if (controller.signal.aborted) {
            // Stop pressed before the first token: the answer bubble was never
            // inserted, and re-asking through the fallback would defeat Stop.
            void 0
          } else if (streamed) {
            fail(err) // mid-answer failure — the partial text stays put
          } else {
            // Stream never started (older backend / proxy hiccup): the
            // blocking endpoint is the fallback before giving up.
            try {
              settle(await sendAgentMessage(text, history))
            } catch (err2) {
              fail(err2)
            }
          }
        } finally {
          abortRef.current = null
          busyRef.current = false
          setPending(false)
          setStreaming(false)
        }
      })()
    },
    [errorText, maxNewTokens, messages, persist],
  )

  const append = useCallback((m: Omit<AgentMessage, 'id' | 'time'>) => {
    const id = uid++
    setMessages((prev) => [...prev, { ...m, id, time: now() }])
    return id
  }, [])

  const patch = useCallback((id: number, next: Partial<AgentMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...next, time: now() } : m)),
    )
  }, [])

  const remove = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const record = useCallback(
    (question: string, answer: string) => {
      void persist(question, {
        answer,
        sources: [],
        unverifiedCodes: [],
        searchedSystem: null,
        learnedNotes: [],
      })
    },
    [persist],
  )

  return {
    messages,
    pending,
    streaming,
    busy: pending || streaming,
    send,
    stop,
    reset,
    append,
    patch,
    remove,
    record,
  }
}
