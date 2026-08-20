/** GET /api/analytics. Every figure is a roll-up over OPD visits only —
 *  the same population the Dashboard lists. */
export interface AnalyticsData {
  /** The dashboard's own `stats`, verbatim. `reopened` is its own queue, so
   *  complete + incomplete + finished only reaches `total` when it is 0. */
  summary: {
    complete: number
    incomplete: number
    reopened: number
    finished: number
    total: number
  }
  /** Visits per สิทธิการรักษา scheme family, biggest first. */
  coverageCounts: { label: string; count: number }[]
  /** One point per day, zero-filled. `iso` is local midnight, no zone suffix. */
  casesOverTime: { iso: string; count: number }[]
  /** Most-assigned codes across both catalogs. */
  topCodes: {
    label: string
    count: number
    code: string
    system: 'ICD-10' | 'ICD-9'
    description: string | null
  }[]
  /** What incomplete cases are missing — per item (a case missing two things
   *  counts in both rows) and per disease group. */
  documentationGaps: {
    items: { key: string; label: string; count: number }[]
    byGroup: { label: string; incomplete: number; total: number }[]
  }
  /** Coder actions per day from the audit trail, zero-filled like
   *  casesOverTime, dated by when the action happened (not the visit date). */
  codingActivity: {
    iso: string
    approved: number
    coded: number
    reopened: number
  }[]
  /** Sync-to-first-approval; both percentiles null with cases = 0 until
   *  something has been approved. */
  turnaround: {
    medianMinutes: number | null
    p90Minutes: number | null
    cases: number
  }
  /** Codes-per-case distribution (always the five buckets 0/1/2/3-5/6+, in
   *  order), the uncoded backlog, and the code-role mix. */
  codingDepth: {
    uncoded: number
    avgCodesPerCase: number | null
    distribution: { bucket: string; cases: number }[]
    roleMix: { role: string; label: string; count: number }[]
  }
  /** Disease group × severity (low+medium+high+other = total), plus sex and
   *  age-band splits. */
  caseMix: {
    groups: {
      label: string
      low: number
      medium: number
      high: number
      other: number
      total: number
    }[]
    sex: { label: string; count: number }[]
    age: { label: string; count: number }[]
  }
}

/** Shown while the first request is in flight — never as a fallback. */
export const EMPTY_ANALYTICS: AnalyticsData = {
  summary: { complete: 0, incomplete: 0, reopened: 0, finished: 0, total: 0 },
  coverageCounts: [],
  casesOverTime: [],
  topCodes: [],
  documentationGaps: { items: [], byGroup: [] },
  codingActivity: [],
  turnaround: { medianMinutes: null, p90Minutes: null, cases: 0 },
  codingDepth: {
    uncoded: 0,
    avgCodesPerCase: null,
    distribution: [],
    roleMix: [],
  },
  caseMix: { groups: [], sex: [], age: [] },
}
