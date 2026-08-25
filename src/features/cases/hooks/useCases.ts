import { useEffect, useState } from 'react'
import {
  Heart,
  Wind,
  Activity,
  Zap,
  Stethoscope,
  Bone,
  Brain,
  FlaskConical,
  Baby,
  ShieldQuestion,
} from 'lucide-react'
import type {
  CompleteCase,
  IncompleteGroup,
  FinishedCase,
} from '../types/case.types'
import type { ApiCase, ApiCodePreview } from '../types/api.types'
import { fetchCases } from '../api/casesService'

/** CompleteCase enriched with preview/facet fields. */
export interface RichCase extends CompleteCase {
  ward?: string | null
  severity?: string | null
  coverage?: string | null
  coverageLabel?: string | null
  coverageFamily?: string | null
  coders?: string[]
  encountertype?: string | null
  ccpi?: string | null
  cc?: string
  pi?: string
  codes?: ApiCodePreview[]
  orders?: Record<string, number>
  orderNames?: Record<string, string[]>
  missing?: string
  created_at?: string
  updated_at?: string
  /** The date to SHOW. `created_at` is the raw admissiondatetime iMed sent,
   *  which is null on every OPD row; this falls back to the datetime encoded
   *  in the transaction number, the same way analytics dates a visit. */
  visitDate?: string | null
  /** "y,m,d" as the extract froze it — print the years, don't do maths on it. */
  age?: string | null
  revenue_impact?: 'high' | 'medium' | 'low'
  reopened?: boolean
  /** the shared "look at this one first" flag: one star per case, set by any
   *  coder and seen by all of them (not a private favourites list) */
  starred?: boolean
  starredBy?: string | null
  starredAt?: string | null
}

export interface RichIncompleteGroup extends Omit<IncompleteGroup, 'cases'> {
  total?: number
  cases: (RichCase & { missing: string })[]
}

const GROUP_ICONS: [RegExp, IncompleteGroup['icon']][] = [
  [/cardio/i, Heart],
  [/neuro/i, Brain],
  [/respir/i, Wind],
  [/ortho/i, Bone],
  [/gastro/i, Activity],
  [/onco/i, Stethoscope],
  [/endo/i, Zap],
  [/infect/i, FlaskConical],
  [/obstet|perinat/i, Baby],
]
const iconFor = (label: string) =>
  GROUP_ICONS.find(([re]) => re.test(label))?.[1] ?? ShieldQuestion

// Normalization point for the live contract's honest nulls (patient /
// confidence / revenue_impact have no real data source): the display layer
// gets safe fallbacks HERE, in one place, so components don't null-check.
const rich = (c: ApiCase): RichCase => ({
  id: c.id,
  patient: c.patient ?? '',
  vn: c.vn ?? c.id,
  hn: c.hn ?? null,
  dept: c.dept,
  group: c.group,
  confidence: c.confidence ?? 0,
  ward: c.ward,
  severity: c.severity,
  coverage: c.coverage,
  coverageLabel: c.coverageLabel,
  coverageFamily: c.coverageFamily,
  coders: c.coders,
  encountertype: c.encountertype,
  ccpi: c.ccpi,
  cc: c.cc,
  pi: c.pi,
  codes: c.codes,
  orders: c.orders,
  orderNames: c.orderNames,
  missing: c.missing,
  created_at: c.created_at ?? undefined,
  updated_at: c.updated_at ?? undefined,
  visitDate: c.visitDate ?? null,
  age: c.age ?? null,
  revenue_impact: c.revenue_impact ?? undefined,
  reopened: c.reopened,
  starred: c.starred,
  starredBy: c.starredBy,
  starredAt: c.starredAt,
})

export interface CasesData {
  completeCases: RichCase[]
  incompleteGroups: RichIncompleteGroup[]
  finishedCases: FinishedCase[]
  stats: {
    total: number
    complete: number
    incomplete: number
    finished: number
  } | null
  loading: boolean
  error: boolean
}

const EMPTY: CasesData = {
  completeCases: [],
  incompleteGroups: [],
  finishedCases: [],
  stats: null,
  loading: true,
  error: false,
}

/**
 * @param refreshKey bump to refetch (e.g. after a confirmed reopen)
 */
export function useCases(refreshKey = 0): CasesData {
  const [data, setData] = useState<CasesData>(EMPTY)

  useEffect(() => {
    let cancelled = false
    fetchCases()
      .then((api) => {
        if (cancelled) return
        setData({
          // the server now sends reopened cases as their own exclusive list
          // (2026-07-24); fold them back into the complete pool — they carry
          // reopened: true, so the existing Reopen-tab derivation in CasesPage
          // picks them up unchanged (proper 4-tab consumption = the rewrite)
          completeCases: [...api.complete, ...(api.reopened ?? [])].map(rich),
          incompleteGroups: api.incompleteGroups.map((g) => ({
            id: g.id,
            label: g.label,
            total: g.total,
            icon: iconFor(g.label),
            cases: g.cases.map((c) => ({
              ...rich(c),
              missing: c.missing ?? '—',
            })),
          })),
          finishedCases: api.finished.map((f) => ({
            id: f.id,
            patient: f.patient ?? '',
            vn: f.vn ?? f.id,
            hn: f.hn ?? null,
            codedDate: f.codedDate,
            coder: f.coder,
            coders: f.coders,
            drg: f.drg,
            created_at: f.created_at ?? undefined,
            visitDate: f.visitDate ?? null,
            age: f.age ?? null,
            dept: f.dept,
            group: f.group,
            severity: f.severity,
            coverage: f.coverage,
            coverageFamily: f.coverageFamily,
            codes: f.codes,
            encountertype: f.encountertype,
            orders: f.orders,
            revenue_impact: f.revenue_impact ?? undefined,
            starred: f.starred,
            starredBy: f.starredBy,
            starredAt: f.starredAt,
          })),
          stats: api.stats,
          loading: false,
          error: false,
        })
      })
      .catch(() => {
        if (!cancelled)
          setData((d) =>
            d.loading ? { ...EMPTY, loading: false, error: true } : d,
          )
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return data
}
