export interface AnalyticsData {
  summary: {
    complete: number
    incomplete: number
    finished: number
    total: number
  }
  coverageCounts: { label: string; count: number }[]
  casesOverTime: { iso: string; count: number }[]
  topCodes: { label: string; count: number }[]
}

export const MOCK_ANALYTICS: AnalyticsData = {
  summary: { complete: 754, incomplete: 322, finished: 25, total: 1101 },
  coverageCounts: [
    { label: 'UCS (บัตรทอง)', count: 412 },
    { label: 'SSS (ประกันสังคม)', count: 265 },
    { label: 'CSMBS (ข้าราชการ)', count: 189 },
    { label: 'Self-pay', count: 134 },
  ],
  casesOverTime: Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    return {
      iso: d.toISOString(),
      count: 12 + Math.round(10 * Math.abs(Math.sin(i / 4))),
    }
  }),
  topCodes: [
    { label: 'I10 · Essential hypertension', count: 143 },
    { label: 'E11.9 · Type 2 diabetes', count: 121 },
    { label: 'J44.1 · COPD w/ exacerbation', count: 98 },
    { label: 'I48.0 · Paroxysmal AF', count: 84 },
    { label: 'N18.9 · CKD unspecified', count: 71 },
    { label: 'E78.5 · Hyperlipidemia', count: 65 },
    { label: 'I25.10 · ASHD', count: 52 },
    { label: 'J18.9 · Pneumonia', count: 47 },
    { label: 'I50.9 · Heart failure', count: 39 },
    { label: 'K21.9 · GERD', count: 33 },
  ],
}
