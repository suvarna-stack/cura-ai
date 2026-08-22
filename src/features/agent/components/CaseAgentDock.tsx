// ============================================================
// CaseAgentDock — the AI Agent, floating on top of a case.
//
// Why it exists: ~all the coder's questions ("is I21.09 right
// here?", "does this need a procedure code?") are questions
// ABOUT THE CASE THEY ARE READING, and answering them meant
// leaving the case for /agent and losing the record. The dock
// keeps the record and the answer on screen together.
//
// Shape follows what in-app assistants have converged on:
//   * never auto-opens — a launcher pill, a header entry point on
//     the case, or ⌘/Ctrl+Shift+A;
//   * FLOAT (a card in the corner) for a quick lookup, RAIL (a
//     full-height right panel, 320–680px) for a long back-and-forth
//     — floating windows are fine to glance at, bad to work in;
//   * a context chip above the composer that says exactly what the
//     agent can see, and lets the coder switch that grounding off;
//   * a Stop button, because an answer you can't interrupt is worse
//     than a slow one.
//
// Both it and the launcher sit clear of the bottom-right toast lane
// (ToastProvider is fixed bottom-4 at z-50) and below the modal
// layer, so nothing this app already shows lands underneath it.
// ============================================================
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  Sparkles,
  Square,
  User,
  X,
} from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { useLang } from '../../cases/context/LanguageContext'
import { useAgentChat } from '../hooks/useAgentChat'
import { RichText } from './RichText'
import {
  buildCaseContextTurns,
  contextChipLabel,
  type CaseAgentContext,
} from '../utils/caseContext'

type DockMode = 'float' | 'rail'

interface DockPrefs {
  mode: DockMode
  w: number
  h: number
  /** send the case briefing with every question */
  ground: boolean
}

const PREFS_KEY = 'mcai.caseDock'
const DEFAULT_PREFS: DockPrefs = { mode: 'float', w: 420, h: 560, ground: true }
const MIN_W = 320
const MAX_W = 680
const MIN_H = 320
/** height reserved at the bottom-right for the app's toast (fixed bottom-4). */
const TOAST_LANE = 72
/** fallback for the app header's height until #main can be measured. */
const HEADER_FALLBACK = 52

function loadPrefs(): DockPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = JSON.parse(raw) as Partial<DockPrefs>
    return {
      mode: p.mode === 'rail' ? 'rail' : 'float',
      w: clamp(Number(p.w) || DEFAULT_PREFS.w, MIN_W, MAX_W),
      h: Math.max(Number(p.h) || DEFAULT_PREFS.h, MIN_H),
      ground: p.ground !== false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

const isIcd9 = (type: string) => /icd[- ]?9|pcs/i.test(type)

export interface CaseAgentDockProps {
  ctx: CaseAgentContext
}

export function CaseAgentDock({ ctx }: CaseAgentDockProps) {
  const { gl } = useTheme()
  const { t } = useLang()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<DockPrefs>(loadPrefs)
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  // the app header's height, so RAIL mode starts below it instead of
  // guessing — #main is the shell's content region (CasesLayout)
  const [headerTop, setHeaderTop] = useState(HEADER_FALLBACK)

  const dockRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const chat = useAgentChat({
    mode: 'dict',
    maxNewTokens: 256,
    errorText: t('agent.error'),
    titlePrefix: `VN ${ctx.vn ?? ctx.caseId}`,
  })
  const { reset } = chat

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs])

  // A different case is a different conversation — carrying the old one over
  // would silently mix two patients' context in one thread. Compared during
  // render (the pattern useCaseDetail / CasesLayout already use) rather than
  // in an effect, so the stale thread never paints.
  const [prevCaseId, setPrevCaseId] = useState(ctx.caseId)
  if (prevCaseId !== ctx.caseId) {
    setPrevCaseId(ctx.caseId)
    reset()
    setInput('')
  }

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // RAIL mode starts under the app header, so its height has to be real, not
  // guessed — #main is the shell's content region (CasesLayout).
  const measureHeader = useCallback(() => {
    setHeaderTop(
      document.getElementById('main')?.getBoundingClientRect().top ??
        HEADER_FALLBACK,
    )
  }, [])

  useEffect(() => {
    window.addEventListener('resize', measureHeader)
    return () => window.removeEventListener('resize', measureHeader)
  }, [measureHeader])

  // Follow the answer as it streams, but never yank the view back when the
  // coder has scrolled up to re-read something. Scrolls the list itself
  // rather than scrollIntoView, which would also move the page behind it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chat.messages, chat.pending, open])

  // ⌘/Ctrl+Shift+A anywhere on the case toggles the dock. Escape closes it
  // only while focus is INSIDE it — the case page's own dialogs own Escape
  // when they are the thing the coder is looking at.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        measureHeader()
        setOpen((o) => !o)
        return
      }
      if (
        e.key === 'Escape' &&
        dockRef.current?.contains(document.activeElement)
      ) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [measureHeader])

  // --- resize ----------------------------------------------------------
  // FLOAT resizes from its top-left corner, RAIL from its left edge; both
  // grow the way the pointer moves because the panel is anchored right.
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, w: prefs.w, h: prefs.h }
  }
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    setPrefs((p) => ({
      ...p,
      w: clamp(
        d.w + (d.x - e.clientX),
        MIN_W,
        Math.min(MAX_W, window.innerWidth - 40),
      ),
      h:
        p.mode === 'rail'
          ? p.h
          : clamp(
              d.h + (d.y - e.clientY),
              MIN_H,
              window.innerHeight - headerTop - TOAST_LANE - 16,
            ),
    }))
  }
  const onGripUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onGripKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const stepW =
      e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0
    const stepH = e.key === 'ArrowUp' ? 24 : e.key === 'ArrowDown' ? -24 : 0
    if (stepW === 0 && stepH === 0) return
    e.preventDefault()
    setPrefs((p) => ({
      ...p,
      w: clamp(p.w + stepW, MIN_W, Math.min(MAX_W, window.innerWidth - 40)),
      h:
        p.mode === 'rail'
          ? p.h
          : clamp(
              p.h + stepH,
              MIN_H,
              window.innerHeight - headerTop - TOAST_LANE - 16,
            ),
    }))
  }

  // --- starters --------------------------------------------------------
  // Seeded from the case, not from a generic list: the coder's first question
  // is almost always about a code that is already sitting in the columns.
  const starters = useMemo(() => {
    const live = ctx.codes.filter(
      (k) => !k.missing && k.code && k.code !== '???',
    )
    const ten = live.find((k) => !isIcd9(k.type))
    const nine = live.find((k) => isIcd9(k.type))
    return [
      ten ? t('dock.chip.check', { code: ten.code }) : t('dock.chip.suggest'),
      t('dock.chip.principal'),
      nine
        ? t('dock.chip.checkProc', { code: nine.code })
        : t('dock.chip.needProc'),
    ]
  }, [ctx.codes, t])

  // Grounding is decided here, at click time, from the case as it stands right
  // now — the coder may have added a code since the last question.
  const submit = useCallback(
    (text: string) => {
      if (!text.trim() || chat.busy) return
      chat.send(text, prefs.ground ? buildCaseContextTurns(ctx) : [])
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
    },
    [chat, ctx, prefs.ground],
  )

  const copy = (id: number, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 1400)
    })
  }

  const rail = prefs.mode === 'rail'

  // ---------------------------------------------------------------- launcher
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          measureHeader()
          setOpen(true)
        }}
        aria-expanded={false}
        aria-controls="case-agent-dock"
        title={`${t('dock.title')} — ⌘/Ctrl + Shift + A`}
        className="fixed right-5 z-30 flex items-center gap-2 rounded-full py-3 pr-4 pl-3 text-[13px] font-bold transition-all hover:brightness-110"
        style={{
          bottom: TOAST_LANE,
          background: gl.accentGrad,
          color: gl.isDark ? '#1a0a00' : '#fff',
          boxShadow: `0 6px 24px rgba(${gl.accentRgb},0.40)`,
        }}
      >
        <Bot size={17} />
        {t('dock.ask')}
      </button>
    )
  }

  const shell: CSSProperties = rail
    ? {
        position: 'fixed',
        right: 0,
        top: headerTop,
        bottom: 0,
        width: prefs.w,
        maxWidth: 'calc(100vw - 24px)',
        borderRadius: '18px 0 0 0',
      }
    : {
        position: 'fixed',
        right: 20,
        bottom: TOAST_LANE,
        width: prefs.w,
        height: prefs.h,
        maxWidth: 'calc(100vw - 40px)',
        maxHeight: `calc(100dvh - ${headerTop + TOAST_LANE + 16}px)`,
        borderRadius: 22,
      }

  const iconBtn =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all hover:opacity-75'

  return (
    <section
      ref={dockRef}
      id="case-agent-dock"
      aria-label={t('dock.title')}
      className="z-30 flex flex-col overflow-hidden"
      style={{
        ...shell,
        background: gl.isDark ? 'rgba(22,14,19,0.86)' : 'rgba(255,255,255,0.86)',
        backdropFilter: gl.blur24,
        WebkitBackdropFilter: gl.blur24,
        border: `1px solid rgba(${gl.accentRgb},0.28)`,
        boxShadow: `0 18px 60px rgba(0,0,0,${gl.isDark ? '0.55' : '0.16'})`,
      }}
    >
      {/* Resize grip: top-left corner when floating, left edge when railed.
          A real button so it is reachable and resizable from the keyboard —
          a drag-only handle would put the panel's size out of reach. */}
      <button
        type="button"
        aria-label={t('dock.resize')}
        title={t('dock.resize')}
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onKeyDown={onGripKey}
        className={`absolute top-0 left-0 z-10 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 ${
          rail ? 'bottom-0 w-1.5 cursor-ew-resize' : 'h-6 w-6 cursor-nwse-resize'
        }`}
        style={{
          touchAction: 'none',
          background: rail
            ? `rgba(${gl.accentRgb},0.45)`
            : `radial-gradient(circle at 4px 4px, rgba(${gl.accentRgb},0.55) 3px, transparent 3px)`,
        }}
      />

      <header
        className="flex shrink-0 items-center gap-2 px-3 py-2.5"
        style={{
          background: `rgba(${gl.accentRgb},${gl.isDark ? 0.16 : 0.08})`,
          borderBottom: `1px solid rgba(${gl.accentRgb},0.18)`,
        }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `rgba(${gl.accentRgb},0.18)`,
            border: `1px solid rgba(${gl.accentRgb},0.28)`,
          }}
        >
          <Bot size={16} style={{ color: gl.accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13px] font-bold"
            style={{ color: gl.text }}
          >
            {t('dock.title')}
          </p>
          <p className="truncate text-[11px]" style={{ color: gl.muted }}>
            {t('dock.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            reset()
            setInput('')
          }}
          disabled={chat.busy || chat.messages.length === 0}
          title={t('dock.new')}
          aria-label={t('dock.new')}
          className={`${iconBtn} disabled:opacity-35`}
          style={{ color: gl.muted }}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          onClick={() => navigate('/agent')}
          title={t('dock.openFull')}
          aria-label={t('dock.openFull')}
          className={iconBtn}
          style={{ color: gl.muted }}
        >
          <ExternalLink size={14} />
        </button>
        <button
          type="button"
          onClick={() =>
            setPrefs((p) => ({ ...p, mode: p.mode === 'rail' ? 'float' : 'rail' }))
          }
          title={rail ? t('dock.toFloat') : t('dock.toRail')}
          aria-label={rail ? t('dock.toFloat') : t('dock.toRail')}
          className={iconBtn}
          style={{ color: gl.muted }}
        >
          {rail ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title={t('dock.close')}
          aria-label={t('dock.close')}
          className={iconBtn}
          style={{ color: gl.muted }}
        >
          <X size={15} />
        </button>
      </header>

      {/* ---------------------------------------------------------- messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 scroll-thin"
      >
        {chat.messages.length === 0 && (
          <>
            <div
              className="flex items-start gap-2 rounded-2xl px-3 py-2.5"
              style={{
                background: gl.card,
                border: gl.border,
                color: gl.muted,
              }}
            >
              <Sparkles
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: gl.accent }}
              />
              <p className="text-[12px] leading-relaxed">{t('dock.welcome')}</p>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-xl px-3 py-2 text-left text-[12px] leading-snug font-medium transition-all hover:opacity-80"
                  style={{
                    background: gl.row,
                    border: gl.borderSm,
                    color: gl.text,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {chat.messages.map((m) => {
          const isAgent = m.role === 'agent'
          return (
            <div
              key={m.id}
              className={`flex gap-2 ${isAgent ? '' : 'flex-row-reverse'}`}
            >
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={
                  isAgent
                    ? { background: gl.card, border: gl.border }
                    : {
                        background: `rgba(${gl.accentRgb},0.18)`,
                        border: `1px solid rgba(${gl.accentRgb},0.30)`,
                      }
                }
              >
                {isAgent ? (
                  <Bot size={12} style={{ color: gl.accent }} />
                ) : (
                  <User size={11} style={{ color: gl.accent }} />
                )}
              </div>

              <div
                className={`flex min-w-0 max-w-[85%] flex-col gap-1 ${isAgent ? '' : 'items-end'}`}
              >
                <div
                  className="px-3 py-2 text-[12.5px] leading-relaxed break-words whitespace-pre-wrap"
                  style={
                    isAgent
                      ? {
                          background: gl.card,
                          border: gl.border,
                          borderRadius: '4px 14px 14px 14px',
                          color: gl.text,
                        }
                      : {
                          background: `rgba(${gl.accentRgb},0.14)`,
                          border: `1px solid rgba(${gl.accentRgb},0.24)`,
                          borderRadius: '14px 4px 14px 14px',
                          color: gl.text,
                        }
                  }
                >
                  <RichText text={m.text} />
                </div>

                {m.learnedNotes?.map((n) => (
                  <span
                    key={n.id}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed"
                    style={{
                      background: `rgba(${gl.accentRgb},0.10)`,
                      border: `1px solid rgba(${gl.accentRgb},0.24)`,
                      color: gl.text,
                    }}
                    title={n.via}
                  >
                    💡 <strong>{t('agent.learn.applies')}</strong> {n.summary}
                  </span>
                ))}

                {m.unverifiedCodes && m.unverifiedCodes.length > 0 && (
                  <span
                    className="px-1 text-[10px] font-medium"
                    style={{ color: gl.warning }}
                    role="note"
                  >
                    ⚠ {m.unverifiedCodes.join(', ')} — {t('agent.unverified')}
                  </span>
                )}

                <div className="flex items-center gap-2 px-1">
                  {m.sources && m.sources.length > 0 && (
                    <span
                      className="min-w-0 truncate text-[10px] font-medium"
                      style={{ color: gl.muted }}
                      title={m.sources.join(' · ')}
                    >
                      {t('agent.sources')}: {m.sources.join(' · ')}
                    </span>
                  )}
                  {isAgent && m.text.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => copy(m.id, m.text)}
                      title={t('dock.copy')}
                      aria-label={t('dock.copy')}
                      className="shrink-0 rounded-md p-1 transition-all hover:opacity-70"
                      style={{ color: copiedId === m.id ? gl.accent : gl.muted }}
                    >
                      {copiedId === m.id ? (
                        <Check size={11} />
                      ) : (
                        <Copy size={11} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {chat.pending && (
          <div className="flex items-center gap-2 px-1" role="status" aria-live="polite">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full"
                  style={{ background: gl.accent, animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
            <span className="text-[11px]" style={{ color: gl.muted }}>
              {t('agent.thinking')}
            </span>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- composer */}
      <div
        className="shrink-0 px-3 pt-2 pb-2.5"
        style={{ borderTop: `1px solid rgba(${gl.accentRgb},0.16)` }}
      >
        {/* what the agent can see, and the switch that takes it away */}
        <button
          type="button"
          onClick={() => setPrefs((p) => ({ ...p, ground: !p.ground }))}
          aria-pressed={prefs.ground}
          title={prefs.ground ? t('dock.ctx.on') : t('dock.ctx.off')}
          className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] font-semibold transition-all hover:opacity-85"
          style={
            prefs.ground
              ? {
                  background: `rgba(${gl.accentRgb},0.12)`,
                  border: `1px solid rgba(${gl.accentRgb},0.26)`,
                  color: gl.accent,
                }
              : {
                  background: 'transparent',
                  border: gl.borderSm,
                  color: gl.muted,
                }
          }
        >
          {prefs.ground ? <Check size={11} /> : <X size={11} />}
          <span className="truncate">{contextChipLabel(ctx)}</span>
        </button>

        <div
          className="focus-pill flex items-end gap-2 rounded-2xl px-3 py-2"
          style={
            {
              background: gl.inputBg,
              border: gl.border,
              '--focus-ring': gl.accent,
            } as CSSProperties
          }
        >
          <textarea
            ref={inputRef}
            aria-label={t('dock.title')}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(input)
              }
            }}
            placeholder={t('dock.placeholder')}
            className="max-h-24 flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed outline-none"
            style={{ color: gl.text }}
          />
          {/* Stop covers the whole wait, not just the typing part — the local
              model can sit silent for a while before the first token. */}
          {chat.busy ? (
            <button
              type="button"
              onClick={chat.stop}
              title={t('dock.stop')}
              aria-label={t('dock.stop')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all hover:opacity-80"
              style={{
                background: `rgba(${gl.accentRgb},0.16)`,
                border: `1px solid rgba(${gl.accentRgb},0.28)`,
                color: gl.accent,
              }}
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={!input.trim() || chat.busy}
              aria-label={t('dock.send')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all"
              style={
                input.trim() && !chat.busy
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
              <Send size={12} />
            </button>
          )}
        </div>
        <p className="mt-1 px-1 text-[10px]" style={{ color: gl.muted }}>
          {t('dock.disclaimer')}
        </p>
      </div>
    </section>
  )
}
