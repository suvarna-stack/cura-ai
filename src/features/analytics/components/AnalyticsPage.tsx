import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useEffect, useState, type CSSProperties } from 'react'
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Flag,
  BarChart3,
  ShieldQuestion,
  Tags,
  Activity,
  Clock3,
  Gauge,
  FileWarning,
  Hash,
  ClipboardList,
  Grid3x3,
} from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { GlassCard } from '../../cases/components/global/GlassCard'
import { EmptyState } from '../../cases/components/global/EmptyState'
import { formatDate } from '../../cases/utils/formatDate'
import { fetchAnalytics } from '../api/analyticsService'
import type { AnalyticsData } from '../types/analytics.types'
import { EMPTY_ANALYTICS } from '../types/analytics.types'

/** polyline() against a caller-supplied max, so several series drawn on the
 *  same chart share one vertical scale and stay comparable. */
function polylineShared(
  data: number[],
  max: number,
  w: number,
  h: number,
  pad = 6,
) {
  const range = max || 1
  return data
    .map((v, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)
      const y = h - pad - (v / range) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')
}

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

/** "95 min" / "2.4 h" / "3.1 d" — the server sends whole minutes. */
function humanizeMinutes(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  if (m < 48 * 60) return `${(m / 60).toFixed(1)} h`
  return `${(m / 1440).toFixed(1)} d`
}

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

/** Like BarList, but each bar is a share of its own row's total (x/y). */
function RateList({
  rows,
}: {
  rows: { label: string; incomplete: number; total: number }[]
}) {
  const { gl } = useTheme()
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
              {r.incomplete}/{r.total}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: `rgba(${gl.accentRgb},0.10)` }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(r.incomplete / Math.max(r.total, 1)) * 100}%`,
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

/** Disease-group × severity heat table. Cell tint scales with its count
 *  against the biggest cell on the card, so one heavy group doesn't wash
 *  every other row invisible. */
function CaseMixTable({
  groups,
}: {
  groups: {
    label: string
    low: number
    medium: number
    high: number
    other: number
    total: number
  }[]
}) {
  const { gl } = useTheme()
  const cols = ['low', 'medium', 'high'] as const
  const maxCell = Math.max(
    ...groups.flatMap((g) => cols.map((c) => g[c])),
    1,
  )
  const cell = (v: number) => ({
    background:
      v === 0 ? 'transparent' : `rgba(${gl.accentRgb},${0.08 + (v / maxCell) * 0.42})`,
    color: gl.text,
  })
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: '0 3px' }}>
        <caption className="sr-only">
          Cases per disease group, split by severity
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="pb-1 text-left text-[11px] font-semibold"
              style={{ color: gl.muted }}
            >
              Disease group
            </th>
            {['Low', 'Medium', 'High', 'Total'].map((h) => (
              <th
                key={h}
                scope="col"
                className="pb-1 text-center text-[11px] font-semibold"
                style={{ color: gl.muted, minWidth: 46 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <th
                scope="row"
                className="truncate pr-2 text-left text-[12px] font-semibold"
                style={{ color: gl.text, maxWidth: 140 }}
                title={g.label}
              >
                {truncate(g.label, 20)}
              </th>
              {cols.map((c) => (
                <td
                  key={c}
                  className="rounded-md py-1 text-center text-[12px] font-semibold"
                  style={cell(g[c])}
                >
                  {g[c] || ''}
                </td>
              ))}
              <td
                className="py-1 text-center text-[12px] font-bold"
                style={{ color: gl.accent }}
              >
                {g.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AnalyticsPage() {
  const { gl } = useTheme()
  useDocumentTitle("Analytics")
  const [data, setData] = useState<AnalyticsData>(EMPTY_ANALYTICS)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await fetchAnalytics()
        if (!cancelled) setData(next)
      } catch {
        // No mock to fall back to: an unreachable server must READ as
        // unreachable, not as a hospital with zero cases.
        if (!cancelled) setFailed(true)
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
  // The series is zero-filled server-side, so "all zero" — not "no points" —
  // is what an empty window looks like.
  const noVisits = timeCounts.every((c) => c === 0)

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

  // Second KPI row — how the coding work itself is going. Turnaround is
  // sync→first-approval; "—" until anything has been approved.
  const statRow2 = [
    {
      label: `Median Time to Code${
        data.turnaround.cases ? ` (${data.turnaround.cases} cases)` : ''
      }`,
      value: humanizeMinutes(data.turnaround.medianMinutes),
      icon: Clock3,
    },
    {
      label: 'P90 Time to Code',
      value: humanizeMinutes(data.turnaround.p90Minutes),
      icon: Gauge,
    },
    {
      label: 'Uncoded Cases',
      value: String(data.codingDepth.uncoded),
      icon: FileWarning,
    },
    {
      label: 'Avg Codes per Case',
      value:
        data.codingDepth.avgCodesPerCase == null
          ? '—'
          : data.codingDepth.avgCodesPerCase.toFixed(1),
      icon: Hash,
    },
  ]

  // Coding-activity series (same zero-fill contract as casesOverTime).
  const approvedSeries = data.codingActivity.map((d) => d.approved)
  const codedSeries = data.codingActivity.map((d) => d.coded)
  const reopenedSeries = data.codingActivity.map((d) => d.reopened)
  const activityMax = Math.max(...approvedSeries, ...codedSeries, ...reopenedSeries, 0)
  const noActivity = activityMax === 0
  const anyReopened = reopenedSeries.some((v) => v > 0)

  const gapItems = data.documentationGaps.items.map((g) => ({
    label: g.label,
    count: g.count,
  }))
  const gapGroups = data.documentationGaps.byGroup
    .filter((g) => g.incomplete > 0)
    .slice(0, 8)

  const depthBars = data.codingDepth.distribution.map((b) => ({
    label: b.bucket === '0' ? '0 (uncoded)' : `${b.bucket} codes`,
    count: b.cases,
  }))
  const roleBars = data.codingDepth.roleMix.map((r) => ({
    label: r.label,
    count: r.count,
  }))
  const mixGroups = data.caseMix.groups.slice(0, 8)

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
            {failed
              ? 'Could not reach the server'
              : 'Live view of the synced hospital data'}
          </p>
        </div>
      </header>

      <div className="space-y-4 p-5">
        {failed && (
          <GlassCard className="p-5">
            <EmptyState
              icon={BarChart3}
              title="Analytics unavailable"
              subtext="The server did not answer. These figures are read live on every visit — nothing is cached — so reload once it is back."
              actionLabel="Reload"
              onAction={() => window.location.reload()}
            />
          </GlassCard>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ChartSkeleton key={i} height={44} />
            ))}
          </div>
        ) : failed ? null : (
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
                  className="mt-0.5 text-[12px] font-semibold"
                  style={{ color: gl.muted }}
                >
                  {s.label}
                </p>
              </GlassCard>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ChartSkeleton key={i} height={44} />
            ))}
          </div>
        ) : failed ? null : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {statRow2.map((s) => (
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
                  className="mt-0.5 text-[12px] font-semibold"
                  style={{ color: gl.muted }}
                >
                  {s.label}
                </p>
              </GlassCard>
            ))}
          </div>
        )}

        {loading ? (
          <ChartSkeleton height={H} />
        ) : failed ? null : (
          <GlassCard className="p-5">
            <p className="mb-1 text-[15px] font-bold" style={{ color: gl.text }}>
              Cases Over Time
            </p>
            <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
              New cases per day ·{' '}
              {formatDate(data.casesOverTime[0]?.iso ?? new Date())} –{' '}
              {formatDate(data.casesOverTime.at(-1)?.iso ?? new Date())}
            </p>
            {noVisits ? (
              <EmptyState
                icon={BarChart3}
                title="No visits in this window"
                subtext="No OPD visit in the last 30 days carries a date. Run a sync to pull more."
              />
            ) : (
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
            )}
          </GlassCard>
        )}

        {loading ? (
          <ChartSkeleton height={H} />
        ) : failed ? null : (
          <GlassCard className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[15px] font-bold" style={{ color: gl.text }}>
                Coding Activity
              </p>
              {!noActivity && (
                <div className="flex items-center gap-3">
                  {[
                    { label: 'Approved', dash: undefined, opacity: 1 },
                    { label: 'Codes assigned', dash: '4 3', opacity: 0.45 },
                    ...(anyReopened
                      ? [{ label: 'Reopened', dash: '1.5 3', opacity: 0.7 }]
                      : []),
                  ].map((s) => (
                    <span
                      key={s.label}
                      className="flex items-center gap-1.5 text-[11px] font-semibold"
                      style={{ color: gl.muted }}
                    >
                      <svg width={18} height={4} aria-hidden="true">
                        <line
                          x1={0}
                          y1={2}
                          x2={18}
                          y2={2}
                          stroke={gl.accent}
                          strokeWidth={2}
                          strokeOpacity={s.opacity}
                          strokeDasharray={s.dash}
                        />
                      </svg>
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
              Approvals and code assignments per day, from the audit trail
            </p>
            {noActivity ? (
              <EmptyState
                icon={Activity}
                title="No coder activity in this window"
                subtext="Approvals, code assignments and reopens show up here as they happen."
              />
            ) : (
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
                {data.codingActivity.map(
                  (d, i) =>
                    i % 5 === 0 && (
                      <text
                        key={d.iso}
                        x={
                          pad +
                          (i / Math.max(data.codingActivity.length - 1, 1)) *
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
                <polyline
                  points={polylineShared(codedSeries, activityMax, W, H, pad)}
                  fill="none"
                  stroke={gl.accent}
                  strokeOpacity={0.45}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {anyReopened && (
                  <polyline
                    points={polylineShared(reopenedSeries, activityMax, W, H, pad)}
                    fill="none"
                    stroke={gl.accent}
                    strokeOpacity={0.7}
                    strokeWidth={2}
                    strokeDasharray="1.5 3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                <polyline
                  points={polylineShared(approvedSeries, activityMax, W, H, pad)}
                  fill="none"
                  stroke={gl.accent}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {data.codingActivity.map((d, i) => {
                  const x =
                    pad +
                    (i / Math.max(data.codingActivity.length - 1, 1)) *
                      (W - pad * 2)
                  const y =
                    H - pad - (d.approved / Math.max(activityMax, 1)) * (H - pad * 2)
                  return (
                    <circle key={d.iso} cx={x} cy={y} r={2.5} fill={gl.accent}>
                      <title>{`${formatDate(d.iso)} · approved ${d.approved} · coded ${d.coded}${d.reopened ? ` · reopened ${d.reopened}` : ''}`}</title>
                    </circle>
                  )
                })}
              </svg>
            )}
          </GlassCard>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Cases by Coverage Type
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                สิทธิการรักษา breakdown
              </p>
              {data.coverageCounts.length === 0 ? (
                <EmptyState
                  icon={ShieldQuestion}
                  title="No coverage data yet"
                  subtext="Sync cases from iMed to see the สิทธิการรักษา breakdown."
                />
              ) : (
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
                        className="truncate text-[12px] font-medium"
                        style={{ color: gl.muted }}
                        title={seg.label}
                      >
                        {truncate(seg.label, 18)}
                      </span>
                      <span
                        className="ml-auto shrink-0 text-[12px] font-bold"
                        style={{ color: gl.text }}
                      >
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </GlassCard>
          )}

          {loading ? (
            <ChartSkeleton height={180} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Top {data.topCodes.length || 10} ICD Codes
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                Most frequent codes across all cases
              </p>
              {data.topCodes.length === 0 ? (
                <EmptyState
                  icon={Tags}
                  title="No codes assigned yet"
                  subtext="Codes appear here once cases arrive coded from iMed or a coder assigns them."
                />
              ) : (
                <BarList rows={data.topCodes} />
              )}
            </GlassCard>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loading ? (
            <ChartSkeleton height={180} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                What Incomplete Cases Are Missing
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                Cases missing each item — a case can count in several rows
              </p>
              {gapItems.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing is missing"
                  subtext="Every synced case arrived with both code systems."
                />
              ) : (
                <BarList rows={gapItems} />
              )}
            </GlassCard>
          )}

          {loading ? (
            <ChartSkeleton height={180} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Incomplete Cases by Disease Group
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                Incomplete out of total, worst first
              </p>
              {gapGroups.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No incomplete cases"
                  subtext="Groups appear here when a sync brings cases missing codes."
                />
              ) : (
                <RateList rows={gapGroups} />
              )}
            </GlassCard>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Coding Depth
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                How many codes each case carries
              </p>
              <BarList rows={depthBars} />
              <p
                className="mt-5 mb-1 flex items-center gap-1.5 text-[13px] font-bold"
                style={{ color: gl.text }}
              >
                <ClipboardList size={13} style={{ color: gl.accent }} />
                Code Roles
              </p>
              <p className="mb-3 text-[12px]" style={{ color: gl.muted }}>
                All assigned codes by role
              </p>
              {roleBars.length === 0 ? (
                <p className="text-[12px]" style={{ color: gl.muted }}>
                  —
                </p>
              ) : (
                <BarList rows={roleBars} />
              )}
            </GlassCard>
          )}

          {loading ? (
            <ChartSkeleton height={200} />
          ) : failed ? null : (
            <GlassCard className="p-5">
              <p
                className="mb-1 text-[15px] font-bold"
                style={{ color: gl.text }}
              >
                Case Mix
              </p>
              <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
                Disease group by severity
                {data.caseMix.groups.length > mixGroups.length
                  ? ` · top ${mixGroups.length} of ${data.caseMix.groups.length} groups`
                  : ''}
              </p>
              {mixGroups.length === 0 ? (
                <EmptyState
                  icon={Grid3x3}
                  title="No cases yet"
                  subtext="Sync cases from iMed to see the case mix."
                />
              ) : (
                <CaseMixTable groups={mixGroups} />
              )}
              {(data.caseMix.sex.length > 0 || data.caseMix.age.length > 0) && (
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p
                      className="mb-2 text-[13px] font-bold"
                      style={{ color: gl.text }}
                    >
                      Sex
                    </p>
                    <BarList rows={data.caseMix.sex} />
                  </div>
                  <div>
                    <p
                      className="mb-2 text-[13px] font-bold"
                      style={{ color: gl.text }}
                    >
                      Age
                    </p>
                    <BarList rows={data.caseMix.age} />
                  </div>
                </div>
              )}
            </GlassCard>
          )}
        </div>
      </div>
    </main>
  )
}
