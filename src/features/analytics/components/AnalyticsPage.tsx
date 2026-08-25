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
  UserCheck,
  ClipboardList,
  Grid3x3,
  CalendarRange,
  Stethoscope,
  Gauge,
} from 'lucide-react'
import { useTheme } from '../../cases/context/ThemeContext'
import { GlassCard } from '../../cases/components/global/GlassCard'
import { EmptyState } from '../../cases/components/global/EmptyState'
import { DateRangeDialog } from '../../cases/components/global/DateRangeDialog'
import { rangeLabel, type DateRange } from '../../cases/utils/dateRange'
import { fetchAnalytics } from '../api/analyticsService'
import type { AnalyticsData } from '../types/analytics.types'
import { EMPTY_ANALYTICS } from '../types/analytics.types'

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

/** The hospital's KPI table: one row per coder, two percentages.
 *
 *  A null percentage renders "—", never 0% — an empty denominator is "not
 *  measured", and showing it as zero would read as a failing coder. The raw
 *  counts sit under each percentage so the number can be checked. */
function CoderKpiTable({
  rows,
}: {
  rows: AnalyticsData['coderKpi']
}) {
  const { gl } = useTheme()
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
  const head = 'pb-1 text-[11px] font-semibold'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: '0 4px' }}>
        <caption className="sr-only">
          Finish rate and 7-day turnaround per coder
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`${head} text-left`} style={{ color: gl.muted }}>
              Coder
            </th>
            <th scope="col" className={`${head} text-center`} style={{ color: gl.muted, minWidth: 96 }}>
              Finish case (%)
            </th>
            <th scope="col" className={`${head} text-center`} style={{ color: gl.muted, minWidth: 110 }}>
              Duration &lt; 7 days (%)
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.coderId}>
              <th
                scope="row"
                className="truncate pr-2 text-left text-[12px] font-semibold"
                style={{ color: gl.text, maxWidth: 180 }}
                title={r.coderId}
              >
                {truncate(r.coder, 26)}
              </th>
              <td className="text-center">
                <span className="text-[13px] font-bold" style={{ color: gl.accent }}>
                  {pct(r.finishedPct)}
                </span>
                <span className="ml-1 text-[11px]" style={{ color: gl.muted }}>
                  ({r.finished}/{r.touched})
                </span>
              </td>
              <td className="text-center">
                <span className="text-[13px] font-bold" style={{ color: gl.accent }}>
                  {pct(r.within7DaysPct)}
                </span>
                <span className="ml-1 text-[11px]" style={{ color: gl.muted }}>
                  ({r.within7Days}/{r.measured})
                </span>
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
  // null = no filter: the server then serves the Dashboard's own counts
  // verbatim, which is the only state in which these tiles are guaranteed
  // to match the Dashboard's.
  const [range, setRange] = useState<DateRange | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Changing the range must put the skeletons back while the new figures load.
  // Done as a render-phase update rather than inside the effect — the same
  // idiom CasesLayout and hooks/useCaseDetail use, and the one React's
  // set-state-in-effect rule asks for.
  const [seenRange, setSeenRange] = useState(range)
  if (seenRange !== range) {
    setSeenRange(range)
    setLoading(true)
    setFailed(false)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await fetchAnalytics(30, range)
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
  }, [range])

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

  // The hospital's own four tiles (their dashboard sketch, 2026-08-25):
  // Total / Not finished / Finished / Finished %. "Not finished" is one
  // number on purpose — the coder does not care which queue a case is
  // sitting in, only that it is not done. The complete/incomplete/reopened
  // split still lives on the Dashboard and in the cards below.
  const pctText =
    data.summary.finishedPct === null ? '—' : `${data.summary.finishedPct}%`
  const statRow = [
    {
      label: 'Total Cases',
      value: String(data.summary.total),
      icon: Layers,
      hint: 'OPD visits in view',
    },
    {
      label: 'Not Finished',
      value: String(data.summary.notFinished),
      icon: AlertCircle,
      hint: `${data.summary.complete} complete · ${data.summary.incomplete} incomplete · ${data.summary.reopened} reopened`,
    },
    {
      label: 'Finished',
      value: String(data.summary.finished),
      icon: Flag,
      hint: 'approved by a coder',
    },
    {
      label: 'Finished (%)',
      value: pctText,
      icon: CheckCircle2,
      hint: 'of every case in view',
    },
  ]

  // Finished (approved) cases per coder, biggest first — server-sorted.
  const coderBars = data.finishedByCoder.map((c) => ({
    label: c.coder,
    count: c.cases,
  }))

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
              : range
                ? `Filtered to ${rangeLabel(range)}`
                : 'Live view of the synced hospital data'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {range && (
            <button
              onClick={() => setRange(null)}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold transition-all hover:opacity-80"
              style={{ border: gl.border, color: gl.muted, background: gl.inputBg }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all hover:opacity-90"
            style={
              range
                ? {
                    background: `rgba(${gl.accentRgb},0.15)`,
                    border: `1px solid rgba(${gl.accentRgb},0.35)`,
                    color: gl.accent,
                  }
                : { background: gl.inputBg, border: gl.border, color: gl.text }
            }
          >
            <CalendarRange size={13} />
            {rangeLabel(range)}
          </button>
        </div>
      </header>

      {pickerOpen && (
        <DateRangeDialog
          value={range}
          title="Filter by date"
          onApply={setRange}
          onClose={() => setPickerOpen(false)}
        />
      )}

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
                <p
                  className="mt-0.5 truncate text-[11px] font-normal"
                  style={{ color: gl.muted, opacity: 0.7 }}
                  title={s.hint}
                >
                  {s.hint}
                </p>
              </GlassCard>
            ))}
          </div>
        )}

        {loading ? (
          <ChartSkeleton height={200} />
        ) : failed ? null : (
          <GlassCard className="p-5">
            <p className="mb-1 text-[15px] font-bold" style={{ color: gl.text }}>
              Finished by Coder
            </p>
            <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
              Approved cases per coder, from the audit trail
            </p>
            {coderBars.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="Nothing approved yet"
                subtext="Each coder's finished-case count shows up here after their first approval."
              />
            ) : (
              <BarList rows={coderBars} />
            )}
          </GlassCard>
        )}

        {loading ? (
          <ChartSkeleton height={200} />
        ) : failed ? null : (
          <GlassCard className="p-5">
            <p className="mb-1 text-[15px] font-bold" style={{ color: gl.text }}>
              Coder KPI
            </p>
            {/* The honesty line. The hospital asked for "% of assigned cases
                finished"; there is no assignment system, so the denominator
                is stated in the open rather than implied. */}
            <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
              Finish rate is measured against the cases each coder{' '}
              <strong style={{ color: gl.text }}>touched</strong> — case
              assignment does not exist yet
            </p>
            {data.coderKpi.length === 0 ? (
              <EmptyState
                icon={Gauge}
                title="No coder activity yet"
                subtext="Rows appear once a coder edits or approves their first case."
              />
            ) : (
              <CoderKpiTable rows={data.coderKpi} />
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

        {loading ? (
          <ChartSkeleton height={180} />
        ) : failed ? null : (
          <GlassCard className="p-5">
            <p className="mb-1 text-[15px] font-bold" style={{ color: gl.text }}>
              Top {data.topPrincipalDiagnosis.length || 10} Principal Diagnosis
            </p>
            {/* Not a filtered view of the card above: this counts ONLY the
                principal_diagnosis role, so a common procedure or comorbidity
                cannot outrank a diagnosis. */}
            <p className="mb-4 text-[12px]" style={{ color: gl.muted }}>
              ICD-10 principal diagnoses only — procedures and comorbidities
              excluded
            </p>
            {data.topPrincipalDiagnosis.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No principal diagnosis yet"
                subtext="A case contributes here once it carries an ICD-10 code in the principal-diagnosis role."
              />
            ) : (
              <BarList rows={data.topPrincipalDiagnosis} />
            )}
          </GlassCard>
        )}

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
