import { useEffect, useState, type CSSProperties } from 'react'
import { Layers, CheckCircle2, AlertCircle, Flag } from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { GlassCard } from '../../cases/components/global/GlassCard'
import { formatDate } from '../../cases/utils/formatDate'
import {
  fetchAnalytics,
  isAnalyticsMock,
} from '../api/analyticsService'
import type { AnalyticsData } from '../types/analytics.types'
import { MOCK_ANALYTICS } from '../types/analytics.types'

function polyline(data: number[], w: number, h: number, pad = 6) {
  const min = 0
  const max = Math.max(...data, 1)
  const range = max - min || 1
  return data
    .map((v, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
}

function areaPath(data: number[], w: number, h: number, pad = 6) {
  const pts = polyline(data, w, h, pad)
  const first = pts.split(' ')[0]
  const last = pts.split(' ').slice(-1)[0]
  const [lx] = last.split(',')
  const [fx] = first.split(',')
  return `M ${fx},${h - pad} L ${pts} L ${lx},${h - pad} Z`
}

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s

function ChartSkeleton({ height }: { height: number }) {
  const { gl } = useTheme()
  const bar = gl.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  return (
    <GlassCard className="animate-pulse p-5">
      <div className="mb-2 h-3.5 w-40 rounded" style={{ background: bar }} />
      <div className="mb-4 h-2.5 w-56 rounded" style={{ background: bar }} />
      <div className="w-full rounded-xl" style={{ background: bar, height }} />
    </GlassCard>
  )
}

function BarList({
  rows,
  unit = '',
}: {
  rows: { label: string; count: number }[]
  unit?: string
}) {
  const { gl } = useTheme()
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between">
            <span
              className="truncate pr-2 text-[12px] font-semibold"
              style={{ color: gl.text }}
              title={r.label}
            >
              {r.label}
            </span>
            <span
              className="shrink-0 text-[12px] font-bold"
              style={{ color: gl.accent }}
            >
              {r.count}
              {unit}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.10)` }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(r.count / max) * 100}%`,
                background: gl.accentGrad,
              }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-[12px]" style={{ color: gl.muted }}>
          —
        </p>
      )}
    </div>
  )
}

export function AnalyticsPage() {
  const { gl } = useTheme()
  const useMock = isAnalyticsMock()
  const [data, setData] = useState<AnalyticsData>(MOCK_ANALYTICS)
  const [loading, setLoading] = useState(!useMock)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await fetchAnalytics()
        if (!cancelled) setData(next)
      } catch {
        // keep MOCK_ANALYTICS
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const W = 900
  const H = 170
  const pad = 12
  const timeCounts = data.casesOverTime.map((d) => d.count)

  const DONUT_R = 54
  const DONUT_CX = 80
  const DONUT_CY = 80
  const donutTotal =
    data.coverageCounts.reduce((s, d) => s + d.count, 0) || 1
  const donutTop = data.coverageCounts.slice(0, 6)
  const donutRest = data.coverageCounts
    .slice(6)
    .reduce((s, d) => s + d.count, 0)
  const donutSegs =
    donutRest > 0
      ? [...donutTop, { label: 'Other', count: donutRest }]
      : donutTop
  const segColor = (i: number) =>
    `rgba(${gl.accentRgb},${Math.max(0.9 - i * 0.13, 0.15)})`
  const donutArcs = donutSegs.map((seg, i) => {
    const pct = seg.count / donutTotal
    const angle = Math.min(pct * 360, 359.9)
    const start =
      -90 +
      donutSegs
        .slice(0, i)
        .reduce((s, x) => s + (x.count / donutTotal) * 360, 0)
    const r2d = Math.PI / 180
    const x1 = DONUT_CX + DONUT_R * Math.cos(start * r2d)
    const y1 = DONUT_CY + DONUT_R * Math.sin(start * r2d)
    const x2 = DONUT_CX + DONUT_R * Math.cos((start + angle) * r2d)
    const y2 = DONUT_CY + DONUT_R * Math.sin((start + angle) * r2d)
    const large = angle > 180 ? 1 : 0
    return {
      ...seg,
      color: segColor(i),
      pct,
      path: `M ${DONUT_CX},${DONUT_CY} L ${x1},${y1} A ${DONUT_R},${DONUT_R} 0 ${large} 1 ${x2},${y2} Z`,
    }
  })

  const statRow = [
    {
      label: 'Total Complete',
      value: String(data.summary.complete),
      icon: CheckCircle2,
    },
    {
      label: 'Total Incomplete',
      value: String(data.summary.incomplete),
      icon: AlertCircle,
    },
    {
      label: 'Total Finished',
      value: String(data.summary.finished),
      icon: Flag,
    },
    {
      label: 'Total Cases',
      value: String(data.summary.total),
      icon: Layers,
    },
  ]

  return (
    <main
      className="flex flex-1 flex-col overflow-auto"
      style={{ scrollbarWidth: 'none' } as CSSProperties}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-3.5"
        style={{
          background: gl.headerBg,
          backdropFilter: gl.blur20,
          WebkitBackdropFilter: gl.blur20,
          borderBottom: gl.borderSm,
        }}
      >
        <div>
          <h1
            className="text-[19px] font-bold"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: gl.text,
            }}
          >
            Analytics
          </h1>
          <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
            {useMock
              ? 'Demo data (USE_MOCK)'
              : 'Live view of the synced hospital data'}
          </p>
        </div>
      </header>

      <div className="space-y-4 p-5">
        {loading && !useMock ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ChartSkeleton key={i} height={44} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {statRow.map((s) => (
              <GlassCard key={s.label} className="p-4">
                <div
                  className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{
                    background: `rgba(${gl.accentRgb},0.15)`,
                    border: `1px solid rgba(${gl.accentRgb},0.25)`,
                  }}
                >
                  <s.icon size={14} style={{ color: gl.accent }} />
                </div>
                <p className="text-[21px] font-bold" style={{ color: gl.text }}>
                  {s.value}
                </p>
                <p
                  className="mt-0.5 text-[11px] font-semibold"
                  style={{ color: gl.muted }}
                >
                  {s.label}
                </p>
              </GlassCard>
            ))}
          </div>
        )}

        {loading && !useMock ? (
          <ChartSkeleton height={H} />
        ) : (
          <GlassCard className="p-5">
            <p className="mb-1 text-[15px] font-bold" style={{ color: gl.text }}>
              Cases Over Time
            </p>
            <p className="mb-4 text-[11px]" style={{ color: gl.muted }}>
              New cases per day ·{' '}
              {formatDate(data.casesOverTime[0]?.iso ?? new Date())} –{' '}
              {formatDate(data.casesOverTime.at(-1)?.iso ?? new Date())}
            </p>
            <div>
              <svg
                viewBox={`0 0 ${W} ${H + 14}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: 'block', width: '100%', height: 'auto' }}
              >
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <line
                    key={f}
                    x1={pad}
                    y1={pad + (1 - f) * (H - pad * 2)}
                    x2={W - pad}
                    y2={pad + (1 - f) * (H - pad * 2)}
                    stroke={`rgba(${gl.accentRgb},0.08)`}
                    strokeWidth={1}
                  />
                ))}
                {data.casesOverTime.map(
                  (d, i) =>
                    i % 5 === 0 && (
                      <text
                        key={d.iso}
                        x={
                          pad +
                          (i / Math.max(data.casesOverTime.length - 1, 1)) *
                            (W - pad * 2)
                        }
                        y={H + 10}
                        textAnchor="middle"
                        fontSize={8}
                        fill={`rgba(${gl.accentRgb},0.55)`}
                      >
                        {formatDate(d.iso)}
                      </text>
                    ),
                )}
                <path
                  d={areaPath(timeCounts, W, H, pad)}
                  fill={`rgba(${gl.accentRgb},0.08)`}
                />
                <polyline
                  points={polyline(timeCounts, W, H, pad)}
                  fill="none"
                  stroke={gl.accent}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {data.casesOverTime.map((d, i) => {
                  const max = Math.max(...timeCounts, 1)
                  const x =
                    pad +
                    (i / Math.max(data.casesOverTime.length - 1, 1)) *
                      (W - pad * 2)
                  const y = H - pad - (d.count / max) * (H - pad * 2)
                  return (
                    <circle key={d.iso} cx={x} cy={y} r={2.5} fill={gl.accent}>
                      <title>{`${formatDate(d.iso)} · ${d.count}`}</title>
                    </circle>
                  )
                })}
              </svg>
            </div>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loading && !useMock ? (
            <ChartSkeleton height={200} />
          ) : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Cases by Coverage Type
              </p>
              <p className="mb-4 text-[11px]" style={{ color: gl.muted }}>
                สิทธิการรักษา breakdown
              </p>
              <div className="flex items-center gap-4">
                <svg width={160} height={160}>
                  {donutArcs.map((arc, i) => (
                    <path key={i} d={arc.path} fill={arc.color}>
                      <title>{`${arc.label} · ${arc.count}`}</title>
                    </path>
                  ))}
                  <circle
                    cx={DONUT_CX}
                    cy={DONUT_CY}
                    r={32}
                    fill={gl.isDark ? '#1a0d14' : '#f9f9f9'}
                  />
                  <text
                    x={DONUT_CX}
                    y={DONUT_CY - 4}
                    textAnchor="middle"
                    fontSize={14}
                    fontWeight="bold"
                    fill={gl.text}
                  >
                    {donutTotal}
                  </text>
                  <text
                    x={DONUT_CX}
                    y={DONUT_CY + 11}
                    textAnchor="middle"
                    fontSize={8}
                    fill={gl.muted}
                  >
                    total
                  </text>
                </svg>
                <div className="min-w-0 space-y-2">
                  {donutArcs.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ background: seg.color }}
                      />
                      <span
                        className="truncate text-[11px] font-medium"
                        style={{ color: gl.muted }}
                        title={seg.label}
                      >
                        {truncate(seg.label, 18)}
                      </span>
                      <span
                        className="ml-auto shrink-0 text-[11px] font-bold"
                        style={{ color: gl.text }}
                      >
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          )}

          {loading && !useMock ? (
            <ChartSkeleton height={180} />
          ) : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Top 10 ICD Codes
              </p>
              <p className="mb-4 text-[11px]" style={{ color: gl.muted }}>
                Most frequent codes across all cases
              </p>
              <BarList rows={data.topCodes} />
            </GlassCard>
          )}
        </div>
      </div>
    </main>
  )
}
