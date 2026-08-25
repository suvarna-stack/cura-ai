// ============================================================
// Date-window value + helpers, kept component-free so fast
// refresh works in DateRangeDialog (same split as
// LanguageContext / LanguageProvider).
// ============================================================

/** An inclusive day window. `null` anywhere means "no window — everything". */
export interface DateRange {
  /** ISO YYYY-MM-DD, inclusive. */
  from: string;
  /** ISO YYYY-MM-DD, inclusive. */
  to: string;
}

/** Local YYYY-MM-DD. Deliberately NOT toISOString(), which is UTC and lands
 *  on yesterday for any timezone east of Greenwich after 00:00 local — which
 *  is every timezone this product runs in. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const shift = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

/** Monday-first, matching the hospital's week. */
const startOfWeek = (): Date => {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
};

const startOfMonth = (): Date => {
  const d = new Date();
  d.setDate(1);
  return d;
};

export interface QuickPreset {
  id: string;
  label: string;
  /** null → clear the window entirely. */
  range: () => DateRange | null;
}

export const QUICK_PRESETS: QuickPreset[] = [
  { id: "today", label: "Today", range: () => ({ from: isoDay(new Date()), to: isoDay(new Date()) }) },
  { id: "yesterday", label: "Yesterday", range: () => ({ from: isoDay(shift(-1)), to: isoDay(shift(-1)) }) },
  { id: "week", label: "This week", range: () => ({ from: isoDay(startOfWeek()), to: isoDay(new Date()) }) },
  { id: "month", label: "This month", range: () => ({ from: isoDay(startOfMonth()), to: isoDay(new Date()) }) },
  { id: "last7", label: "Last 7 days", range: () => ({ from: isoDay(shift(-6)), to: isoDay(new Date()) }) },
  { id: "last30", label: "Last 30 days", range: () => ({ from: isoDay(shift(-29)), to: isoDay(new Date()) }) },
  { id: "all", label: "All time", range: () => null },
];

/** How a window reads on a button. Collapses a one-day window to that day. */
export function rangeLabel(r: DateRange | null, allLabel = "All time"): string {
  if (!r) return allLabel;
  return r.from === r.to ? r.from : `${r.from} → ${r.to}`;
}
