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
  revenue_impact?: 'high' | 'medium' | 'low'
  reopened?: boolean
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

const rich = (c: ApiCase): RichCase => ({
  id: c.id,
  patient: c.patient,
  vn: c.vn ?? c.id,
  hn: c.hn ?? null,
  dept: c.dept,
  group: c.group,
  confidence: c.confidence,
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
  created_at: c.created_at,
  updated_at: c.updated_at,
  revenue_impact: c.revenue_impact,
  reopened: c.reopened,
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
          completeCases: api.complete.map(rich),
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
            patient: f.patient,
            vn: f.vn ?? f.id,
            hn: f.hn ?? null,
            codedDate: f.codedDate,
            coder: f.coder,
            coders: f.coders,
            drg: f.drg,
            created_at: f.created_at,
            dept: f.dept,
            group: f.group,
            severity: f.severity,
            coverage: f.coverage,
            coverageFamily: f.coverageFamily,
            codes: f.codes,
            encountertype: f.encountertype,
            orders: f.orders,
            revenue_impact: f.revenue_impact,
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
