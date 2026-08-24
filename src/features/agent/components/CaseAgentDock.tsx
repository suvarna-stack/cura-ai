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
  BookOpen,
  Bot,
  Brain,
  Check,
  Copy,
  ExternalLink,
  GraduationCap,
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
import {
  agentErrorMessage,
  classifyIntent,
  extractNote,
  saveNote,
} from '../api/agentService'
import { useAgentChat } from '../hooks/useAgentChat'
import type { ChatMode, LearnedNote } from '../types/agent.types'
import { isLearnBack } from '../utils/learnBack'
import { noteLine } from '../utils/noteLine'
import { LearnedNoteCard } from './LearnedNoteCard'
import { RichText } from './RichText'
import {
  buildCaseContextTurns,
  contextChipLabel,
  type CaseAgentContext,
} from '../utils/caseContext'

type DockMode = 'float' | 'rail'

interface DockPrefs {
  /** how the dock is shaped — NOT the agent's mode, see chatMode */
  mode: DockMode
  w: number
  h: number
  /** send the case briefing with every question */
  ground: boolean
  /** which half of the agent the composer talks to */
  chatMode: ChatMode
  /**
   * where the FLOATING card sits, as viewport px of its top-left corner.
   * null = the default bottom-right corner (the dock is anchored right/bottom
   * until the coder drags it, so it stays put when the window is resized).
   */
  pos: { x: number; y: number } | null
}

const PREFS_KEY = 'mcai.caseDock'
const DEFAULT_PREFS: DockPrefs = {
  mode: 'float',
  w: 420,
  h: 560,
  ground: true,
  chatMode: 'dict',
  pos: null,
}
const MIN_W = 320
const MAX_W = 680
const MIN_H = 320
/** height reserved at the bottom-right for the app's toast (fixed bottom-4). */
const TOAST_LANE = 72
/** fallback for the app header's height until #main can be measured. */
const HEADER_FALLBACK = 52
/** how much of the dock must stay on screen when it is dragged. */
const EDGE = 8

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
      chatMode: p.chatMode === 'learn' ? 'learn' : 'dict',
      pos:
        p.pos && Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)
          ? { x: p.pos.x, y: p.pos.y }
          : null,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

/**
 * Keeps a dragged dock inside the window: never over the app header, never
 * pushed past an edge. Re-applied on every move AND on window resize, so a
 * card parked at the right edge of a wide window cannot end up off-screen
 * when the window is narrowed.
 */
function clampPos(
  x: number,
  y: number,
  w: number,
  h: number,
  top: number,
): { x: number; y: number } {
  return {
    x: clamp(x, EDGE, Math.max(EDGE, window.innerWidth - w - EDGE)),
    y: clamp(y, top, Math.max(top, window.innerHeight - h - EDGE)),
  }
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

  const chatMode = prefs.chatMode
  const learn = chatMode === 'learn'
  // the teaching round-trips (classify -> extract -> save) are the dock's own,
  // not the chat hook's, so they carry their own in-flight flags
  const [teaching, setTeaching] = useState(false)
  const [savingNote, setSavingNote] = useState(false)

  const chat = useAgentChat({
    mode: chatMode,
    maxNewTokens: learn ? 320 : 256,
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

  // A moved dock is positioned in viewport px, so a window the coder narrows
  // could otherwise leave it half (or wholly) off-screen — re-clamp on resize.
  useEffect(() => {
    const onResize = () => {
      measureHeader()
      const r = dockRef.current?.getBoundingClientRect()
      if (!r) return
      setPrefs((p) =>
        p.pos
          ? {
              ...p,
              pos: clampPos(p.pos.x, p.pos.y, r.width, r.height, headerTop),
            }
          : p,
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureHeader, headerTop])

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

  const rail = prefs.mode === 'rail'

  // --- resize ----------------------------------------------------------
  // FLOAT resizes from its top-left corner, RAIL from its left edge; both
  // grow the way the pointer moves because the panel is anchored right.
  const dragRef = useRef<{
    x: number
    y: number
    w: number
    h: number
    right: number
    bottom: number
  } | null>(null)

  /**
   * Applies a new size while holding the corner the coder is NOT dragging
   * still. The dock is anchored right/bottom by default, so that corner stays
   * put on its own — but once it has been MOVED it is anchored by its stored
   * top-left, and the position has to be given back or the panel would grow
   * out from under the pointer.
   */
  const sized = useCallback(
    (p: DockPrefs, w: number, h: number, right: number, bottom: number) => {
      const nw = clamp(w, MIN_W, Math.min(MAX_W, window.innerWidth - 40))
      const nh =
        p.mode === 'rail'
          ? p.h
          : clamp(h, MIN_H, window.innerHeight - headerTop - TOAST_LANE - 16)
      return {
        ...p,
        w: nw,
        h: nh,
        pos:
          p.pos && p.mode !== 'rail'
            ? clampPos(right - nw, bottom - nh, nw, nh, headerTop)
            : p.pos,
      }
    },
    [headerTop],
  )

  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const r = dockRef.current?.getBoundingClientRect()
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      w: prefs.w,
      h: prefs.h,
      right: r?.right ?? 0,
      bottom: r?.bottom ?? 0,
    }
  }
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    setPrefs((p) =>
      sized(
        p,
        d.w + (d.x - e.clientX),
        d.h + (d.y - e.clientY),
        d.right,
        d.bottom,
      ),
    )
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
    const r = dockRef.current?.getBoundingClientRect()
    setPrefs((p) =>
      sized(p, p.w + stepW, p.h + stepH, r?.right ?? 0, r?.bottom ?? 0),
    )
  }

  // --- move ------------------------------------------------------------
  // A floating card always covers SOMETHING, and which column the coder needs
  // to read changes case to case — so the header is a drag handle. The first
  // drag pins the card where it already is (right/bottom anchoring becomes a
  // stored top-left) so it does not jump under the pointer; double-clicking
  // the header sends it back to the default corner. Arrow keys move it too,
  // because a drag-only handle puts the panel out of reach from the keyboard.
  const moveRef = useRef<{ dx: number; dy: number } | null>(null)
  const [moving, setMoving] = useState(false)

  const onHeadDown = (e: React.PointerEvent<HTMLElement>) => {
    if (rail || e.button !== 0) return
    // the header is also a toolbar — a press on a control is that control's
    if ((e.target as HTMLElement).closest('button,a,input,textarea,select'))
      return
    const r = dockRef.current?.getBoundingClientRect()
    if (!r) return
    e.currentTarget.setPointerCapture(e.pointerId)
    moveRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    setMoving(true)
    setPrefs((p) => ({
      ...p,
      pos: clampPos(r.left, r.top, r.width, r.height, headerTop),
    }))
  }
  const onHeadMove = (e: React.PointerEvent<HTMLElement>) => {
    const m = moveRef.current
    if (!m) return
    const r = dockRef.current?.getBoundingClientRect()
    if (!r) return
    e.preventDefault()
    setPrefs((p) => ({
      ...p,
      pos: clampPos(
        e.clientX - m.dx,
        e.clientY - m.dy,
        r.width,
        r.height,
        headerTop,
      ),
    }))
  }
  const onHeadUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!moveRef.current) return
    moveRef.current = null
    setMoving(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onHeadKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (rail || e.target !== e.currentTarget) return
    const step = e.shiftKey ? 48 : 16
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    if (dx === 0 && dy === 0) return
    const r = dockRef.current?.getBoundingClientRect()
    if (!r) return
    e.preventDefault()
    setPrefs((p) => ({
      ...p,
      pos: clampPos(r.left + dx, r.top + dy, r.width, r.height, headerTop),
    }))
  }
  const onHeadDouble = (e: React.MouseEvent<HTMLElement>) => {
    if (rail) return
    if ((e.target as HTMLElement).closest('button,a,input,textarea,select'))
      return
    setPrefs((p) => ({ ...p, pos: null }))
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
    if (learn) {
      return [
        t('dock.chip.suggest'),
        ten
          ? t('dock.chip.teachPrincipal', { code: ten.code })
          : t('dock.chip.teachExample'),
        nine ? t('dock.chip.teachProc', { code: nine.code }) : null,
      ].filter((x): x is string => x !== null)
    }
    return [
      ten ? t('dock.chip.check', { code: ten.code }) : t('dock.chip.suggest'),
      t('dock.chip.principal'),
      nine
        ? t('dock.chip.checkProc', { code: nine.code })
        : t('dock.chip.needProc'),
    ]
  }, [ctx.codes, learn, t])

  // Grounding is decided here, at click time, from the case as it stands right
  // now — the coder may have added a code since the last question.
  //
  // Suggest & Learn is one surface, exactly as it is on the Agent page: every
  // message is classified, a sentence that reads like a rule goes to the
  // extractor and comes back as a confirm CARD (nothing is stored until the
  // coder signs it off), and anything else is simply answered. A wrong
  // "teach" guess costs one Discard click.
  const submit = useCallback(
    (text: string) => {
      const q = text.trim()
      if (!q || chat.busy || teaching) return
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
      const context = prefs.ground ? buildCaseContextTurns(ctx) : []
      if (!learn) {
        chat.send(q, context)
        return
      }
      void (async () => {
        setTeaching(true)
        try {
          // "learn that" is a back-reference: the thing to teach is the claim
          // the coder made before it, not the two-word command itself.
          let toTeach: string | null = null
          if (isLearnBack(q)) {
            const prev = [...chat.messages]
              .reverse()
              .find((m) => m.role === 'coder' && !isLearnBack(m.text))
            if (prev) toTeach = prev.text
          }
          if (toTeach === null) {
            const intent = await classifyIntent(q)
              .then((r) => r.intent)
              .catch(() => 'ask' as const) // classifier down -> answer, safest
            if (intent === 'teach') toTeach = q
          }
          if (toTeach === null) {
            chat.send(q, context)
            return
          }
          chat.append({ role: 'coder', text: q })
          try {
            const draft = await extractNote(toTeach)
            chat.append({
              role: 'agent',
              text: '',
              kind: 'note-draft',
              note: draft,
            })
          } catch (err) {
            // a failed extraction is a normal reply saying what was missing,
            // so the chat never dead-ends on it
            chat.append({
              role: 'agent',
              text: agentErrorMessage(err, t('agent.learn.error')),
            })
          }
        } finally {
          setTeaching(false)
        }
      })()
    },
    [chat, ctx, learn, prefs.ground, t, teaching],
  )

  /** Confirmed draft -> stored rule; the card becomes its own receipt. */
  const confirmNote = useCallback(
    (cardId: number, draft: LearnedNote) => {
      setSavingNote(true)
      void saveNote(draft)
        .then((saved) => {
          chat.patch(cardId, {
            kind: 'note-saved',
            note: saved,
            text: t('agent.learn.saved'),
          })
          chat.record(
            draft.raw_text || draft.scenario,
            `${t('agent.learn.saved')} — ${noteLine(saved, t)}`,
          )
        })
        .catch((err: unknown) =>
          chat.append({
            role: 'agent',
            text: agentErrorMessage(err, t('agent.learn.error')),
          }),
        )
        .finally(() => setSavingNote(false))
    },
    [chat, t],
  )

  /** Switching half is switching thread — a rule and a question are not one. */
  const switchMode = useCallback(
    (next: ChatMode) => {
      if (next === chatMode || chat.busy || teaching) return
      setPrefs((p) => ({ ...p, chatMode: next }))
      reset()
      setInput('')
    },
    [chatMode, chat.busy, reset, teaching],
  )

  const copy = (id: number, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 1400)
    })
  }

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
        // parked in the default corner until the coder drags it, and pinned by
        // its top-left from then on
        ...(prefs.pos
          ? { left: prefs.pos.x, top: prefs.pos.y }
          : { right: 20, bottom: TOAST_LANE }),
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

      {/* The header doubles as the drag handle (float only — a rail is edge to
          edge and has nowhere to go). */}
      <header
        className={`flex shrink-0 items-center gap-2 px-3 py-2.5 ${
          rail ? '' : moving ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        onPointerCancel={onHeadUp}
        onDoubleClick={onHeadDouble}
        onKeyDown={onHeadKey}
        tabIndex={rail ? undefined : 0}
        aria-label={rail ? undefined : t('dock.move')}
        title={rail ? undefined : t('dock.move')}
        style={{
          background: `rgba(${gl.accentRgb},${gl.isDark ? 0.16 : 0.08})`,
          borderBottom: `1px solid rgba(${gl.accentRgb},0.18)`,
          touchAction: rail ? undefined : 'none',
          userSelect: moving ? 'none' : undefined,
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
          disabled={chat.busy || teaching || chat.messages.length === 0}
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

      {/* The two halves of the agent, as one segmented control: looking a code
          up, and teaching a rule. Its own strip rather than a header button —
          which half you are in changes what typing does, so it has to be
          readable at a glance, not hidden behind an icon. */}
      <div
        className="flex shrink-0 gap-0.5 p-1"
        style={{ borderBottom: `1px solid rgba(${gl.accentRgb},0.14)` }}
      >
        {(
          [
            ['dict', t('dock.mode.dict'), BookOpen],
            ['learn', t('dock.mode.learn'), Brain],
          ] as const
        ).map(([id, label, Icon]) => {
          const on = id === chatMode
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchMode(id)}
              disabled={chat.busy || teaching}
              aria-pressed={on}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition-all hover:opacity-90 disabled:opacity-50"
              style={
                on
                  ? {
                      background: `rgba(${gl.accentRgb},0.16)`,
                      border: `1px solid rgba(${gl.accentRgb},0.28)`,
                      color: gl.accent,
                    }
                  : {
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: gl.muted,
                    }
              }
            >
              <Icon size={12} />
              {label}
            </button>
          )
        })}
      </div>

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
              <p className="text-[12px] leading-relaxed">
                {t(`dock.welcome.${chatMode}`)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 pt-1">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  // In Suggest & Learn a starter is a TEMPLATE, so it lands in
                  // the composer to be edited — firing off a rule the coder
                  // did not write, into a knowledge base the whole team reads,
                  // is not something one tap should be able to start.
                  onClick={() => {
                    if (learn) {
                      setInput(s)
                      inputRef.current?.focus()
                    } else {
                      submit(s)
                    }
                  }}
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

          // Teaching turns are cards, not bubbles: the draft the coder has to
          // sign off, and the receipt once the rule is stored.
          if (m.kind === 'note-draft' && m.note) {
            return (
              <div key={m.id} className="flex gap-2">
                <div
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: gl.card, border: gl.border }}
                >
                  <GraduationCap size={12} style={{ color: gl.accent }} />
                </div>
                <LearnedNoteCard
                  note={m.note}
                  saving={savingNote}
                  onSave={(draft) => confirmNote(m.id, draft)}
                  onDiscard={() => chat.remove(m.id)}
                />
              </div>
            )
          }

          if (m.kind === 'note-saved' && m.note) {
            return (
              <div key={m.id} className="flex gap-2">
                <div
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `rgba(${gl.accentRgb},0.18)`,
                    border: `1px solid rgba(${gl.accentRgb},0.30)`,
                  }}
                >
                  <GraduationCap size={12} style={{ color: gl.accent }} />
                </div>
                <div
                  className="flex min-w-0 max-w-[85%] flex-col gap-1 px-3 py-2"
                  style={{
                    background: `rgba(${gl.accentRgb},0.10)`,
                    border: `1px solid rgba(${gl.accentRgb},0.28)`,
                    borderRadius: '4px 14px 14px 14px',
                  }}
                >
                  <span
                    className="text-[11.5px] font-bold"
                    style={{ color: gl.accent }}
                  >
                    ✓ {t('agent.learn.saved')}
                  </span>
                  <span
                    className="text-[12px] break-words"
                    style={{ color: gl.text }}
                  >
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

        {(chat.pending || teaching) && (
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
            placeholder={t(`dock.placeholder.${chatMode}`)}
            /* min-h/py match the 32px send button so a one-line question sits
               centred against it — items-end alone bottom-aligned the 20px
               text box inside a 32px row and dropped the caret below centre.
               The grow handler measures scrollHeight, which counts this
               padding, so line two still lands exactly one line taller. */
            className="max-h-24 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[12.5px] leading-relaxed outline-none"
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
              disabled={!input.trim() || chat.busy || teaching}
              aria-label={t('dock.send')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all"
              style={
                input.trim() && !chat.busy && !teaching
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
