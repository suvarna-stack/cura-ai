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
}

/** Shown while the first request is in flight — never as a fallback. */
export const EMPTY_ANALYTICS: AnalyticsData = {
  summary: { complete: 0, incomplete: 0, reopened: 0, finished: 0, total: 0 },
  coverageCounts: [],
  casesOverTime: [],
  topCodes: [],
}
