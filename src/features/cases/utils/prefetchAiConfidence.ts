import { useEffect, useRef, useState } from 'react'
import { suggestCodes } from '../api/casesService'
import type { ApiCodePreview } from '../types/api.types'
import { loadCodeEdits, saveCodeEdits } from './caseLocal'
import {
  avgStoredConfidence,
  fillEmptySystems,
  suggestedToStored,
} from './aiSuggestions'

// session-scoped cache — never persisted, so a wiped/reseeded DB can't
// surface confidence pills computed against old data
const confCache = new Map<string, number>()

/** Lightweight cached avg (set by list prefetch without opening detail). */
export function loadCachedAiConfidence(caseId: string): number | null {
  const n = confCache.get(caseId)
  return n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function saveCachedAiConfidence(caseId: string, avg: number) {
  confCache.set(caseId, Math.round(avg))
}

/** Best available AI confidence for the list pill. */
export function listAiConfidence(
  caseId: string,
  apiConfidence?: number | null,
): number | null {
  return (
    avgStoredConfidence(caseId) ??
    loadCachedAiConfidence(caseId) ??
    (apiConfidence && apiConfidence > 0 ? apiConfidence : null)
  )
}

/**
 * Prefetch RAG confidence for visible list rows so the pill fills without
 * opening each case. Concurrency-limited; skips ids that already have a score.
 */
export function usePrefetchAiConfidence(
  rows: Array<{ id: string; codes?: ApiCodePreview[] }>,
) {
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const inflight = useRef(new Set<string>())
  const done = useRef(new Set<string>())
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const idsKey = rows.map((r) => r.id).join("|")

  useEffect(() => {
    const snapshot = rowsRef.current
    const need = snapshot.filter((r) => {
      if (!r.id) return false
      if (listAiConfidence(r.id) != null) return false
      if (inflight.current.has(r.id) || done.current.has(r.id)) return false
      return true
    })
    if (!need.length) return

    let cancelled = false
    const CONCURRENCY = 2

    const runOne = async (row: { id: string; codes?: ApiCodePreview[] }) => {
      inflight.current.add(row.id)
      setLoading((p) => ({ ...p, [row.id]: true }))
      try {
        const ai = await suggestCodes(row.id)
        if (cancelled) return
        done.current.add(row.id)
        if (!ai.length) return

        const avg = Math.round(
          ai.reduce((s, c) => s + c.confidence, 0) / ai.length,
        )
        saveCachedAiConfidence(row.id, avg)

        // Warm local edits so detail opens with suggestions already filled.
        const existing =
          loadCodeEdits(row.id) ??
          (row.codes ?? []).map((k) => ({
            code: k.code,
            type: k.system ?? 'ICD-10',
            desc: k.code,
            confidence: 100,
            // list-preview chips are the case's existing codes, i.e. hospital
            // rows — the real detail seed refines this from `source` on open
            origin: 'hospital' as const,
          }))
        const next = fillEmptySystems(existing, ai)
        if (next.length !== existing.length || !loadCodeEdits(row.id)) {
          saveCodeEdits(row.id, next.length ? next : ai.map(suggestedToStored))
        }
        setTick((t) => t + 1)
      } catch {
        done.current.add(row.id) // don't hammer a failing case
      } finally {
        inflight.current.delete(row.id)
        if (!cancelled) {
          setLoading((p) => {
            const n = { ...p }
            delete n[row.id]
            return n
          })
        }
      }
    }

    void (async () => {
      const queue = [...need]
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, queue.length) },
        async () => {
          while (queue.length && !cancelled) {
            const row = queue.shift()
            if (row) await runOne(row)
          }
        },
      )
      await Promise.all(workers)
    })()

    return () => {
      cancelled = true
    }
  }, [idsKey])

  return { loading, tick }
}
