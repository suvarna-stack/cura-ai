/** One bar of a code ranking — shared by `topCodes` and
 *  `topPrincipalDiagnosis`, which differ in what they count, not in shape. */
export interface AnalyticsCodeBar {
  /** "code · description", or the bare code when the catalog has none. */
  label: string
  count: number
  code: string
  system: 'ICD-10' | 'ICD-9'
  description: string | null
}

/** GET /api/analytics. Every figure is a roll-up over OPD visits only —
 *  the same population the Dashboard lists. */
export interface AnalyticsData {
  /** The window actually applied. `filtered` is false when the caller sent no
   *  from/to — the figures then cover everything, and from/to merely describe
   *  the rolling series window. */
  range: { filtered: boolean; from: string; to: string }
  /** The dashboard's own `stats` (verbatim while unfiltered), plus the two
   *  figures the hospital's dashboard names directly. `reopened` is its own
   *  queue, so complete + incomplete + finished only reaches `total` when it
   *  is 0 — `notFinished` is the one that always adds up against `finished`. */
  summary: {
    complete: number
    incomplete: number
    reopened: number
    finished: number
    total: number
    /** total − finished: complete + incomplete + reopened. */
    notFinished: number
    /** 0–100, one decimal. null (not 0) when there are no cases at all. */
    finishedPct: number | null
  }
  /** Visits per สิทธิการรักษา scheme family, biggest first. */
  coverageCounts: { label: string; count: number }[]
  /** One point per day, zero-filled. `iso` is local midnight, no zone suffix. */
  casesOverTime: { iso: string; count: number }[]
  /** Most-assigned codes across both catalogs. */
  topCodes: AnalyticsCodeBar[]
  /** The hospital's "Top 10 Principal Diagnosis": ICD-10 rows in the
   *  principal_diagnosis role only, so a frequent procedure or comorbidity
   *  cannot outrank a diagnosis the way it can in `topCodes`. */
  topPrincipalDiagnosis: AnalyticsCodeBar[]
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
  /** Finished (approved) cases per coder, biggest first. `coder` is the
   *  account's display name, `coderId` the raw audit stamp behind it. */
  finishedByCoder: { coder: string; coderId: string; cases: number }[]
  /** The hospital's per-coder KPI table.
   *
   *  `finishedPct` is finished ÷ **touched**, NOT ÷ assigned — no assignment
   *  system exists, so the denominator is the cases the coder acted on at all.
   *  `touched` is sent precisely so the UI can name that denominator instead
   *  of implying the hospital's. `within7DaysPct` is over `measured` (finished
   *  cases that also have a sync event to measure from), never over
   *  `finished`. Both percentages are null, never 0, on an empty denominator. */
  coderKpi: {
    coder: string
    coderId: string
    touched: number
    finished: number
    finishedPct: number | null
    measured: number
    within7Days: number
    within7DaysPct: number | null
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
  range: { filtered: false, from: '', to: '' },
  summary: {
    complete: 0,
    incomplete: 0,
    reopened: 0,
    finished: 0,
    total: 0,
    notFinished: 0,
    finishedPct: null,
  },
  coverageCounts: [],
  casesOverTime: [],
  topCodes: [],
  topPrincipalDiagnosis: [],
  documentationGaps: { items: [], byGroup: [] },
  codingActivity: [],
  finishedByCoder: [],
  coderKpi: [],
  turnaround: { medianMinutes: null, p90Minutes: null, cases: 0 },
  codingDepth: {
    uncoded: 0,
    avgCodesPerCase: null,
    distribution: [],
    roleMix: [],
  },
  caseMix: { groups: [], sex: [], age: [] },
}
