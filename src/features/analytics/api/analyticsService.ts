import type { AnalyticsData } from '../types/analytics.types'
import { MOCK_ANALYTICS } from '../types/analytics.types'

/**
 * Toggle mock responses until the real analytics API is ready.
 */
const USE_MOCK = true

/**
 * Placeholder analytics API — wire to shared apiClient when ready.
 */
export async function fetchAnalytics(): Promise<AnalyticsData> {
  if (USE_MOCK) {
    // refresh relative dates each call
    return {
      ...structuredClone(MOCK_ANALYTICS),
      casesOverTime: Array.from({ length: 30 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (29 - i))
        return {
          iso: d.toISOString(),
          count: 12 + Math.round(10 * Math.abs(Math.sin(i / 4))),
        }
      }),
    }
  }
  // TODO: const { data } = await apiClient.get<AnalyticsData>('/analytics')
  throw new Error('fetchAnalytics is not implemented')
}

export function isAnalyticsMock(): boolean {
  return USE_MOCK
}
