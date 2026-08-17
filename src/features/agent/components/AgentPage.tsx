import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bot, User, Send, Sparkles, BookOpen, Brain, Lightbulb } from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import {
  agentErrorMessage,
  sendAgentMessage,
  streamAgentMessage,
} from '../api/agentService'
import type {
  AgentChatTurn,
  AgentMessage,
  ChatMode,
} from '../types/agent.types'
import { CHIP_KEYS } from '../types/agent.types'

let uid = 1
const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const msg = (
  role: AgentMessage['role'],
  text: string,
  sources?: string[],
): AgentMessage => ({ id: uid++, role, text, sources, time: now() })

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
  const { t } = useLang()
  const [mode, setMode] = useState<ChatMode>('dict')
  const [convo, setConvo] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const headerMsgs = useMemo<AgentMessage[]>(
    () => [{ id: -1, role: 'agent', text: t(`agent.welcome.${mode}`), time: '' }],
    [mode, t],
  )

  const messages = [...headerMsgs, ...convo]

  // Depends on `convo` (not just its length) so the view follows the answer
  // while it streams into an existing message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convo, pending, mode])

  function switchMode(next: ChatMode) {
    if (next === mode || pending) return
    setMode(next)
    setConvo([])
    setShowSuggestions(true)
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || pending) return
    // The visible conversation IS the history — map to API roles.
    const history: AgentChatTurn[] = convo.map((m) => ({
      role: m.role === 'coder' ? 'user' : 'assistant',
      content: m.text,
    }))
    setInput('')
    setPending(true)
    setConvo((prev) => [...prev, msg('coder', text)])

    // Streaming: the agent bubble appears on the first delta and grows as
    // the model types. Dictionary answers are capped shorter — they should
    // be an entry + a sentence, and shorter = faster on CPU hosts.
    const agentId = uid++
    let streamed = false
    const upsert = (m: AgentMessage) =>
      setConvo((prev) =>
        prev.some((x) => x.id === agentId)
          ? prev.map((x) => (x.id === agentId ? m : x))
          : [...prev, m],
      )
    try {
      const reply = await streamAgentMessage(
        text,
        history,
        mode === 'dict' ? 224 : 320,
        (partial) => {
          streamed = true
          setPending(false)
          upsert({ id: agentId, role: 'agent', text: partial, time: now() })
        },
      )
      upsert({
        id: agentId,
        role: 'agent',
        text: reply.answer,
        sources: reply.sources,
        unverifiedCodes: reply.unverifiedCodes,
        time: now(),
      })
    } catch (err) {
      if (streamed) {
        // Mid-answer failure: keep the partial text, append the error note.
        setConvo((prev) => [
          ...prev,
          msg('agent', agentErrorMessage(err, t('agent.error'))),
        ])
      } else {
        // Stream never started (older backend / proxy hiccup) — fall back to
        // the blocking endpoint before giving up.
        try {
          const reply = await sendAgentMessage(text, history)
          upsert({
            id: agentId,
            role: 'agent',
            text: reply.answer,
            sources: reply.sources,
            unverifiedCodes: reply.unverifiedCodes,
            time: now(),
          })
        } catch (err2) {
          setConvo((prev) => [
            ...prev,
            msg('agent', agentErrorMessage(err2, t('agent.error'))),
          ])
        }
      }
    } finally {
      setPending(false)
    }
  }

  const modeTabs: { id: ChatMode; label: string; icon: typeof Brain }[] = [
    { id: 'dict', label: t('agent.tab.dict'), icon: BookOpen },
    { id: 'learn', label: t('agent.tab.learn'), icon: Brain },
  ]

  return (
    // The shell locks itself to the viewport on this route (CasesLayout), so
    // the messages list below is the only thing that scrolls.
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className="flex shrink-0 items-center gap-3 px-6 py-2.5"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          WebkitBackdropFilter: gl.blur20,
          borderBottom: gl.borderSm,
        }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-2xl"
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
              {t(`agent.subtitle.${mode}`)}
            </p>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 gap-2">
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
      </header>

      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6"
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
            {t(`agent.hint.${mode}`)}
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
                  className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap"
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

                {m.sources && m.sources.length > 0 && (
                  <span
                    className="max-w-full truncate px-1 text-[10px] font-medium"
                    style={{ color: gl.muted }}
                    title={m.sources.join(' · ')}
                  >
                    {t('agent.sources')}: {m.sources.join(' · ')}
                  </span>
                )}

                {m.unverifiedCodes && m.unverifiedCodes.length > 0 && (
                  <span
                    className="max-w-full px-1 text-[10px] font-medium"
                    style={{ color: gl.warning }}
                    role="note"
                  >
                    ⚠ {m.unverifiedCodes.join(', ')} — {t('agent.unverified')}
                  </span>
                )}

                {m.time !== '' && (
                  <span
                    className="px-1 text-[12px] font-normal"
                    style={{ color: gl.muted }}
                  >
                    {m.time}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {pending && (
          <div className="flex gap-3">
            <div
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                background: gl.card,
                backdropFilter: gl.blur16,
                border: gl.border,
              }}
            >
              <Bot size={14} style={{ color: gl.accent }} />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-3 text-[12px]"
              style={{
                background: gl.card,
                backdropFilter: gl.blur20,
                border: gl.border,
                borderRadius: '4px 18px 18px 18px',
                color: gl.muted,
                boxShadow: gl.shadowSm,
              }}
              role="status"
              aria-live="polite"
            >
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{
                      background: gl.accent,
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </span>
              {t('agent.thinking')}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="shrink-0"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          WebkitBackdropFilter: gl.blur20,
          borderTop: gl.borderSm,
        }}
      >
      <div className="relative shrink-0 px-6 pt-3 pb-3">
        {showSuggestions && (
          <div
            className="absolute inset-x-6 bottom-full z-10 mb-2 flex flex-wrap gap-2 rounded-2xl p-3"
            style={{
              background: gl.card,
              backdropFilter: gl.blur20,
              WebkitBackdropFilter: gl.blur20,
              border: gl.border,
              boxShadow: gl.shadow,
            }}
          >
            {CHIP_KEYS[mode].map((key) => {
              const p = t(key)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setShowSuggestions(false)
                    void send(p)
                  }}
                  className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: gl.row,
                    backdropFilter: gl.blur16,
                    border: gl.borderSm,
                    color: gl.muted,
                  }}
                >
                  {p.length > 64 ? p.slice(0, 61) + '…' : p}
                </button>
              )
            })}
          </div>
        )}

        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
          style={{
            background: gl.card,
            backdropFilter: gl.blur20,
            border: gl.border,
            boxShadow: gl.shadow,
          }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
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
            placeholder={t(`agent.placeholder.${mode}`)}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] leading-relaxed outline-none"
            style={{ color: gl.text }}
          />
          <button
            type="button"
            aria-label="Toggle suggested questions"
            aria-expanded={showSuggestions}
            onClick={() => setShowSuggestions((s) => !s)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all hover:opacity-80"
            style={
              showSuggestions
                ? {
                    background: `rgba(${gl.accentRgb},0.18)`,
                    border: `1px solid rgba(${gl.accentRgb},0.30)`,
                    color: gl.accent,
                  }
                : { color: gl.muted }
            }
          >
            <Lightbulb size={14} />
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || pending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all"
            style={
              input.trim() && !pending
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
        {showSuggestions && (
        <p
          className="mt-1.5 text-center text-[12px] font-normal"
          style={{ color: gl.muted }}
        >
          <kbd
            className="rounded-md px-1.5 py-0.5 text-[12px]"
            style={{
              background: gl.row,
              border: gl.borderSm,
              color: gl.muted,
            }}
          >
            Enter
          </kbd>{' '}
          {t('agent.enter')} {' · '}
          <kbd
            className="rounded-md px-1.5 py-0.5 text-[12px]"
            style={{
              background: gl.row,
              border: gl.borderSm,
              color: gl.muted,
            }}
          >
            Shift + Enter
          </kbd>{' '}
          {t('agent.shiftEnter')}
        </p>
        )}
      </div>
      </div>
    </main>
  )
}
