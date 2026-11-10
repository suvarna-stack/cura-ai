import { apiClient } from '../../../lib/axios'
import type { AnalyticsData } from '../types/analytics.types'

/**
 * Analytics API — live against medcode-api since 2026-08-06. The page used to
 * render hardcoded demo numbers behind a `USE_MOCK` flag; the server now
 * rolls the same figures up out of the synced hospital data, so there is no
 * mock path left to fall back to. A failed request surfaces as an error on
 * the page rather than as plausible-looking fake data.
 */

/** A from/to range, or null for "everything" (the server's default). */
export interface AnalyticsRange {
  /** ISO YYYY-MM-DD, inclusive. */
  from: string
  /** ISO YYYY-MM-DD, inclusive. */
  to: string
}

/**
 * GET /api/analytics — the whole page in one round trip.
 *
 * With a `range` every card is scoped to it and `days` is ignored (the server
 * spans the series across the range instead). Without one nothing is filtered
 * and the summary tiles are the Dashboard's own counts verbatim. The server
 * rejects a half-open range, so this only ever sends both ends or neither.
 */
export async function fetchAnalytics(
  days = 30,
  range: AnalyticsRange | null = null,
): Promise<AnalyticsData> {
  const { data } = await apiClient.get<AnalyticsData>('/analytics', {
    params: range ? { from: range.from, to: range.to } : { days },
  })
  return data
}
