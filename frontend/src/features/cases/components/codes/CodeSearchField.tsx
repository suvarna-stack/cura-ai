// ============================================================
// Searchable ICD catalog picker — typeahead over GET /api/icd-codes.
// Selecting a hit fills code (+ description via onSelect). Free typing
// alone is not enough: the coder must pick a suggestion card.
// ============================================================
import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import { searchIcdCatalog, type IcdCatalogHit } from '../../api/casesService'

export function CodeSearchField({
  id,
  value,
  system,
  onSelect,
  placeholder,
  inputStyle,
  localHits,
}: {
  /** Links the surrounding <label htmlFor> to the search input. */
  id?: string
  value: string
  /** Limit results to ICD-10 or ICD-9 when known from the code type. */
  system?: 'ICD-10' | 'ICD-9'
  onSelect: (hit: IcdCatalogHit) => void
  placeholder?: string
  inputStyle?: React.CSSProperties
  /** Codes already on the case (AI suggestions) — merged into results. */
  localHits?: IcdCatalogHit[]
}) {
  const { gl } = useTheme()
  const { t } = useLang()
  const [query, setQuery] = useState(value)
  const [hits, setHits] = useState<IcdCatalogHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState(!!value)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    setQuery(value)
    setPicked(!!value)
  }, [value])

  const filterLocal = (q: string): IcdCatalogHit[] => {
    const ql = q.toLowerCase()
    return (localHits ?? []).filter(
      (h) =>
        (!system || h.system === system) &&
        (h.code.toLowerCase().includes(ql) ||
          (h.description ?? '').toLowerCase().includes(ql)),
    )
  }

  const mergeHits = (fromLocal: IcdCatalogHit[], rows: IcdCatalogHit[]) => {
    const seen = new Set<string>()
    const merged: IcdCatalogHit[] = []
    for (const h of [...fromLocal, ...rows]) {
      const key = `${h.system}|${h.code}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(h)
    }
    return merged.slice(0, 12)
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      setHits([])
      setError(null)
      return
    }
    // Don't search again after a pick until the query changes.
    if (picked && q === value.trim()) {
      setHits([])
      return
    }
    // Show case codes immediately so typing feels instant even if catalog is slow.
    const fromLocal = filterLocal(q)
    setHits(fromLocal.slice(0, 12))
    setOpen(true)

    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchIcdCatalog(q, { system, limit: 20 })
        .then((rows) => {
          if (cancelled) return
          setHits(mergeHits(filterLocal(q), rows))
          setOpen(true)
        })
        .catch(() => {
          if (cancelled) return
          const local = filterLocal(q)
          setHits(local.slice(0, 12))
          setError(local.length ? null : 'Catalog search unavailable')
          setOpen(true)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [query, system, picked, value, localHits])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (hit: IcdCatalogHit) => {
    setQuery(hit.code)
    setPicked(true)
    setOpen(false)
    setHits([])
    onSelect(hit)
  }

  // ARIA combobox state: is the popup actually on screen (mirrors the render
  // condition below), and which option the arrow keys have reached
  const popupVisible =
    open && (loading || hits.length > 0 || !!error || (query.trim().length > 0 && !picked))

  // clamp instead of resetting via effect: if results shrank under the
  // highlight, the highlight simply disappears until the next arrow key
  const highlighted = activeIdx >= 0 && activeIdx < hits.length ? activeIdx : -1

  useEffect(() => {
    if (highlighted < 0) return
    document
      .getElementById(`${listId}-opt-${highlighted}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, listId])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!popupVisible) {
        if (hits.length || query.trim()) setOpen(true)
        return
      }
      if (hits.length === 0) return
      setActiveIdx(() => {
        const n = hits.length
        return e.key === 'ArrowDown' ? (highlighted + 1) % n : (highlighted - 1 + n) % n
      })
      return
    }
    if (e.key === 'Enter') {
      if (popupVisible && highlighted >= 0) {
        e.preventDefault()
        pick(hits[highlighted])
      }
      return
    }
    if (e.key === 'Escape' && popupVisible) {
      // first Escape closes only the list; the surrounding dialog gets the next one
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: gl.muted }}
        />
        <input
          id={id}
          aria-label={id ? undefined : (placeholder ?? 'Search code or title…')}
          role="combobox"
          aria-expanded={popupVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined}
          value={query}
          placeholder={placeholder ?? 'Search code or title…'}
          onChange={(e) => {
            setQuery(e.target.value)
            setPicked(false)
            setOpen(true)
            setActiveIdx(-1)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (hits.length || query.trim()) setOpen(true)
          }}
          className="w-full text-[13px] font-semibold py-2.5 pl-8 pr-3 rounded-xl"
          style={inputStyle}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="icd-code-search"
          inputMode="search"
        />
      </div>
      {/* result count for screen readers — the visual list is silent */}
      <span role="status" className="sr-only">
        {popupVisible && !loading ? t('a11y.results', { n: hits.length }) : ''}
      </span>
      {popupVisible && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl shadow-lg"
          style={{
            background: gl.isDark ? '#1e1218' : '#fff',
            border: `1px solid rgba(${gl.accentRgb},0.28)`,
          }}
        >
          {loading && hits.length === 0 && (
            <p className="px-3 py-2.5 text-[12px]" style={{ color: gl.muted }}>
              Searching…
            </p>
          )}
          {!loading && error && hits.length === 0 && (
            <p className="px-3 py-2.5 text-[12px]" style={{ color: gl.muted }}>
              {error} — restart medcode-api if you just added catalog search.
            </p>
          )}
          {!loading && !error && hits.length === 0 && query.trim().length > 0 && !picked && (
            <p className="px-3 py-2.5 text-[12px]" style={{ color: gl.muted }}>
              No matching ICD codes
            </p>
          )}
          {hits.map((h, i) => (
            <button
              key={`${h.system}:${h.code}`}
              type="button"
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === highlighted}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(h)}
              className="hover-glow flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors"
              style={{
                borderBottom: `1px solid rgba(${gl.accentRgb},0.10)`,
                background: i === highlighted ? `rgba(${gl.accentRgb},0.12)` : 'transparent',
              }}
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className="rounded-md px-1.5 py-0.5 font-mono text-[12px] font-bold"
                  style={{
                    background: `rgba(${gl.accentRgb},0.14)`,
                    color: gl.accent,
                  }}
                >
                  {h.code}
                </span>
                <span className="text-[12px] font-semibold uppercase" style={{ color: gl.muted }}>
                  {h.system}
                </span>
              </div>
              <span className="line-clamp-2 text-[12px] leading-snug" style={{ color: gl.text }}>
                {h.description || h.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Infer catalog system from a stored code type string. */
export function systemFromCodeType(type: string): 'ICD-10' | 'ICD-9' | undefined {
  if (/icd[- ]?9|pcs/i.test(type)) return 'ICD-9'
  if (/icd[- ]?10|drg/i.test(type)) return 'ICD-10'
  return undefined
}
