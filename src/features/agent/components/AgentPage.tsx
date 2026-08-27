import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Bot,
  User,
  Send,
  Sparkles,
  BookOpen,
  Brain,
  GraduationCap,
  Lightbulb,
  History,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import { useAuth } from '../../auth/hooks/useAuth'
import { ConfirmDialog } from '../../cases/components/global/ConfirmDialog'
import {
  agentErrorMessage,
  appendMessages,
  classifyIntent,
  createConversation,
  deleteConversation,
  deleteNote,
  extractNote,
  getConversation,
  listConversations,
  listNotes,
  saveNote,
  sendAgentMessage,
  streamAgentMessage,
  toggleNote,
  type AgentReply,
  type ConversationSummary,
} from '../api/agentService'
import type {
  AgentChatTurn,
  AgentMessage,
  ChatMode,
  LearnedNote,
} from '../types/agent.types'
import { CHIP_KEYS, TEACH_CHIP_KEYS } from '../types/agent.types'
import { isLearnBack } from '../utils/learnBack'
import { canManageNote } from '../utils/noteOwner'
import { noteLine } from '../utils/noteLine'
import { RichText } from './RichText'
import { LearnedNoteCard } from './LearnedNoteCard'
import { LearnedRulesPanel } from './LearnedRulesPanel'

let uid = 1

const now = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const msg = (
  role: AgentMessage['role'],
  text: string,
  sources?: string[],
): AgentMessage => ({ id: uid++, role, text, sources, time: now() })

/** Sidebar timestamp: HH:mm for today, else the date (server "yyyy-MM-dd HH:mm:ss"). */
function listTime(ts: string): string {
  if (!ts || ts.length < 10) return ''
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return ts.slice(0, 10) === today ? ts.slice(11, 16) : ts.slice(0, 10)
}

export function AgentPage() {
  const { gl } = useTheme()
  const { t } = useLang()
  const { user } = useAuth()
  const [mode, setMode] = useState<ChatMode>('dict')
  const [convo, setConvo] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // --- Suggest & Learn state -------------------------------------------
  // There is no separate "teach mode": the Suggest & Learn tab IS it. Every
  // message is classified — one that reads like a rule goes straight to the
  // extractor (the confirm card), a question gets its normal answer.
  const [savingNote, setSavingNote] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [notes, setNotes] = useState<LearnedNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null)
  // forgetting a rule is permanent — the panel asks before it calls forgetNote
  const [forgettingNote, setForgettingNote] = useState<LearnedNote | null>(null)

  // --- history sidebar state -------------------------------------------
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  // persistExchange runs after an async reply; a ref never reads stale state
  const activeIdRef = useRef<number | null>(null)
  // true from send() start to settle — `pending` drops on the FIRST delta, so
  // it alone can't stop the user switching conversations mid-stream
  const sendingRef = useRef(false)
  const setActive = (id: number | null) => {
    activeIdRef.current = id
    setActiveId(id)
  }

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch((err) => console.warn('agent history unavailable', err))
  }, [])

  /** The taught-rules list, loaded once and refreshed after every change. */
  function refreshNotes() {
    setNotesLoading(true)
    listNotes()
      .then(setNotes)
      .catch((err) => console.warn('learned rules unavailable', err))
      .finally(() => setNotesLoading(false))
  }

  useEffect(refreshNotes, [])

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
    if (next === mode || pending || sendingRef.current) return
    setMode(next)
    setConvo([])
    setActive(null)
    setShowSuggestions(true)
  }

  /** Fresh empty chat; the old one stays reachable from the sidebar. */
  function newChat() {
    if (pending || sendingRef.current) return
    setConvo([])
    setActive(null)
    setShowSuggestions(true)
  }

  /** Reopen a stored conversation (restores its mode too). */
  async function openConversation(id: number) {
    if (pending || sendingRef.current || loadingId !== null || id === activeId)
      return
    setLoadingId(id)
    try {
      const detail = await getConversation(id)
      setMode(detail.mode)
      setActive(id)
      setConvo(
        detail.messages.map((m) => ({
          id: uid++,
          role: m.role === 'user' ? ('coder' as const) : ('agent' as const),
          text: m.content,
          sources: m.sources.length > 0 ? m.sources : undefined,
          unverifiedCodes:
            m.unverified_codes.length > 0 ? m.unverified_codes : undefined,
          time: m.created_at ? m.created_at.slice(11, 16) : '',
        })),
      )
      setShowSuggestions(false)
    } catch (err) {
      console.warn('failed to open conversation', err)
    } finally {
      setLoadingId(null)
    }
  }

  async function removeConversation(id: number) {
    setConfirmId(null)
    try {
      await deleteConversation(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeIdRef.current === id) newChat()
    } catch (err) {
      console.warn('failed to delete conversation', err)
    }
  }

  /**
   * Persist one successful Q/A pair. First exchange of a chat creates the
   * conversation (title = the question). Failures only warn — the visible
   * chat already has the answer, history is best-effort.
   */
  async function persistExchange(
    chatMode: ChatMode,
    question: string,
    reply: AgentReply,
  ) {
    try {
      let id = activeIdRef.current
      if (id === null) {
        const title =
          question.length > 60 ? question.slice(0, 57) + '…' : question
        const created = await createConversation(chatMode, title)
        id = created.id
        setActive(id)
        setConversations((prev) => [created, ...prev])
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
      // bump the touched conversation to the top of the sidebar
      setConversations((prev) => {
        const hit = prev.find((c) => c.id === id)
        return hit ? [hit, ...prev.filter((c) => c.id !== id)] : prev
      })
    } catch (err) {
      console.warn('agent history save failed', err)
    }
  }

  /**
   * The teaching half of Suggest & Learn: the coder's sentence goes to the
   * extractor, and what comes back is a CARD, not an answer — nothing is
   * stored until they confirm it. A failed extraction is a normal agent
   * message explaining what was missing, so the chat never dead-ends.
   */
  async function teach(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || pending) return
    setInput('')
    setShowSuggestions(false)
    setPending(true)
    sendingRef.current = true
    setConvo((prev) => [...prev, msg('coder', text)])
    try {
      const draft = await extractNote(text)
      setConvo((prev) => [
        ...prev,
        { id: uid++, role: 'agent', text: '', kind: 'note-draft',
          note: draft, time: now() },
      ])
    } catch (err) {
      setConvo((prev) => [
        ...prev,
        msg('agent', agentErrorMessage(err, t('agent.learn.error'))),
      ])
    } finally {
      setPending(false)
      sendingRef.current = false
    }
  }

  /**
   * Confirmed draft -> stored rule. From here the rule is part of what
   * retrieval reads, so the receipt says so plainly. The exchange is
   * persisted as text, which is what a reopened conversation can render.
   */
  async function confirmNote(cardId: number, draft: LearnedNote) {
    setSavingNote(true)
    try {
      const saved = await saveNote(draft)
      setConvo((prev) =>
        prev.map((m) =>
          m.id === cardId
            ? { ...m, kind: 'note-saved' as const, note: saved,
                text: t('agent.learn.saved'), time: now() }
            : m,
        ),
      )
      refreshNotes()
      const taught = draft.raw_text || draft.scenario
      void persistExchange(mode, taught, {
        answer: `${t('agent.learn.saved')} — ${noteLine(saved, t)}`,
        sources: [],
        unverifiedCodes: [],
        searchedSystem: null,
        learnedNotes: [],
      })
    } catch (err) {
      setConvo((prev) => [
        ...prev,
        msg('agent', agentErrorMessage(err, t('agent.learn.error'))),
      ])
    } finally {
      setSavingNote(false)
    }
  }

  function discardNote(cardId: number) {
    setConvo((prev) => prev.filter((m) => m.id !== cardId))
  }

  /**
   * A refused change is worth a sentence in the chat. The panel only offers
   * these buttons on the coder's own rules, so a 403 here means the list is
   * stale (someone else's rule arrived after it was drawn) — silence would
   * look like the click did nothing.
   */
  function reportNoteFailure(err: unknown) {
    setConvo((prev) => [
      ...prev,
      msg('agent', agentErrorMessage(err, t('agent.learn.error.change'))),
    ])
    refreshNotes()
  }

  async function muteNote(note: LearnedNote) {
    setBusyNoteId(note.id)
    try {
      const updated = await toggleNote(note.id, !note.active)
      setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)))
    } catch (err) {
      reportNoteFailure(err)
    } finally {
      setBusyNoteId(null)
    }
  }

  async function forgetNote(note: LearnedNote) {
    setForgettingNote(null)
    setBusyNoteId(note.id)
    try {
      await deleteNote(note.id)
      setNotes((prev) => prev.filter((n) => n.id !== note.id))
    } catch (err) {
      reportNoteFailure(err)
    } finally {
      setBusyNoteId(null)
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
    if (!text || pending || sendingRef.current) return
    // Suggest & Learn is one surface: the classifier routes each message. A
    // rule ("always code X…") goes to the extractor and comes back as the
    // confirm card; anything else is answered normally. Classification is a
    // fast deterministic call — if it fails, answering is the safe default.
    // A wrong "teach" guess costs one Discard click on the draft card.
    if (mode === 'learn') {
      // "learn that" after an answer is a back-reference: the thing to teach
      // is the claim the coder just made, not the two-word command itself.
      if (isLearnBack(text)) {
        const prev = [...convo]
          .reverse()
          .find((m) => m.role === 'coder' && !isLearnBack(m.text))
        if (prev) return teach(prev.text)
      }
      sendingRef.current = true // held through the classify round-trip
      const intent = await classifyIntent(text)
        .then((r) => r.intent)
        .catch(() => 'ask' as const)
      sendingRef.current = false
      if (intent === 'teach') return teach(text)
    }
    // The visible conversation IS the history — map to API roles.
    const history: AgentChatTurn[] = convo
      .filter((m) => m.text.trim() !== '')
      .map((m) => ({
        role: m.role === 'coder' ? 'user' : 'assistant',
        content: m.text,
      }))
    setInput('')
    setPending(true)
    sendingRef.current = true
    setConvo((prev) => [...prev, msg('coder', text)])
    const modeAtSend = mode // mode can switch while the answer streams

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
        searchedSystem: reply.searchedSystem,
        learnedNotes: reply.learnedNotes,
        time: now(),
      })
      void persistExchange(modeAtSend, text, reply)
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
            searchedSystem: reply.searchedSystem,
            learnedNotes: reply.learnedNotes,
            time: now(),
          })
          void persistExchange(modeAtSend, text, reply)
        } catch (err2) {
          setConvo((prev) => [
            ...prev,
            msg('agent', agentErrorMessage(err2, t('agent.error'))),
          ])
        }
      }
    } finally {
      setPending(false)
      sendingRef.current = false
    }
  }

  const modeTabs: { id: ChatMode; label: string; icon: typeof Brain }[] = [
    { id: 'dict', label: t('agent.tab.dict'), icon: BookOpen },
    { id: 'learn', label: t('agent.tab.learn'), icon: Brain },
  ]

  return (
    // The shell locks itself to the viewport on this route (CasesLayout), so
    // the messages list and the history sidebar are the only things that
    // scroll. Row layout: [history sidebar] [chat column].
    <main className="flex min-h-0 flex-1 overflow-hidden">
      {sidebarOpen && (
        <aside
          className="flex w-64 shrink-0 flex-col overflow-hidden"
          style={{
            background: gl.headerBg,
            backdropFilter: gl.blur20,
            WebkitBackdropFilter: gl.blur20,
            borderRight: gl.borderSm,
          }}
        >
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <span
              className="text-[12px] font-bold tracking-wide"
              style={{ color: gl.text }}
            >
              {t('agent.history.title')}
            </span>
            {/* Hover deepens the accent tint instead of the `hover:opacity-80`
                this used to carry: on a translucent 0.15 accent fill, dropping
                the opacity faded the button INTO the sidebar and dimmed the +
                with it, so hovering read as "greying out" rather than
                "highlighting". Base and hover colours both go through CSS vars
                because an inline `background`/`border` would outrank the class
                a `hover:` variant compiles to. */}
            <button
              type="button"
              onClick={newChat}
              disabled={pending}
              title={t('agent.history.new')}
              aria-label={t('agent.history.new')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--nc-bd)] bg-[var(--nc-bg)] transition-colors duration-150 enabled:hover:border-[var(--nc-bd-hover)] enabled:hover:bg-[var(--nc-bg-hover)] disabled:opacity-50"
              style={
                {
                  color: gl.accent,
                  '--nc-bg': `rgba(${gl.accentRgb},0.15)`,
                  '--nc-bd': `rgba(${gl.accentRgb},0.25)`,
                  '--nc-bg-hover': `rgba(${gl.accentRgb},0.30)`,
                  '--nc-bd-hover': `rgba(${gl.accentRgb},0.50)`,
                } as CSSProperties
              }
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {conversations.length === 0 && (
              <p
                className="px-2 pt-2 text-[11px]"
                style={{ color: gl.muted }}
              >
                {t('agent.history.empty')}
              </p>
            )}
            {conversations.map((c) => {
              const active = c.id === activeId
              const ModeIcon = c.mode === 'dict' ? BookOpen : Brain
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openConversation(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void openConversation(c.id)
                  }}
                  className="group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-all hover:opacity-90"
                  style={
                    active
                      ? {
                          background: `rgba(${gl.accentRgb},0.14)`,
                          border: `1px solid rgba(${gl.accentRgb},0.24)`,
                        }
                      : { border: '1px solid transparent' }
                  }
                >
                  <ModeIcon
                    size={13}
                    className="shrink-0"
                    style={{ color: active ? gl.accent : gl.muted }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[12px] font-medium"
                      style={{ color: gl.text }}
                      title={c.title}
                    >
                      {loadingId === c.id ? t('agent.history.loading') : c.title}
                    </p>
                    <p className="text-[10px]" style={{ color: gl.muted }}>
                      {listTime(c.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`${t('agent.history.confirm')} ${c.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirmId === c.id) {
                        void removeConversation(c.id)
                      } else {
                        setConfirmId(c.id)
                      }
                    }}
                    onBlur={() => setConfirmId(null)}
                    className="shrink-0 rounded-md p-1 opacity-0 transition-all group-hover:opacity-100 focus:opacity-100 hover:opacity-100"
                    style={{
                      color: confirmId === c.id ? gl.warning : gl.muted,
                    }}
                  >
                    {confirmId === c.id ? (
                      <span className="text-[10px] font-bold">
                        {t('agent.history.confirm')}
                      </span>
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header
        className="flex shrink-0 items-center gap-3 px-6 py-2.5"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          WebkitBackdropFilter: gl.blur20,
          borderBottom: gl.borderSm,
        }}
      >
        <button
          type="button"
          aria-label={t('agent.history.title')}
          aria-expanded={sidebarOpen}
          title={t('agent.history.title')}
          onClick={() => setSidebarOpen((s) => !s)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl transition-all hover:opacity-80"
          style={
            sidebarOpen
              ? {
                  background: `rgba(${gl.accentRgb},0.15)`,
                  border: `1px solid rgba(${gl.accentRgb},0.28)`,
                  color: gl.accent,
                }
              : { background: gl.card, border: gl.border, color: gl.muted }
          }
        >
          <History size={16} />
        </button>
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

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            title={t('agent.learn.rules')}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold transition-all hover:opacity-90"
            style={
              rulesOpen
                ? {
                    background: `rgba(${gl.accentRgb},0.18)`,
                    border: `1px solid rgba(${gl.accentRgb},0.30)`,
                    color: gl.accent,
                  }
                : { background: gl.inputBg, color: gl.muted, border: gl.borderSm }
            }
          >
            <Brain size={13} />
            {notes.filter((n) => n.active).length}
          </button>
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

          // Teaching turns are cards, not bubbles: the draft the coder has to
          // confirm, and the receipt once the rule is stored.
          if (m.kind === 'note-draft' && m.note) {
            return (
              <div key={m.id} className="flex gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: gl.card,
                    backdropFilter: gl.blur16,
                    border: gl.border,
                  }}
                >
                  <GraduationCap size={14} style={{ color: gl.accent }} />
                </div>
                <LearnedNoteCard
                  note={m.note}
                  saving={savingNote}
                  onSave={(draft) => void confirmNote(m.id, draft)}
                  onDiscard={() => discardNote(m.id)}
                />
              </div>
            )
          }

          if (m.kind === 'note-saved' && m.note) {
            return (
              <div key={m.id} className="flex gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `rgba(${gl.accentRgb},0.18)`,
                    border: `1px solid rgba(${gl.accentRgb},0.30)`,
                  }}
                >
                  <GraduationCap size={14} style={{ color: gl.accent }} />
                </div>
                <div
                  className="flex max-w-[68%] flex-col gap-1 px-4 py-3"
                  style={{
                    background: `rgba(${gl.accentRgb},0.10)`,
                    border: `1px solid rgba(${gl.accentRgb},0.28)`,
                    borderRadius: '4px 18px 18px 18px',
                  }}
                >
                  <span
                    className="text-[12px] font-bold"
                    style={{ color: gl.accent }}
                  >
                    ✓ {t('agent.learn.saved')}
                  </span>
                  <span className="text-[12px]" style={{ color: gl.text }}>
                    {noteLine(m.note, t)}
                  </span>
                  <span className="text-[10px]" style={{ color: gl.muted }}>
                    {t('agent.learn.savedHint')}
                  </span>
                </div>
              </div>
            )
          }

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

                {m.learnedNotes && m.learnedNotes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {m.learnedNotes.map((n) => (
                      <span
                        key={n.id}
                        className="rounded-xl px-3 py-1.5 text-[11px] leading-relaxed"
                        style={{
                          background: `rgba(${gl.accentRgb},0.10)`,
                          border: `1px solid rgba(${gl.accentRgb},0.24)`,
                          color: gl.text,
                        }}
                        title={n.via}
                      >
                        💡 <strong>{t('agent.learn.applies')}</strong>{' '}
                        {n.summary}
                        <span style={{ color: gl.muted }}>
                          {' '}
                          — {n.created_by || t('agent.learn.aCoder')}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {m.sources && m.sources.length > 0 && (
                  <span
                    className="max-w-full truncate px-1 text-[10px] font-medium"
                    style={{ color: gl.muted }}
                    title={m.sources.join(' · ')}
                  >
                    {t('agent.sources')}: {m.sources.join(' · ')}
                  </span>
                )}

                {m.searchedSystem && (
                  <span
                    className="px-1 text-[10px] font-medium"
                    style={{ color: gl.accent, opacity: 0.85 }}
                  >
                    {t(`agent.searched.${m.searchedSystem}`)}
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
            {(mode === 'learn'
              ? [...CHIP_KEYS.learn, ...TEACH_CHIP_KEYS]
              : CHIP_KEYS.dict
            ).map((key) => {
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
          className="focus-pill flex items-center gap-3 rounded-2xl px-4 py-2.5"
          style={
            {
              background: gl.card,
              backdropFilter: gl.blur20,
              border: gl.border,
              boxShadow: gl.shadow,
              '--focus-ring': gl.accent,
            } as CSSProperties
          }
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `rgba(${gl.accentRgb},0.22)`,
              border: `1px solid rgba(${gl.accentRgb},0.32)`,
            }}
          >
            {mode === 'learn' ? (
              <GraduationCap size={12} style={{ color: gl.accent }} />
            ) : (
              <User size={12} style={{ color: gl.accent }} />
            )}
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
      </div>

      {rulesOpen && (
        <LearnedRulesPanel
          notes={notes}
          loading={notesLoading}
          busyId={busyNoteId}
          canManage={(n) => canManageNote(n, user)}
          onToggle={(n) => void muteNote(n)}
          onDelete={(n) => setForgettingNote(n)}
          onClose={() => setRulesOpen(false)}
        />
      )}

      {forgettingNote && (
        <ConfirmDialog
          icon={Trash2}
          danger
          busy={busyNoteId === forgettingNote.id}
          title={t('confirm.forgetRule.title')}
          body={t('confirm.forgetRule.body')}
          confirmLabel={t('confirm.forgetRule.confirm')}
          onConfirm={() => void forgetNote(forgettingNote)}
          onClose={() => setForgettingNote(null)}
        />
      )}
    </main>
  )
}
