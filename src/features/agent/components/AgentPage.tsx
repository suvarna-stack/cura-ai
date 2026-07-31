import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bot, User, Send, Sparkles, BookOpen, Brain } from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import {
  fetchAgentSeedExample,
  sendAgentMessage,
} from '../api/agentService'
import type {
  AgentMessage,
  AgentSeedExample,
  ChatMode,
} from '../types/agent.types'
import { CHIPS, WELCOME } from '../types/agent.types'

let uid = 1
const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const msg = (
  role: AgentMessage['role'],
  text: string,
  learned = false,
): AgentMessage => ({ id: uid++, role, text, learned, time: now() })

function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{p}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export function AgentPage() {
  const { gl } = useTheme()
  const [mode, setMode] = useState<ChatMode>('learn')
  const [convo, setConvo] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [replyIdx, setReplyIdx] = useState(0)
  const [seed, setSeed] = useState<AgentSeedExample | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAgentSeedExample()
      .then((s) => {
        if (!cancelled) setSeed(s)
      })
      .catch(() => {
        if (!cancelled) setSeed(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const headerMsgs = useMemo<AgentMessage[]>(() => {
    const msgs: AgentMessage[] = [
      { id: -1, role: 'agent', text: WELCOME[mode], time: '' },
    ]
    if (seed) {
      msgs.push({
        id: -2,
        role: 'agent',
        time: '',
        text: `For example, a recent case: **CC:** ${seed.cc} | **PI:** ${seed.pi} — was coded as **${seed.code}** (${seed.role.replace(/_/g, ' ')}). Would you like to discuss this coding decision?`,
      })
    }
    return msgs
  }, [mode, seed])

  const messages = [...headerMsgs, ...convo]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convo.length, mode])

  function switchMode(next: ChatMode) {
    if (next === mode) return
    setMode(next)
    setConvo([])
    setReplyIdx(0)
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text) return
    setInput('')
    setConvo((prev) => [...prev, msg('coder', text)])
    try {
      const { reply, nextReplyIdx } = await sendAgentMessage(
        mode,
        text,
        replyIdx,
      )
      setReplyIdx(nextReplyIdx)
      setConvo((prev) => [
        ...prev,
        msg('agent', reply, mode === 'learn'),
      ])
    } catch {
      setConvo((prev) => [
        ...prev,
        msg('agent', 'Sorry — the agent is unavailable right now.'),
      ])
    }
  }

  const modeTabs: { id: ChatMode; label: string; icon: typeof Brain }[] = [
    { id: 'learn', label: '🧠 Suggest & Learn', icon: Brain },
    { id: 'dict', label: '📖 Code Dictionary', icon: BookOpen },
  ]

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header
        className="flex shrink-0 items-center gap-3 px-6 py-4"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          WebkitBackdropFilter: gl.blur20,
          borderBottom: gl.borderSm,
        }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{
            background: gl.card,
            backdropFilter: gl.blur16,
            border: gl.border,
          }}
        >
          <Bot size={18} style={{ color: gl.accent }} />
        </div>
        <div>
          <h1
            className="text-[17px] font-bold"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: gl.text,
            }}
          >
            AI Agent
          </h1>
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: gl.success }}
            />
            <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
              {mode === 'learn'
                ? 'Suggest & Learn · trained on approved cases'
                : 'Code Dictionary · ICD-9 reference'}
            </p>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 gap-2 px-6 pt-4">
        {modeTabs.map((tab) => {
          const active = tab.id === mode
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              className="rounded-full px-4 py-2 text-[12px] font-bold transition-all hover:opacity-90"
              style={
                active
                  ? {
                      background: gl.accentGrad,
                      color: '#fff',
                      boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.30)`,
                    }
                  : {
                      background: gl.inputBg,
                      color: gl.muted,
                      border: gl.borderSm,
                    }
              }
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
        style={{ scrollbarWidth: 'none' } as CSSProperties}
      >
        <div
          className="mx-auto flex max-w-xl items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{
            background: gl.card,
            backdropFilter: gl.blur20,
            border: gl.border,
          }}
        >
          <Sparkles
            size={13}
            className="shrink-0"
            style={{ color: gl.accent }}
          />
          <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
            {mode === 'learn'
              ? "Describe a patient's condition and the agent suggests ICD-9 codes learned from your hospital's approved cases."
              : 'Look up definitions, check code correctness, and validate primary/comorbidity sequences.'}
          </p>
        </div>

        {messages.map((m) => {
          const isAgent = m.role === 'agent'
          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}
            >
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={
                  isAgent
                    ? {
                        background: gl.card,
                        backdropFilter: gl.blur16,
                        border: gl.border,
                      }
                    : {
                        background: `rgba(${gl.accentRgb},0.18)`,
                        border: `1px solid rgba(${gl.accentRgb},0.30)`,
                      }
                }
              >
                {isAgent ? (
                  <Bot size={14} style={{ color: gl.accent }} />
                ) : (
                  <User size={13} style={{ color: gl.accent }} />
                )}
              </div>

              <div
                className={`flex max-w-[68%] flex-col gap-1.5 ${isAgent ? '' : 'items-end'}`}
              >
                <div
                  className="px-4 py-3 text-[13px] leading-relaxed"
                  style={
                    isAgent
                      ? {
                          background: gl.card,
                          backdropFilter: gl.blur20,
                          border: gl.border,
                          borderRadius: '4px 18px 18px 18px',
                          color: gl.text,
                          boxShadow: gl.shadowSm,
                        }
                      : {
                          background: `rgba(${gl.accentRgb},0.14)`,
                          backdropFilter: gl.blur16,
                          border: `1px solid rgba(${gl.accentRgb},0.24)`,
                          borderRadius: '18px 4px 18px 18px',
                          color: gl.text,
                        }
                  }
                >
                  <RichText text={m.text} />
                </div>

                {m.learned && (
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      color: gl.accent,
                      border: `1px solid rgba(${gl.accentRgb},0.35)`,
                      background: `rgba(${gl.accentRgb},0.06)`,
                    }}
                  >
                    📚 AI learned this case
                  </span>
                )}

                {m.time !== '' && (
                  <span
                    className="px-1 text-[11px] font-normal"
                    style={{ color: gl.muted }}
                  >
                    {m.time}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className="flex shrink-0 gap-2 overflow-x-auto px-6 pb-2"
        style={{ scrollbarWidth: 'none' } as CSSProperties}
      >
        {CHIPS[mode].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => void send(p)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all hover:opacity-80"
            style={{
              background: gl.row,
              backdropFilter: gl.blur16,
              border: gl.borderSm,
              color: gl.muted,
            }}
          >
            {p.length > 64 ? p.slice(0, 61) + '…' : p}
          </button>
        ))}
      </div>

      <div className="shrink-0 px-6 pt-2 pb-6">
        <div
          className="flex items-end gap-3 rounded-2xl px-4 py-3"
          style={{
            background: gl.card,
            backdropFilter: gl.blur20,
            border: gl.border,
            boxShadow: gl.shadow,
          }}
        >
          <div
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `rgba(${gl.accentRgb},0.22)`,
              border: `1px solid rgba(${gl.accentRgb},0.32)`,
            }}
          >
            <User size={12} style={{ color: gl.accent }} />
          </div>
          <textarea
            aria-label="Message the AI agent"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={
              mode === 'learn'
                ? "Describe the patient's condition for ICD-9 suggestions…"
                : 'Ask about an ICD-9 code, definition, or sequence…'
            }
            rows={2}
            className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none"
            style={{ color: gl.text }}
          />
          <button
            type="button"
            onClick={() => void send()}
            aria-label="Send message"
            disabled={!input.trim()}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all"
            style={
              input.trim()
                ? {
                    background: gl.accentGrad,
                    color: gl.isDark ? '#1a0a00' : '#fff',
                    boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.35)`,
                  }
                : {
                    background: gl.isDark
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.07)',
                    color: gl.muted,
                  }
            }
          >
            <Send size={13} />
          </button>
        </div>
        <p
          className="mt-2 text-center text-[11px] font-normal"
          style={{ color: gl.muted }}
        >
          <kbd
            className="rounded-md px-1.5 py-0.5 text-[10px]"
            style={{
              background: gl.row,
              border: gl.borderSm,
              color: gl.muted,
            }}
          >
            Enter
          </kbd>{' '}
          to send {' · '}
          <kbd
            className="rounded-md px-1.5 py-0.5 text-[10px]"
            style={{
              background: gl.row,
              border: gl.borderSm,
              color: gl.muted,
            }}
          >
            Shift + Enter
          </kbd>{' '}
          for new line
        </p>
      </div>
    </main>
  )
}
