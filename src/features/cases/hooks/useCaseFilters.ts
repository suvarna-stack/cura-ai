// ============================================================
// E-commerce style faceted filtering over the case list
// (hospital feedback items 1, 4, 5, 7).
// Pure client-side; the future backend can accept the same
// selections as query params.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Scissors, Scan, Pill, FlaskConical, ClipboardList } from "lucide-react";
import type { RichCase, RichIncompleteGroup } from "./useCases";

// meeting item 1: the Encounter facet is gone — the dashboard is OPD-only, so
// its single "OPD" option filtered nothing. item 6: Coder joins the sidebar.
// no Department facet: the OPD extract carries no department (every real case
// reads "—"), so it only ever listed the seeded showcase cases — noise
export type FacetKey = "coverage" | "coder" | "ordercat" | "ordername" | "icd10" | "icd9";

export type DateMode = "specific" | "range" | "quick" | null;
export type QuickFilter = "today" | "week" | "month" | "year" | null;
/** date sort first (panel default), then confidence, then code A–Z (item 4) */
export type SortMode =
  | "date-desc" | "date-asc"
  | "conf-desc" | "conf-asc"
  | "code-asc";

export interface FacetOption {
  value: string; label: string; count: number; selected: boolean;
  /** second-level options shown nested under this one (Order Type -> the
   *  studies inside it). Only present once the parent option is ticked. */
  children?: FacetOption[];
}
export interface Facet {
  key: FacetKey; label: string; options: FacetOption[];
  /** options are NOT capped — the panel shows a search box over them */
  searchable?: boolean;
  /** rendered as a section inside the Order Type card, not as its own card */
  embedded?: boolean;
}

export const ORDER_LABEL: Record<string, string> = {
  medicine: "Medicine", lab: "Lab", "X-ray": "CT / X-ray", surgery: "Surgery", other: "Other",
};
/** item 13b: a case usually has several order types, so it is grouped by ONE
 *  primary type — the most clinically significant one it has. */
export const ORDER_PRIORITY = ["surgery", "X-ray", "medicine", "lab", "other"] as const;
const ORDER_ICONS: Record<string, RichIncompleteGroup["icon"]> = {
  surgery: Scissors, "X-ray": Scan, medicine: Pill, lab: FlaskConical, other: ClipboardList,
};
export const primaryOrderType = (orders?: Record<string, number>): string =>
  ORDER_PRIORITY.find((k) => (orders?.[k] ?? 0) > 0) ?? "other";

/** The subset of case fields the facets read — RichCase and the enriched
 *  FinishedCase both satisfy it, so the sidebar filters apply to every tab. */
export interface FacetableCase {
  coverage?: string | null;
  coverageFamily?: string | null;
  dept?: string;
  coders?: string[];
  coder?: string;
  orders?: Record<string, number>;
  /** category -> the distinct order names on this case (the second filter level) */
  orderNames?: Record<string, string[]>;
  /** the case's codes — the ICD-10 / ICD-9 facets filter on these; desc
   *  (when the row carries it) feeds the ICD filter dialog's descriptions */
  codes?: { code: string; system?: string; desc?: string | null }[];
}

/** A case that can also be counted into the facet pool — adds the fields the
 *  search box and date window read. Both RichCase and FinishedCase satisfy it. */
export type FacetPoolCase = FacetableCase & {
  id?: string;
  hn?: string | null;
  created_at?: string;
};

function facetValue(c: FacetableCase, key: FacetKey): string[] {
  switch (key) {
    // item 14: filter per coverage SCHEME (OFC), not per internal code (OFC_O4)
    case "coverage":  return c.coverageFamily ? [c.coverageFamily] : [];
    // item 6: every coder who touched the case. Only finished/reopened cases
    // carry coders — iMed assigns no coder to an open case.
    case "coder":     return c.coders?.length ? c.coders : (c.coder ? [c.coder] : []);
    case "ordercat":  return Object.keys(c.orders ?? {});
    // second level: the actual study / drug / lab item behind an order type
    case "ordername": return orderNamesOf(c);
    // the case's diagnosis / procedure codes, split by coding system
    case "icd10":     return codesOf(c, "ICD-10");
    case "icd9":      return codesOf(c, "ICD-9");
  }
}

function codesOf(c: FacetableCase, system: string): string[] {
  return (c.codes ?? []).filter((k) => k.system === system).map((k) => k.code);
}

/** The case's order names, optionally restricted to some order types. With no
 *  type selected the second-level filter lists everything; once the coder picks
 *  "CT / X-ray" it narrows to the studies inside it (Chest PA, CT Brain…). */
function orderNamesOf(c: FacetableCase, cats: string[] = []): string[] {
  const byCat = c.orderNames ?? {};
  const keys = cats.length ? cats : Object.keys(byCat);
  return keys.flatMap((k) => byCat[k] ?? []);
}

const FACET_DEFS: { key: FacetKey; label: string; labelOf?: (v: string) => string; nested?: boolean; searchable?: boolean; embedded?: boolean }[] = [
  // Order Type leads the sidebar (user request 22/07/2026), Coverage follows
  { key: "ordercat",  label: "Order Type", labelOf: (v) => ORDER_LABEL[v] ?? v },
  // second level: rendered nested inside Order Type, never as its own card
  { key: "ordername", label: "Study / Item", nested: true },
  // filter by the codes on the case — hundreds of distinct codes, so the panel
  // renders these with a search box. embedded: shown as sections INSIDE the
  // Order Type card, not as cards of their own (user request 22/07/2026)
  { key: "icd10",     label: "ICD-10", searchable: true, embedded: true },
  { key: "icd9",      label: "ICD-9",  searchable: true, embedded: true },
  { key: "coverage",  label: "Healthcare Coverage (สิทธิการรักษา)" },
  { key: "coder",     label: "Coder" },
];

function matches(c: FacetableCase, sel: Record<FacetKey, Set<string>>): boolean {
  return FACET_DEFS.every(({ key }) => {
    const s = sel[key];
    if (!s || s.size === 0) return true;                 // facet inactive
    return facetValue(c, key).some((v) => s.has(v));     // OR within a facet
  });
}

// Like matches(), but ignores one facet's own selection. Used to count that
// facet's options so ticking one option never hides its siblings — which is
// what makes multiple selection within a facet actually usable.
function matchesExcept(c: FacetableCase, sel: Record<FacetKey, Set<string>>, except: FacetKey): boolean {
  return FACET_DEFS.every(({ key }) => {
    if (key === except) return true;
    const s = sel[key];
    if (!s || s.size === 0) return true;
    return facetValue(c, key).some((v) => s.has(v));
  });
}

export interface CaseFilters {
  facets: Facet[];
  chips: { key: FacetKey; value: string; label: string }[];
  /** ICD code -> catalog description, harvested from the loaded cases' code
   *  previews — lets the ICD filter dialog show meanings with no extra fetch */
  codeDesc: Record<string, string>;
  filteredComplete: RichCase[];
  filteredGroups: RichIncompleteGroup[];
  totalComplete: number;
  totalIncomplete: number;
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  toggle: (key: FacetKey, value: string) => void;
  clearAll: () => void;
  active: boolean;
  query: string;
  setQuery: (q: string) => void;
  // ---- date period (repurposed 2026-08-05): the selection no longer filters
  // the case lists — it is the SYNC period. DateFilterBar reads syncWindow and
  // fires POST /api/sync {from,to}; no selection = sync all.
  dateMode: DateMode;
  setDateMode: (mode: DateMode) => void;
  specificDate: string | null;      // ISO date string (yyyy-mm-dd)
  setSpecificDate: (d: string | null) => void;
  dateFrom: string | null;          // ISO date string
  setDateFrom: (d: string | null) => void;
  dateTo: string | null;            // ISO date string
  setDateTo: (d: string | null) => void;
  quickFilter: QuickFilter;
  setQuickFilter: (q: QuickFilter) => void;
  clearDateFilter: () => void;
  /** true when a sync period is currently selected */
  dateActive: boolean;
  /** the selected period as a visit-date window for POST /api/sync
   *  (inclusive YYYY-MM-DD bounds); null = no selection = sync everything */
  syncWindow: { from?: string; to?: string } | null;
  /** the active facet predicate — lets the Finished tab (which bypasses this
   *  hook's lists) apply the sidebar filters to its enriched rows */
  matchesFacets: (c: FacetableCase) => boolean;
}

// ---- sync-period helpers ----------------------------------------------------
/** Local YYYY-MM-DD (toISOString would shift the day in TH). */
const isoDay = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Quick chip -> period start; the period always ends today. */
function quickStart(q: Exclude<QuickFilter, null>): string {
  const now = new Date();
  switch (q) {
    case "today": return isoDay(now);
    case "week": {
      const dow = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
      return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow));
    }
    case "month": return isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
    case "year":  return isoDay(new Date(now.getFullYear(), 0, 1));
  }
}

const EMPTY: Record<FacetKey, Set<string>> = {
  coverage: new Set(), coder: new Set(),
  ordercat: new Set(), ordername: new Set(),
  icd10: new Set(), icd9: new Set(),
};

// ---- filter state persistence -----------------------------------------------
// The Dashboard unmounts while a case detail is open, which used to wipe every
// sidebar selection on Back. The hook snapshots its state to sessionStorage so
// the round-trip restores it; a new browser session still starts clean.
const STORE_KEY = "caseFilters";
const FACET_KEYS: FacetKey[] = ["coverage", "coder", "ordercat", "ordername", "icd10", "icd9"];
const SORT_MODES: SortMode[] = ["date-desc", "date-asc", "conf-desc", "conf-asc", "code-asc"];
interface StoredFilters {
  sel?: Partial<Record<FacetKey, string[]>>;
  sortMode?: SortMode; query?: string;
  dateMode?: DateMode; specificDate?: string | null;
  dateFrom?: string | null; dateTo?: string | null; quickFilter?: QuickFilter;
}
function readStored(): StoredFilters {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "{}") as StoredFilters; }
  catch { return {}; }
}

/**
 * @param facetExtra rows that live outside `complete`/`groups` (Finished,
 * Reopened) but must still be counted when building the facet options.
 */
export function useCaseFilters(
  complete: RichCase[],
  groups: RichIncompleteGroup[],
  facetExtra: FacetPoolCase[] = [],
): CaseFilters {
  // every piece of state initializes from the sessionStorage snapshot, so Back
  // from a case detail (which unmounts the Dashboard) restores the sidebar
  const [sel, setSel] = useState<Record<FacetKey, Set<string>>>(() => {
    const s = readStored().sel;
    if (!s) return EMPTY;
    return Object.fromEntries(FACET_KEYS.map(k => [k, new Set(s[k] ?? [])])) as Record<FacetKey, Set<string>>;
  });
  // default sort: code A–Z (user request 21/07/2026 — was newest-first);
  // date and confidence sorts remain available in the panel
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const m = readStored().sortMode;
    return m && SORT_MODES.includes(m) ? m : "code-asc";
  });
  const [query, setQuery] = useState(() => readStored().query ?? "");
  // date filter state (Prompt 3)
  const [dateMode, setDateMode] = useState<DateMode>(() => readStored().dateMode ?? null);
  const [specificDate, setSpecificDate] = useState<string | null>(() => readStored().specificDate ?? null);
  const [dateFrom, setDateFrom] = useState<string | null>(() => readStored().dateFrom ?? null);
  const [dateTo, setDateTo] = useState<string | null>(() => readStored().dateTo ?? null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => readStored().quickFilter ?? null);

  useEffect(() => {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({
      sel: Object.fromEntries(FACET_KEYS.map(k => [k, [...sel[k]]])),
      sortMode, query, dateMode, specificDate, dateFrom, dateTo, quickFilter,
    } satisfies StoredFilters));
  }, [sel, sortMode, query, dateMode, specificDate, dateFrom, dateTo, quickFilter]);

  return useMemo(() => {
    // item 4: the A–Z key is the case's primary code — the one the card leads
    // with. Codes arrive principal-diagnosis-first from the API. Cases with no
    // code sort last (￿) instead of jumping to the front.
    const codeKey = (c: RichCase) => (c.codes?.[0]?.code ?? "￿").toUpperCase();
    // date (created_at ISO strings compare lexicographically), confidence or
    // code; id as the stable tie-break.
    const bySortMode = (a: RichCase, b: RichCase): number => {
      switch (sortMode) {
        case "date-desc": return (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id);
        case "date-asc":  return (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
        case "conf-desc": return (b.confidence - a.confidence) || a.id.localeCompare(b.id);
        case "conf-asc":  return (a.confidence - b.confidence) || a.id.localeCompare(b.id);
        case "code-asc":  return codeKey(a).localeCompare(codeKey(b)) || a.id.localeCompare(b.id);
      }
    };

    // text search over what the placeholder advertises: VN / HN, ICD codes
    const q = query.trim().toLowerCase();
    const matchesQuery = (c: FacetPoolCase) =>
      q === "" ||
      (c.id ?? "").toLowerCase().includes(q) ||
      (c.hn ?? "").toLowerCase().includes(q) ||
      (c.codes ?? []).some((k) => k.code.toLowerCase().includes(q));

    // the date selection is the SYNC period, not a list filter (2026-08-05):
    // resolve it to an inclusive {from,to} visit-date window for POST /api/sync
    const dateActive =
      (dateMode === "specific" && specificDate !== null) ||
      (dateMode === "range" && (dateFrom !== null || dateTo !== null)) ||
      (dateMode === "quick" && quickFilter !== null);
    const syncWindow = !dateActive ? null
      : dateMode === "specific" && specificDate ? { from: specificDate, to: specificDate }
      : dateMode === "range" ? { from: dateFrom ?? undefined, to: dateTo ?? undefined }
      : quickFilter ? { from: quickStart(quickFilter), to: isoDay(new Date()) }
      : null;

    const filteredComplete = complete
      .filter((c) => matches(c, sel) && matchesQuery(c)).sort(bySortMode);
    const keep = (c: RichCase) => matches(c, sel) && matchesQuery(c);
    // item 13: the Incomplete tab groups by the case's primary order type.
    // (Disease grouping was dropped at the hospital's request — the API still
    // sends disease groups, so the cases are flattened and re-bucketed here.)
    const orderGroups = (): RichIncompleteGroup[] => {
      const buckets = new Map<string, RichIncompleteGroup["cases"]>();
      for (const g of groups)
        for (const c of g.cases)
          if (keep(c)) {
            const k = primaryOrderType(c.orders);
            (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c);
          }
      return ORDER_PRIORITY
        .filter((k) => buckets.has(k))
        .map((k) => ({
          id: `order-${k}`,
          label: `${ORDER_LABEL[k] ?? k} Group`,
          total: buckets.get(k)!.length,
          icon: ORDER_ICONS[k] ?? ClipboardList,
          cases: buckets.get(k)!.sort(bySortMode),
        }));
    };
    const filteredGroups = orderGroups();

    // Each facet's counts are taken over a pool filtered by all OTHER facets
    // (not itself), so selecting an option never zeroes out its siblings — this
    // is what lets the coder tick several options in the same facet (OR within).
    // facetExtra = the Finished / Reopened rows, which bypass this hook's lists
    // but must still contribute facet options — the Coder facet (item 6) would
    // otherwise be empty, since only those rows carry a coder.
    const allCases: FacetPoolCase[] = [...complete, ...groups.flatMap((g) => g.cases), ...facetExtra];
    /** ALL studies inside one order type (ranked by count), for the nested
     *  second level. Not capped here — an order type can hold hundreds of
     *  items, so the panel shows a search box and caps the visible slice. */
    const studiesIn = (cat: string): FacetOption[] => {
      const counts = new Map<string, number>();
      for (const c of allCases.filter((x) => matchesExcept(x, sel, "ordername")))
        for (const v of new Set(orderNamesOf(c, [cat]))) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const v of sel.ordername) if (!counts.has(v)) counts.set(v, 0); // keep ticked ones visible
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, label: value, count, selected: sel.ordername.has(value) }));
    };

    const facets: Facet[] = FACET_DEFS.filter((d) => !d.nested).map(({ key, label, labelOf, searchable, embedded }) => {
      const facetPool = allCases.filter((c) => matchesExcept(c, sel, key) && matchesQuery(c));
      const counts = new Map<string, number>();
      for (const c of facetPool) for (const v of new Set(facetValue(c, key))) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const v of sel[key]) if (!counts.has(v)) counts.set(v, 0); // keep selected visible
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      // searchable facets carry the FULL ranked list — the panel adds a search
      // box and caps only what is shown, so no option is ever unreachable
      const options = searchable ? ranked : ranked.slice(0, 12);
      // guarantee ticked options stay visible even if they rank past the cap
      for (const e of ranked) if (sel[key].has(e[0]) && !options.some((o) => o[0] === e[0])) options.push(e);
      return {
        key, label, searchable, embedded,
        options: options.map(([value, count]) => {
          const selected = sel[key].has(value);
          return {
            value, label: labelOf ? labelOf(value) : value, count, selected,
            // ticking an order type reveals the studies inside it
            children: key === "ordercat" && selected ? studiesIn(value) : undefined,
          };
        }),
      };
      // searchable facets (ICD-10 / ICD-9) keep their card even when the current
      // cross-filter leaves them no options — a vanishing card reads as a bug;
      // the panel shows "no items" instead
    }).filter((f) => f.options.length > 0 || f.searchable);

    const chips = FACET_DEFS.flatMap(({ key, labelOf }) =>
      [...sel[key]].map((value) => ({ key, value, label: labelOf ? labelOf(value) : value })));

    // code -> description, for the ICD filter dialog (first non-empty wins)
    const codeDesc: Record<string, string> = {};
    for (const c of allCases)
      for (const k of c.codes ?? [])
        if (k.desc && !codeDesc[k.code]) codeDesc[k.code] = k.desc;

    const clearDateFilter = () => {
      setDateMode(null); setSpecificDate(null); setDateFrom(null); setDateTo(null); setQuickFilter(null);
    };

    return {
      facets, chips, codeDesc, filteredComplete, filteredGroups,
      totalComplete: filteredComplete.length,
      totalIncomplete: filteredGroups.reduce((n, g) => n + g.cases.length, 0),
      sortMode, setSortMode,
      toggle: (key: FacetKey, value: string) =>
        setSel((prev) => {
          const next = { ...prev, [key]: new Set(prev[key]) };
          if (next[key].has(value)) next[key].delete(value); else next[key].add(value);
          return next;
        }),
      // clearAll resets the facets/search only — the date selection is the
      // sync period, cleared by its own bar button
      clearAll: () => { setSel(EMPTY); setQuery(""); },
      active: chips.length > 0 || q !== "",
      query, setQuery,
      dateMode, setDateMode,
      specificDate, setSpecificDate,
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      quickFilter, setQuickFilter,
      clearDateFilter, dateActive, syncWindow,
      matchesFacets: (c: FacetableCase) => matches(c, sel),
    };
  }, [complete, groups, facetExtra, sel, sortMode, query,
      dateMode, specificDate, dateFrom, dateTo, quickFilter]);
}
