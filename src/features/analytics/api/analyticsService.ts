import { apiClient } from '../../../lib/axios'
import type { AnalyticsData } from '../types/analytics.types'

/**
 * Analytics API — live against medcode-api since 2026-08-06. The page used to
 * render hardcoded demo numbers behind a `USE_MOCK` flag; the server now
 * rolls the same figures up out of the synced hospital data, so there is no
 * mock path left to fall back to. A failed request surfaces as an error on
 * the page rather than as plausible-looking fake data.
 */

/** GET /api/analytics — the whole page in one round trip. */
export async function fetchAnalytics(days = 30): Promise<AnalyticsData> {
  const { data } = await apiClient.get<AnalyticsData>('/analytics', {
    params: { days },
  })
  return data
}
