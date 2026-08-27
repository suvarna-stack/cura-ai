import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, AlertCircle, Flag, RotateCcw,
  Search, Eye, X, Star,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useSync } from "../context/SyncContext";
import { useApprovals } from "../context/ApprovalsContext";
import { useActivityLog } from "../context/ActivityLogContext";
import { useCoderIdentity } from "../hooks/useCoderIdentity";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LanguageContext";
import { useCaseFields } from "../context/CaseFieldsContext";
import { ConfirmDialog } from "./global/ConfirmDialog";
import { Pagination } from "./global/Pagination";
import { EmptyState } from "./global/EmptyState";
import { CasePreview } from "./global/CasePreview";
import { FilterBar } from "./filters/FilterBar";
import { formatDate } from "../utils/formatDate";
import { useCases } from "../hooks/useCases";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import type { RichCase } from "../hooks/useCases";
import { useCaseFilters } from "../hooks/useCaseFilters";
import { useCaseStars } from "../hooks/useCaseStars";
import type { StarView } from "../hooks/useCaseStars";
import type { CaseTab, CompleteCase, IncompleteCase, FinishedCase } from "../types/case.types";

const PER_PAGE = 10;

const tabIndex: Record<CaseTab, number> = { complete: 0, incomplete: 1, reopen: 2, finished: 3 };

// Known missing-document names → dictionary keys for their SOAP abbreviations.
// Unknown names fall back to the "{n} missing" count pill.
const missingDocAbbr: Record<string, string> = {
  "Chief complaint / subjective note": "missing.doc.cc",
  "Physical examination / objective note": "missing.doc.pe",
  "Assessment / progression note": "missing.doc.ap",
  "Principal diagnosis (ICD-10)": "missing.doc.dx",
};

/**
 * The shared case star. One star per CASE, not per coder: whoever sets it,
 * every coder sees the same one — that is the whole feature ("which of these
 * should I pick up first?"), and a private favourites list would look
 * identical on screen while telling a colleague nothing. So the tooltip names
 * whoever left it; an anonymous star is just decoration.
 *
 * Seen by everyone, cleared by its author only (hospital request 2026-08-25).
 * A colleague's star still draws in full — hiding it would defeat the point —
 * but it is not a button for them: `canToggle` false renders the same glyph
 * with no click and a tooltip saying whose flag it is. The server refuses it
 * as well; this is so the refusal is visible BEFORE the click.
 *
 * Available on every row of every tab, including Finished — a finished case
 * can be the one worth re-reading.
 */
function StarButton({ view, canToggle, onToggle, vn }: {
  view: StarView;
  canToggle: boolean;
  onToggle: () => void;
  vn: string;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const label = !canToggle
    ? t("star.byLocked", { name: view.starredBy ?? "" })
    : view.starred
      ? t("star.remove", { vn })
      : t("star.add", { vn });
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={view.starred}
      disabled={!canToggle}
      // rows in the Finished tab are click-to-open; the star is not that click
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-lg transition-all ${canToggle ? "hover:opacity-100" : "cursor-default"}`}
      style={{
        color: view.starred ? gl.warning : gl.muted,
        opacity: view.starred ? 1 : 0.5,
        background: view.starred ? `${gl.warning}1F` : "transparent",
        border: view.starred ? `1px solid ${gl.warning}59` : "1px solid transparent",
      }}>
      <Star size={13} fill={view.starred ? gl.warning : "none"} />
    </button>
  );
}

/** Starred cases float to the top of their tab — a star only works if the
 *  colleague it was left for actually sees it, and these queues are paginated.
 *  Keyed on the SERVER's `starred`, never on this browser's optimistic
 *  override: clicking a star must not make the row leap out from under the
 *  cursor (or off the page entirely). It takes its new place on the next fetch.
 *  Sort is stable, so inside each half the coder's chosen order survives. */
function starFirst<T>(list: T[], of: (x: T) => boolean | undefined): T[] {
  return [...list].sort((a, b) => Number(of(b) ?? false) - Number(of(a) ?? false));
}

/** The years out of the extract's frozen "y,m,d" age string ("47,4,10" → "47").
 *  Returns null for anything that is not a leading number, so a format we have
 *  not seen prints nothing rather than something wrong. */
function ageYears(age?: string | null): string | null {
  if (!age) return null;
  const years = age.split(",")[0]?.trim();
  return years && /^\d+$/.test(years) ? years : null;
}

/** Card identity block (meeting item 2): the visit number, then the hospital
 *  number, then the facts a coder identifies a visit by — age, which coverage
 *  scheme paid for it and when it happened. iMed only fills HN for IPD
 *  admissions, so on the OPD queue it shows as "—" with the reason on hover:
 *  the gap belongs on screen, not hidden.
 *
 *  Which of name/VN/HN actually render is the admin's call (2026-08-25) — see
 *  useCaseFields. Age and the visit date are not switchable: they carry no
 *  patient identity, and the coder asked for both outright. */
function CaseIdent({ vn, hn, patient, age, coverage, date, badge }: {
  vn: string;
  hn?: string | null;
  patient?: string | null;
  age?: string | null;
  coverage?: string | null;
  date?: string | null;
  badge?: React.ReactNode;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const fields = useCaseFields();
  // labels bold, values regular; sizes +1 across the row (requests 22/07/2026)
  const label = "text-[12px] font-bold uppercase tracking-wide";
  const years = ageYears(age);
  // The name is switched on but the extract carries none — say so rather than
  // printing an empty label, which reads as a rendering bug.
  const nameText = fields.name ? (patient?.trim() || t("ident.nameMissing")) : null;
  const meta = [
    years ? { key: "age", label: t("meta.age"), value: years } : null,
    coverage ? { key: "cov", label: t("meta.coverage"), value: coverage } : null,
    date ? { key: "date", label: t("meta.date"), value: date } : null,
  ].filter(Boolean) as { key: string; label: string; value: string }[];
  return (
    <>
      {(fields.vn || badge) && (
        <div className="flex items-center gap-1.5 mb-1">
          {fields.vn && (
            <span className="text-[12px] font-medium truncate" style={{ color: gl.muted }} title={`VN ${vn}`}>
              <span className="font-bold opacity-70">VN </span>{vn}
            </span>
          )}
          {badge}
        </div>
      )}
      {nameText && (
        <p className="text-[14px] font-semibold truncate"
          style={{ color: patient?.trim() ? gl.text : gl.muted }} title={nameText}>
          {nameText}
        </p>
      )}
      {fields.hn && (
        <p className="text-[14px] font-semibold truncate" style={{ color: hn ? gl.text : gl.muted }}
          title={hn ? `HN ${hn}` : t("ident.hnMissing")}>
          <span className="text-[12px] font-bold opacity-70">HN </span>{hn ?? "—"}
          {!hn && <span className="text-[12px] font-normal ml-1.5 opacity-70">{t("ident.hnMissingShort")}</span>}
        </p>
      )}
      {meta.length > 0 && (
        <div className="flex items-center gap-x-2 flex-wrap mt-1">
          {meta.map((m, i) => (
            <span key={m.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-[12px] mr-1" style={{ color: gl.muted, opacity: 0.4 }}>·</span>}
              <span className={label} style={{ color: gl.muted, opacity: 0.75 }}>{m.label}</span>
              <span className="text-[12px] font-medium" style={{ color: gl.text }}>{m.value}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** What is left of the meta line once coverage and date moved up into the
 *  identity column: the department, in the preview's label idiom. */
function CaseMeta({ c }: { c: RichCase }) {
  const { gl } = useTheme();
  const { t } = useLang();
  const items = [
    c.dept && c.dept !== "—" ? { label: t("meta.dept"), value: c.dept } : null,
  ].filter(Boolean) as { label: string; value: string; title?: string }[];
  if (items.length === 0) return null;
  return (
    <div className="flex items-center gap-x-2 flex-wrap">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5" title={item.title}>
          {i > 0 && <span className="text-[12px]" style={{ color: gl.muted, opacity: 0.4 }}>·</span>}
          <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: gl.muted, opacity: 0.75 }}>{item.label}</span>
          <span className="text-[12px] font-medium" style={{ color: gl.text }}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

// pulsing placeholder row shown while iMed sync is running
function SkeletonRow() {
  const { gl } = useTheme();
  const bar = gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl animate-pulse"
      style={{ background: gl.row, border: gl.border, boxShadow: gl.shadowSm }}>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-2.5 w-28 rounded" style={{ background: bar }} />
        <div className="h-3 w-44 rounded" style={{ background: bar }} />
        <div className="flex gap-1.5">
          <div className="h-3.5 w-10 rounded-md" style={{ background: bar }} />
          <div className="h-3.5 w-10 rounded-md" style={{ background: bar }} />
          <div className="h-3.5 w-16 rounded-md" style={{ background: bar }} />
        </div>
      </div>
      <div className="h-5 w-12 rounded-full shrink-0" style={{ background: bar }} />
      <div className="h-8 w-16 rounded-lg shrink-0" style={{ background: bar }} />
      <div className="h-8 w-[4.5rem] rounded-lg shrink-0" style={{ background: bar }} />
    </div>
  );
}

export function CasesPage({
  openCase,
  openIncompleteCase,
  openFinishedCase,
  tab,
  setTab,
}: {
  openCase: (c: CompleteCase) => void;
  openIncompleteCase: (c: IncompleteCase) => void;
  openFinishedCase: (c: FinishedCase) => void;
  // tab state lives in App so it survives the Dashboard unmounting
  // while a detail page is open (Back returns to the same tab)
  tab: CaseTab;
  setTab: (t: CaseTab) => void;
}) {
  const { gl } = useTheme();
  const { syncing, syncVersion, requestSync } = useSync();
  const { t } = useLang();
  useDocumentTitle(t("nav.dashboard"));
  // ---- real approval workflow (SRS F14): approved cases MOVE to Finished ----
  // shared with the detail pages via ApprovalsProvider (in-memory + server)
  const { approvedIds, reopenedIds, casesVersion, approve, reopen, pruneReopened } = useApprovals();
  // casesVersion bumps on reopen; syncVersion bumps after iMed sync → silent refetch
  const { completeCases, incompleteGroups, finishedCases, loading, error } = useCases(
    casesVersion + syncVersion,
  );
  const [animating, setAnimating] = useState(false);

  // id → case lookup across both pools (declared before confirmApproval,
  // which closes over it for the log descriptions)
  const allById = useMemo(() => {
    const m = new Map<string, RichCase>();
    completeCases.forEach(c => m.set(c.id, c));
    incompleteGroups.forEach(g => g.cases.forEach(c => m.set(c.id, c)));
    return m;
  }, [completeCases, incompleteGroups]);

  // approval is a real, consequential action (cases leave the active queue), so
  // route every approve trigger through a confirmation dialog. `pendingApproval`
  // holds the ids (for the activity log) + the action to run on confirm.
  const { addLog } = useActivityLog();
  const me = useCoderIdentity();
  // the shared "look at this one first" flag; `me` only labels the optimistic
  // star until the server answers with the name it actually stamped
  const { starOf, canToggle, toggleStar } = useCaseStars(me.userName, me.userId);
  const { showToast } = useToast();
  const [pendingApproval, setPendingApproval] = useState<{ n: number; ids: string[]; run: () => void } | null>(null);
  const askApprove = (ids: string[], run: () => void) => { if (ids.length > 0) setPendingApproval({ n: ids.length, ids, run }); };
  // reopen withdraws codes already written back to iMed — same gate as approve
  const [pendingReopen, setPendingReopen] = useState<{ id: string; patient: string } | null>(null);
  const confirmReopen = () => {
    if (!pendingReopen) return;
    const { id, patient } = pendingReopen;
    setPendingReopen(null);
    reopen(id);
    const logId = addLog({
      userId: me.userId, userName: me.userName, actionType: "REOPEN_CASE",
      targetId: id, targetType: "case",
      description: `Reopened case for ${patient}`, previousState: null,
    });
    showToast(`Reopened case for ${patient}`, logId);
  };
  const confirmApproval = () => {
    if (!pendingApproval) return;
    pendingApproval.run();
    // audit trail + undoable toast (Prompts 1/8)
    const { ids } = pendingApproval;
    const patient = ids.length === 1 ? allById.get(ids[0])?.patient ?? ids[0] : null;
    const description = patient
      ? `Approved case for ${patient}`
      : `Approved ${ids.length} case(s)`;
    const logId = addLog({
      userId: me.userId, userName: me.userName,
      actionType: ids.length > 1 ? "APPROVE_ALL" : "APPROVE_CASE",
      targetId: ids.length === 1 ? ids[0] : "bulk", targetType: "case",
      description, previousState: { caseIds: ids },
    });
    showToast(description, logId);
    setPendingApproval(null);
  };

  // approved cases leave the Complete/Incomplete pools before filtering;
  // API-finished ids are excluded too in case the backend sends overlapping lists
  const finishedApiIds = useMemo(
    () => new Set(finishedCases.map(f => f.id)),
    [finishedCases]);
  // reopened-awaiting-re-approval cases (Reopen tab): the server flag
  // (live mode) ∪ this session's local set, minus locally re-approved ids.
  // These leave the queues too — a reopened case lives ONLY in the Reopen tab.
  const reopenedEffective = useMemo(() => {
    const s = new Set<string>();
    completeCases.forEach(c => { if (c.reopened) s.add(c.id); });
    incompleteGroups.forEach(g => g.cases.forEach(c => { if (c.reopened) s.add(c.id); }));
    reopenedIds.forEach(id => s.add(id));
    approvedIds.forEach(id => s.delete(id));
    return s;
  }, [completeCases, incompleteGroups, reopenedIds, approvedIds]);
  const activeComplete = useMemo(
    () => completeCases.filter(c => !approvedIds.has(c.id) && !finishedApiIds.has(c.id) && !reopenedEffective.has(c.id)),
    [completeCases, approvedIds, finishedApiIds, reopenedEffective]);
  const activeGroups = useMemo(
    () => incompleteGroups
      .map(g => ({ ...g, cases: g.cases.filter(c => !approvedIds.has(c.id) && !finishedApiIds.has(c.id) && !reopenedEffective.has(c.id)) }))
      .filter(g => g.cases.length > 0),
    [incompleteGroups, approvedIds, finishedApiIds, reopenedEffective]);

  // live mode: a fresh payload that still reports a case as finished wins over
  // a stale in-memory reopen (re-approved elsewhere / failed POST); no-op in
  // static mode and for in-flight reopens (see ApprovalsProvider)
  useEffect(() => {
    if (!loading && !error) pruneReopened(finishedCases.map(f => f.id));
  }, [finishedCases, loading, error, pruneReopened]);

  // Reopen tab rows. Pool rows are tagged with their origin so View routes to
  // the right detail page; baseline-finished cases reopened in static mode (or
  // awaiting the live refetch) have no pool row yet, so one is built from the
  // finished fields (no cc/pi/codes — CasePreview degrades gracefully).
  type ReopenRow =
    | { from: "complete"; c: RichCase }
    | { from: "incomplete"; c: RichCase & { missing: string }; gid: string };
  const reopenRows = useMemo(() => {
    const rows: ReopenRow[] = [];
    const seen = new Set<string>();
    completeCases.forEach(c => {
      if (reopenedEffective.has(c.id)) { rows.push({ from: "complete", c }); seen.add(c.id); }
    });
    incompleteGroups.forEach(g => g.cases.forEach(c => {
      if (reopenedEffective.has(c.id) && !seen.has(c.id)) { rows.push({ from: "incomplete", c, gid: g.id }); seen.add(c.id); }
    }));
    finishedCases.forEach(f => {
      if (reopenedEffective.has(f.id) && !seen.has(f.id)) {
        rows.push({ from: "complete", c: {
          id: f.id, patient: f.patient, dept: f.dept ?? "—", group: f.group, confidence: 0,
          severity: f.severity, coverage: f.coverage, encountertype: f.encountertype,
          orders: f.orders, created_at: f.created_at, revenue_impact: f.revenue_impact,
          visitDate: f.visitDate ?? null, age: f.age ?? null,
          starred: f.starred, starredBy: f.starredBy,
          starredByStamp: f.starredByStamp, starredAt: f.starredAt,
          // keep the coder trail: the row must still say whose finished work this was
          coders: f.coders ?? (f.coder ? [f.coder] : []),
        } });
        seen.add(f.id);
      }
    });
    return rows;
  }, [completeCases, incompleteGroups, finishedCases, reopenedEffective]);

  // Whose finished work was pulled back, and by whom. coders[] is history-
  // ordered (most recent last): on a server-flagged reopen the last name IS the
  // reopener and the one before it finished the case. A reopen clicked in THIS
  // browser isn't in the payload yet, so the logged-in coder is the reopener
  // and the case's latest coder is the finisher.
  const reopenWho = (c: RichCase): { finishedBy: string | null; reopenedBy: string | null } => {
    const list = c.coders ?? [];
    if (c.reopened) return {
      finishedBy: list.length > 1 ? list[list.length - 2] : list[0] ?? null,
      reopenedBy: list[list.length - 1] ?? null,
    };
    return { finishedBy: list[list.length - 1] ?? me.userName, reopenedBy: me.userName };
  };

  // approved cases surface in Finished (with reopen); API-provided finished cases follow
  const displayFinished = useMemo(() => {
    const today = formatDate(new Date());
    const approved = [...approvedIds].filter(id => !finishedApiIds.has(id)).map(id => {
      const c = allById.get(id);
      // approving here makes the logged-in coder the latest editor (item 17),
      // appended to whoever worked the case before (item 16)
      const coders = [...(c?.coders ?? []).filter(n => n !== me.userName), me.userName];
      return { id, patient: c?.patient ?? id, vn: c?.vn ?? id, hn: c?.hn ?? null,
               codedDate: today, coder: me.userName, coders,
               // approving in this browser must not drop the case's star
               starred: c?.starred, starredBy: c?.starredBy,
               starredByStamp: c?.starredByStamp, starredAt: c?.starredAt,
               drg: c?.codes?.[0]?.code ?? "—", created_at: c?.created_at,
               // the card reads these two now — carry them over or an
               // optimistically-approved row loses its age and visit date
               visitDate: c?.visitDate ?? null, age: c?.age ?? null,
               // facet fields from the source case so the sidebar filters apply
               dept: c?.dept, group: c?.group, severity: c?.severity, coverage: c?.coverage,
               coverageFamily: c?.coverageFamily, codes: c?.codes,
               encountertype: c?.encountertype, orders: c?.orders, revenue_impact: c?.revenue_impact };
    });
    // any coder may reopen any case, so every row gets the Reopen button.
    // Rows in reopenedIds left Finished for the Reopen tab (session-local
    // until the server's refetched payload flags the case as reopened).
    // An API-finished row that is ALSO in approvedIds was reopened and then
    // re-approved in this browser — the logged-in coder finished it last, so
    // THEY become the responsible (final) coder, not the original approver.
    // (Harmless in live mode: the refetched payload already ends with them,
    // and the dedup keeps the name from appearing twice.)
    return [...approved, ...finishedCases
      .filter(f => !reopenedIds.has(f.id))
      .map(f => {
        if (!approvedIds.has(f.id)) return f;
        const coders = [...(f.coders ?? (f.coder ? [f.coder] : [])).filter(n => n !== me.userName), me.userName];
        return { ...f, coder: me.userName, coders, codedDate: today };
      })];
  }, [approvedIds, allById, finishedCases, finishedApiIds, reopenedIds, me.userName]);

  // Finished and Reopened rows live outside the hook's lists, but the Coder
  // facet (item 6) only has values there — so they are fed in as facet pool.
  const facetExtra = useMemo(
    () => [...displayFinished, ...reopenRows.map(r => r.c)],
    [displayFinished, reopenRows]);
  const filters = useCaseFilters(activeComplete, activeGroups, facetExtra);

  // Finished bypasses useCaseFilters' lists, so the sidebar facets and text
  // search are applied here with the hook's exported predicate (the date bar
  // no longer filters — it picks the sync period)
  const searchQ = filters.query.trim().toLowerCase();
  const { matchesFacets } = filters;
  const visibleFinished = useMemo(() =>
    starFirst(displayFinished, c => c.starred).filter(c =>
      matchesFacets(c) &&
      (searchQ === "" ||
        c.id.toLowerCase().includes(searchQ) ||
        c.patient.toLowerCase().includes(searchQ) ||
        c.coder.toLowerCase().includes(searchQ) ||
        c.drg.toLowerCase().includes(searchQ))),  // drg holds the first ICD code
    [displayFinished, searchQ, matchesFacets]);

  // the Reopen tab bypasses useCaseFilters' lists too — same predicate applied here
  const visibleReopen = useMemo(() =>
    starFirst(reopenRows, r => r.c.starred).filter(({ c }) =>
      matchesFacets(c) &&
      (searchQ === "" ||
        c.id.toLowerCase().includes(searchQ) ||
        c.patient.toLowerCase().includes(searchQ) ||
        c.dept.toLowerCase().includes(searchQ))),
    [reopenRows, searchQ, matchesFacets]);

  // real pagination over the filtered+sorted complete / incomplete lists
  // (feedback items 1, 7); page resets during render when the result set,
  // sort, or search changes
  const [completePage, setCompletePage] = useState(1);
  const [incompletePage, setIncompletePage] = useState(1);
  const filteredIncomplete = useMemo(
    () => filters.filteredGroups.flatMap((g) => g.cases),
    [filters.filteredGroups],
  );
  const pageResetKey = `${filters.totalComplete}|${filters.totalIncomplete}|${filters.sortMode}|${filters.query}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (prevPageResetKey !== pageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setCompletePage(1);
    setIncompletePage(1);
  }
  const pagedComplete = starFirst(filters.filteredComplete, c => c.starred)
    .slice((completePage - 1) * PER_PAGE, completePage * PER_PAGE);
  const pagedIncomplete = starFirst(filteredIncomplete, c => c.starred)
    .slice((incompletePage - 1) * PER_PAGE, incompletePage * PER_PAGE);

  // unfiltered totals — used to make filtered views explicit in the list itself,
  // so a coder can't finish a filtered queue and think ALL cases are done
  const unfilteredComplete = activeComplete.length;
  const unfilteredIncomplete = activeGroups.reduce((s, g) => s + g.cases.length, 0);
  // nothing synced at all (fresh start / after reset): every pool is empty, so
  // the empty tabs point at Sync instead of at another equally empty tab
  const noData = unfilteredComplete === 0 && unfilteredIncomplete === 0 && displayFinished.length === 0;

  // tabs are the single source of counts (stat cards removed — they duplicated these)
  const finishedCount = visibleFinished.length;
  const tabs = [
    { id: "complete"   as CaseTab, label: t("tab.complete"),   count: filters.totalComplete,   icon: CheckCircle2 },
    { id: "incomplete" as CaseTab, label: t("tab.incomplete"), count: filters.totalIncomplete, icon: AlertCircle  },
    { id: "reopen"     as CaseTab, label: t("tab.reopen"),     count: visibleReopen.length, icon: RotateCcw },
    { id: "finished"   as CaseTab, label: t("tab.finished"),   count: finishedCount, icon: Flag },
  ];

  // bulk selection (Complete tab, SRS F14): row checkboxes are always visible so
  // the coder can multi-select individual cases; "Select all" grabs EVERY filtered
  // case (not just the page), and can also be used to untick exceptions after
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionActive = selectedIds.size > 0;
  const allSelected = filters.totalComplete > 0 && selectedIds.size >= filters.totalComplete;
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(filters.filteredComplete.map(c => c.id)));
  // A case the server refused (an empty code column) must not sit in the list
  // looking approved — the provider rolls it back and says so here.
  useEffect(() => {
    const onBlocked = (e: Event) => {
      const ids: string[] = (e as CustomEvent).detail?.caseIds ?? [];
      if (ids.length > 0) showToast(t("toast.approveBlocked", { n: ids.length }));
    };
    window.addEventListener("approvals:blocked", onBlocked);
    return () => window.removeEventListener("approvals:blocked", onBlocked);
  }, [showToast, t]);

  const approveSelected = () => askApprove([...selectedIds], () => { approve([...selectedIds]); setSelectedIds(new Set()); });
  const approveOne = (id: string) => askApprove([id], () => approve([id]));

  // bulk selection for the Incomplete tab — same flat list UX as Complete
  const [selectedIncomplete, setSelectedIncomplete] = useState<Set<string>>(new Set());
  const incompleteSelectionActive = selectedIncomplete.size > 0;
  const allIncompleteSelected = filters.totalIncomplete > 0 && selectedIncomplete.size >= filters.totalIncomplete;
  const toggleSelectAllIncomplete = () =>
    setSelectedIncomplete(allIncompleteSelected
      ? new Set()
      : new Set(filteredIncomplete.map(c => c.id)));
  const toggleSelectIncomplete = (id: string) =>
    setSelectedIncomplete(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const approveSelectedIncomplete = () =>
    askApprove([...selectedIncomplete], () => { approve([...selectedIncomplete]); setSelectedIncomplete(new Set()); });

  function switchTab(next: CaseTab) {
    if (next === tab || animating) return;
    setAnimating(true); setTab(next); setTimeout(() => setAnimating(false), 320);
  }

  const currentIdx = tabIndex[tab];

  // All three tab panels live in one horizontal flex row (for the slide anim),
  // so the row's height would stretch to the TALLEST panel — leaving huge empty
  // scroll space under a short tab. Collapse the off-screen panels once the slide
  // settles; they're off-screen horizontally so the collapse is never visible.
  const panelStyle = (idx: number): React.CSSProperties => {
    const live = animating || currentIdx === idx;
    return { minWidth: "100%", maxHeight: live ? undefined : 0, overflow: live ? undefined : "hidden" };
  };

  const viewBtn = {
    border: `1px solid rgba(${gl.accentRgb},0.30)`,
    color: gl.text,
    background: `rgba(${gl.accentRgb},0.08)`,
  };

  return (
    <main className="flex-1 flex flex-col overflow-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
      {/* the page's name for screen readers — visually the tabs are the title */}
      <h1 className="sr-only">{t("nav.dashboard")}</h1>

      <div className="p-5 space-y-4">

        {/* API data status — real synced hospital data only, no mock fallback.
            Loading is communicated by the skeletons below, so the banner is error-only. */}
        {error && (
          <div role="alert" className="px-4 py-2.5 rounded-xl text-xs font-semibold"
            style={{ background: `rgba(${gl.accentRgb},0.08)`, border: `1px solid rgba(${gl.accentRgb},0.20)`, color: gl.accent }}>
            Could not load /api/cases.json — run integration-poc/sync/export_json.py to generate the data.
          </div>
        )}

        {/* Filters + sort, moved here from the left sidebar and from the old
            sync-period bar (hospital request 2026-08-25). Sync itself now
            lives in the header beside the account chip, so nothing on this
            page competes with the case list for width.

            Sticky (requested 2026-08-25): these queues run to hundreds of
            rows, and the whole point of moving the facets out of the sidebar
            was that they stay reachable — a control that scrolls away is
            worse than the sidebar it replaced. The scroll container is this
            page's <main>, so top-0 anchors to the app header, not the window.

            -mx-5/px-5 cancels the parent's padding so the band spans the full
            width: without it, rows would slide through the 20px gutters on
            either side of the card while it is pinned. */}
        <div className="sticky top-0 z-20 -mx-5 px-5 py-2"
          style={{
            background: gl.headerBg,
            backdropFilter: gl.blur20,
            WebkitBackdropFilter: gl.blur20,
          }}>
          <FilterBar f={filters} loading={loading} />
        </div>

        {/* items-start: the card sizes to its content, so there is no empty
            void below the pagination. Single column since the sidebar left. */}
        <div className="flex gap-3 items-start">
          <div className="flex-1 min-w-0">
          <div className="flex items-end gap-2.5">
            <div role="tablist" aria-label={t("a11y.caseTabs")} className="flex items-end gap-2.5">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => switchTab(t.id)}
                  id={`cases-tab-${t.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`cases-panel-${t.id}`}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
                    e.preventDefault();
                    const cur = tabs.findIndex((x) => x.id === tab);
                    const next =
                      e.key === "Home" ? 0 :
                      e.key === "End" ? tabs.length - 1 :
                      e.key === "ArrowRight" ? (cur + 1) % tabs.length :
                      (cur - 1 + tabs.length) % tabs.length;
                    switchTab(tabs[next].id);
                    document.getElementById(`cases-tab-${tabs[next].id}`)?.focus();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 transition-all duration-200"
                  style={{
                    borderRadius: "10px 10px 0 0",
                    background: active ? gl.card : (gl.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"),
                    backdropFilter: active ? gl.blur20 : undefined,
                    WebkitBackdropFilter: active ? gl.blur20 : undefined,
                    borderTop:    active ? `1px solid rgba(${gl.accentRgb},0.35)` : gl.borderSm,
                    borderLeft:   active ? `1px solid rgba(${gl.accentRgb},0.35)` : gl.borderSm,
                    borderRight:  active ? `1px solid rgba(${gl.accentRgb},0.35)` : gl.borderSm,
                    borderBottom: "none",
                    color: active ? gl.accent : gl.muted,
                    marginBottom: "-1px",
                    zIndex: active ? 2 : 1,
                    position: "relative",
                  }}
                >
                  <t.icon size={11} style={{ color: active ? gl.accent : gl.muted }} />
                  <span className="text-[13px] font-semibold">{t.label}</span>
                  <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-full"
                    style={active
                      ? { background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff" }
                      : { background: gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", color: gl.muted }}>
                    {loading
                      ? <span className="inline-block h-2 w-4 rounded-full animate-pulse align-middle"
                          style={{ background: active ? "rgba(255,255,255,0.35)" : (gl.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)") }} />
                      : filters.active && t.id === "complete" ? `${t.count}/${unfilteredComplete}`
                      : filters.active && t.id === "incomplete" ? `${t.count}/${unfilteredIncomplete}`
                      : filters.active && t.id === "reopen" ? `${t.count}/${reopenRows.length}`
                      : filters.active && t.id === "finished" ? `${t.count}/${displayFinished.length}`
                      : t.count}
                  </span>
                </button>
              );
            })}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-xl w-72"
              style={{ background: gl.inputBg, border: gl.border }}>
              <Search size={12} style={{ color: gl.muted }} />
              <input value={filters.query} onChange={e => filters.setQuery(e.target.value)}
                aria-label={t("list.search")}
                placeholder={t("list.search")} className="bg-transparent text-[12px] font-normal outline-none w-full" style={{ color: gl.text }} />
              {filters.query !== "" && (
                <button onClick={() => filters.setQuery("")} aria-label={t("list.clearSearch")}
                  className="hover-glow hover-glow-halo shrink-0 transition-all" style={{ color: gl.muted }}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div style={{
            background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
            border: `1px solid rgba(${gl.accentRgb},0.20)`,
            borderTopLeftRadius: 0, borderTopRightRadius: "16px",
            borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px",
            boxShadow: gl.shadow, overflow: "hidden", position: "relative", zIndex: 1,
          }}>
            {/* skeletons cover both the initial cases.json fetch and the manual
                iMed sync — but NOT the error state, which keeps its banner */}
            {(loading || syncing) ? (
              <div className="p-3 space-y-2" role="status" aria-busy="true">
                <span className="sr-only">{t("a11y.loading")}</span>
                {Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)}
              </div>
            ) : (
            // horizontal track: the four tab panels sit side by side and slide
            // via translateX; the card clips the off-screen ones (overflow hidden)
            <div style={{
              display: "flex",
              transform: `translateX(-${currentIdx * 100}%)`,
              transition: animating ? "transform 0.30s cubic-bezier(0.4,0,0.2,1)" : "none",
              willChange: "transform",
            }}>

              {/* COMPLETE — off-screen panels are inert: their buttons and
                  checkboxes must leave the tab order and the a11y tree, or a
                  keyboard user could act on rows they cannot see */}
              <div style={panelStyle(0)} inert={currentIdx !== 0 || undefined}
                role="tabpanel" id="cases-panel-complete" aria-labelledby="cases-tab-complete">
                <div className="p-3 space-y-2">
                  {/* truly empty queue (not a filter artifact): say why, offer
                      the action that fills it — sync when nothing is loaded at
                      all, otherwise the tab where the waiting work actually is */}
                  {unfilteredComplete === 0 && (noData ? (
                    <EmptyState icon={CheckCircle2}
                      title={t("empty.noData.title")} subtext={t("empty.noData.sub")}
                      actionLabel={t("empty.noData.action")} onAction={() => requestSync()} />
                  ) : (
                    <EmptyState icon={CheckCircle2}
                      title={t("empty.complete.title")} subtext={t("empty.complete.sub")}
                      actionLabel={unfilteredIncomplete > 0 ? t("empty.action.viewIncomplete", { n: unfilteredIncomplete }) : undefined}
                      onAction={unfilteredIncomplete > 0 ? () => switchTab("incomplete") : undefined} />
                  ))}
                  {/* forgot-the-filter guard: empty filtered list ≠ finished queue */}
                  {filters.active && filters.totalComplete === 0 && unfilteredComplete > 0 && (
                    <div className="text-center py-8">
                      <p className="text-[12px] font-medium" style={{ color: gl.muted }}>
                        {t("filter.emptyHidden", { n: unfilteredComplete })}
                      </p>
                      <button onClick={filters.clearAll} className="hover:underline underline-offset-2 text-[12px] font-bold mt-1.5 transition-all"
                        style={{ color: gl.accent }}>
                        {t("filter.showAll")}
                      </button>
                    </div>
                  )}
                  {/* selection toolbar: the header checkbox selects/clears ALL filtered
                      cases; individual row checkboxes below allow picking a subset.
                      Hidden at zero rows — "Select all (0)" invites a no-op. */}
                  {filters.totalComplete > 0 && (
                  <div className="flex items-center gap-2.5 px-1 py-0.5">
                    <label className="hover-glow flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg cursor-pointer transition-all"
                      style={{ background: gl.inputBg, border: gl.border }}>
                      <input type="checkbox" checked={allSelected}
                        ref={el => { if (el) el.indeterminate = selectionActive && !allSelected; }}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: gl.accent }} />
                      <span className="text-[13px] font-semibold" style={{ color: selectionActive ? gl.accent : gl.muted }}>
                        {selectionActive
                          ? t("sel.count", { n: selectedIds.size, total: filters.totalComplete })
                          : t("sel.selectAll", { n: filters.totalComplete })}
                      </span>
                    </label>
                    <span className="text-[12px] font-medium" style={{ color: gl.muted }}>
                      {t("sel.hint")}
                    </span>
                    <div className="flex-1" />
                    {selectionActive && (
                      <button onClick={approveSelected}
                        className="hover-glow flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-lg transition-all"
                        style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
                        <CheckCircle2 size={12} /> {t("sel.approve", { n: selectedIds.size })}
                      </button>
                    )}
                  </div>
                  )}
                  {pagedComplete.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
                        style={{
                          background: gl.row,
                          backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16,
                          // a star has to be visible while SCANNING, not only
                          // when you look straight at the icon — so the row
                          // carries it too. Selection still wins: that one is
                          // about what the next click will do.
                          border: selectedIds.has(c.id) ? `1px solid rgba(${gl.accentRgb},0.45)`
                            : starOf(c).starred ? `1px solid ${gl.warning}4D` : gl.border,
                          boxShadow: gl.shadowSm,
                        }}>
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)}
                          aria-label={t("a11y.selectCase", { vn: c.vn ?? c.id })}
                          className="w-3.5 h-3.5 rounded cursor-pointer shrink-0" style={{ accentColor: gl.accent }} />
                        <StarButton view={starOf(c)} canToggle={canToggle(c)} onToggle={() => toggleStar(c)} vn={c.vn ?? c.id} />
                        {/* col 1 — identity: VN, HN */}
                        <div className="w-60 shrink-0 min-w-0 self-center">
                          <CaseIdent vn={c.vn ?? c.id} hn={c.hn} patient={c.patient} age={c.age} coverage={c.coverageFamily ?? c.coverage} date={c.visitDate ? formatDate(c.visitDate) : null} />
                        </div>
                        {/* col 2 — info: meta + clinical preview */}
                        <div className="flex-1 min-w-0 self-center">
                          <CaseMeta c={c} />
                          <CasePreview c={c} />
                        </div>
                        {/* col 3 — actions */}
                        <div className="flex items-center gap-2 shrink-0 self-stretch">
                          <button onClick={() => openCase(c)}
                            className="hover-glow text-[12px] font-semibold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all"
                            style={viewBtn}><Eye size={10} /> {t("btn.view")}</button>
                          <button onClick={() => approveOne(c.id)}
                            className="hover-glow text-[12px] font-bold px-3.5 py-2 rounded-lg transition-all"
                            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
                            {t("btn.approve")}
                          </button>
                        </div>
                      </div>
                  ))}
                  {filters.totalComplete > 0 && (
                    <Pagination current={completePage} total={filters.totalComplete} perPage={PER_PAGE}
                      onPage={setCompletePage} />
                  )}
                </div>
              </div>

              {/* INCOMPLETE — flat list, same layout as Complete (no group cards) */}
              <div style={panelStyle(1)} inert={currentIdx !== 1 || undefined}
                role="tabpanel" id="cases-panel-incomplete" aria-labelledby="cases-tab-incomplete">
                <div className="p-3 space-y-2">
                  {unfilteredIncomplete === 0 && (noData ? (
                    <EmptyState icon={AlertCircle}
                      title={t("empty.noData.title")} subtext={t("empty.noData.sub")}
                      actionLabel={t("empty.noData.action")} onAction={() => requestSync()} />
                  ) : (
                    <EmptyState icon={AlertCircle}
                      title={t("empty.incomplete.title")} subtext={t("empty.incomplete.sub")}
                      actionLabel={unfilteredComplete > 0 ? t("empty.action.viewComplete", { n: unfilteredComplete }) : undefined}
                      onAction={unfilteredComplete > 0 ? () => switchTab("complete") : undefined} />
                  ))}
                  {filters.active && filters.totalIncomplete === 0 && unfilteredIncomplete > 0 && (
                    <div className="text-center py-8">
                      <p className="text-[12px] font-medium" style={{ color: gl.muted }}>
                        {t("filter.emptyHidden", { n: unfilteredIncomplete })}
                      </p>
                      <button onClick={filters.clearAll} className="hover:underline underline-offset-2 text-[12px] font-bold mt-1.5 transition-all"
                        style={{ color: gl.accent }}>
                        {t("filter.showAll")}
                      </button>
                    </div>
                  )}
                  {filters.totalIncomplete > 0 && (
                  <div className="flex items-center gap-2.5 px-1 py-0.5">
                    <label className="hover-glow flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg cursor-pointer transition-all"
                      style={{ background: gl.inputBg, border: gl.border }}>
                      <input type="checkbox" checked={allIncompleteSelected}
                        ref={el => { if (el) el.indeterminate = incompleteSelectionActive && !allIncompleteSelected; }}
                        onChange={toggleSelectAllIncomplete}
                        className="w-3.5 h-3.5 rounded cursor-pointer" style={{ accentColor: gl.accent }} />
                      <span className="text-[13px] font-semibold" style={{ color: incompleteSelectionActive ? gl.accent : gl.muted }}>
                        {incompleteSelectionActive
                          ? t("sel.count", { n: selectedIncomplete.size, total: filters.totalIncomplete })
                          : t("sel.selectAll", { n: filters.totalIncomplete })}
                      </span>
                    </label>
                    <span className="text-[12px] font-medium" style={{ color: gl.muted }}>
                      {t("sel.hint")}
                    </span>
                    <div className="flex-1" />
                    {incompleteSelectionActive && (
                      <button onClick={approveSelectedIncomplete}
                        className="hover-glow flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-lg transition-all"
                        style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
                        <CheckCircle2 size={12} /> {t("sel.approve", { n: selectedIncomplete.size })}
                      </button>
                    )}
                  </div>
                  )}
                  {pagedIncomplete.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
                      style={{
                        background: gl.row,
                        backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16,
                        border: selectedIncomplete.has(c.id) ? `1px solid rgba(${gl.accentRgb},0.45)`
                          : starOf(c).starred ? `1px solid ${gl.warning}4D` : gl.border,
                        boxShadow: gl.shadowSm,
                      }}>
                      <input type="checkbox" checked={selectedIncomplete.has(c.id)}
                        onChange={() => toggleSelectIncomplete(c.id)}
                        aria-label={t("a11y.selectCase", { vn: c.vn ?? c.id })}
                        className="w-3.5 h-3.5 rounded cursor-pointer shrink-0" style={{ accentColor: gl.accent }} />
                      <StarButton view={starOf(c)} canToggle={canToggle(c)} onToggle={() => toggleStar(c)} vn={c.vn ?? c.id} />
                      <div className="w-60 shrink-0 min-w-0 self-center">
                        <CaseIdent vn={c.vn ?? c.id} hn={c.hn} patient={c.patient} age={c.age} coverage={c.coverageFamily ?? c.coverage} date={c.visitDate ? formatDate(c.visitDate) : null} badge={(() => {
                          const missingDocs = c.missing.split(",").map(m => m.trim()).filter(m => m && m !== "—");
                          if (missingDocs.length === 0) return null;
                          const abbrKeys = missingDocs.map(m => missingDocAbbr[m]);
                          const label = abbrKeys.every(Boolean)
                            ? abbrKeys.map(k => t(k!)).join(" · ")
                            : t("missing.count", { n: missingDocs.length });
                          return (
                            <span title={c.missing}
                              className="text-[12px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0"
                              style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.22)` }}>
                              <AlertCircle size={8} /> {label}
                            </span>
                          );
                        })()} />
                      </div>
                      <div className="flex-1 min-w-0 self-center">
                        <CaseMeta c={c} />
                        <CasePreview c={c} />
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-stretch">
                        <button onClick={() => openIncompleteCase({ ...c, group: c.group })}
                          className="hover-glow text-[12px] font-semibold px-3.5 py-2 rounded-lg transition-all"
                          style={viewBtn}>{t("btn.review")}</button>
                        <button onClick={() => approveOne(c.id)}
                          className="hover-glow text-[12px] font-bold px-3.5 py-2 rounded-lg transition-all"
                          style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
                          {t("btn.approve")}
                        </button>
                      </div>
                    </div>
                  ))}
                  {filters.totalIncomplete > 0 && (
                    <Pagination current={incompletePage} total={filters.totalIncomplete} perPage={PER_PAGE}
                      onPage={setIncompletePage} />
                  )}
                </div>
              </div>

              {/* REOPENED — cases any coder pulled back from Finished; they sit
                  here (out of the queues) until they are approved again */}
              <div style={panelStyle(2)} inert={currentIdx !== 2 || undefined}
                role="tabpanel" id="cases-panel-reopen" aria-labelledby="cases-tab-reopen">
                <div className="p-3 space-y-2">
                  {reopenRows.length === 0 && (
                    <EmptyState icon={RotateCcw}
                      title={t("empty.reopen.title")} subtext={t("empty.reopen.sub")} />
                  )}
                  {filters.active && visibleReopen.length === 0 && reopenRows.length > 0 && (
                    <div className="text-center py-8">
                      <p className="text-[12px] font-medium" style={{ color: gl.muted }}>
                        {t("filter.emptyHidden", { n: reopenRows.length })}
                      </p>
                      <button onClick={filters.clearAll} className="hover:underline underline-offset-2 text-[12px] font-bold mt-1.5 transition-all"
                        style={{ color: gl.accent }}>
                        {t("filter.showAll")}
                      </button>
                    </div>
                  )}
                  {visibleReopen.map((row) => {
                    const c = row.c;
                    const who = reopenWho(c);
                    const view = () => row.from === "incomplete"
                      ? openIncompleteCase({ ...row.c, group: row.gid })
                      : openCase(c);
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all"
                        style={{ background: gl.row, backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16,
                          border: starOf(c).starred ? `1px solid ${gl.warning}4D` : gl.border, boxShadow: gl.shadowSm }}>
                        <StarButton view={starOf(c)} canToggle={canToggle(c)} onToggle={() => toggleStar(c)} vn={c.vn ?? c.id} />
                        {/* col 1 — identity + reopened badge (no group tag —
                            the long visit numbers leave no room in the fixed
                            column, same trade-off as the Finished rows) */}
                        <div className="w-60 shrink-0 min-w-0 self-center">
                          <CaseIdent vn={c.vn ?? c.id} hn={c.hn} patient={c.patient} age={c.age} coverage={c.coverageFamily ?? c.coverage} date={c.visitDate ? formatDate(c.visitDate) : null} badge={
                            <span className="text-[12px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0"
                              style={{ background: `rgba(${gl.accentRgb},0.18)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.28)` }}>
                              <RotateCcw size={8} /> {t("tab.reopen")}
                            </span>
                          } />
                        </div>
                        {/* col 2 — info: coder trail + meta + clinical preview */}
                        <div className="flex-1 min-w-0 self-center">
                          {/* whose finished work this was, and who pulled it back */}
                          {(who.finishedBy || who.reopenedBy) && (
                            <div className="flex items-center gap-x-2 flex-wrap">
                              {who.finishedBy && (
                                <span className="flex items-center gap-1">
                                  <Flag size={9} style={{ color: gl.muted, opacity: 0.75 }} />
                                  <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: gl.muted, opacity: 0.75 }}>{t("reopen.finishedBy")}</span>
                                  <span className="text-[12px] font-semibold" style={{ color: gl.text }}>{who.finishedBy}</span>
                                </span>
                              )}
                              {who.reopenedBy && (
                                <span className="flex items-center gap-1">
                                  {who.finishedBy && <span className="text-[12px] mr-1" style={{ color: gl.muted, opacity: 0.4 }}>·</span>}
                                  <RotateCcw size={9} style={{ color: gl.accent, opacity: 0.85 }} />
                                  <span className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: gl.muted, opacity: 0.75 }}>{t("reopen.reopenedBy")}</span>
                                  <span className="text-[12px] font-semibold" style={{ color: gl.accent }}>{who.reopenedBy}</span>
                                </span>
                              )}
                            </div>
                          )}
                          <CaseMeta c={c} />
                          <CasePreview c={c} />
                        </div>
                        {/* no confidence pill: the score is stale once a coder
                            pulled the case back for another look */}
                        {/* col 3 — actions */}
                        <div className="flex items-center gap-2 shrink-0 self-stretch">
                          <button onClick={view}
                            className="hover-glow text-[12px] font-semibold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all"
                            style={viewBtn}><Eye size={10} /> {t("btn.view")}</button>
                          <button onClick={() => approveOne(c.id)}
                            className="hover-glow text-[12px] font-bold px-3.5 py-2 rounded-lg transition-all"
                            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
                            {t("btn.approve")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {visibleReopen.length > 0 && (
                    <Pagination current={1} total={visibleReopen.length} perPage={PER_PAGE} />
                  )}
                </div>
              </div>

              {/* FINISHED */}
              <div style={panelStyle(3)} inert={currentIdx !== 3 || undefined}
                role="tabpanel" id="cases-panel-finished" aria-labelledby="cases-tab-finished">
                <div className="p-3 space-y-2">
                  {displayFinished.length === 0 && (
                    <EmptyState icon={Flag}
                      title={t("empty.finished.title")} subtext={t("empty.finished.sub")}
                      actionLabel={unfilteredComplete > 0 ? t("empty.action.viewComplete", { n: unfilteredComplete }) : undefined}
                      onAction={unfilteredComplete > 0 ? () => switchTab("complete") : undefined} />
                  )}
                  {/* same forgot-the-filter guard as the queues — Finished
                      bypasses useCaseFilters' lists, so it's applied here */}
                  {filters.active && visibleFinished.length === 0 && displayFinished.length > 0 && (
                    <div className="text-center py-8">
                      <p className="text-[12px] font-medium" style={{ color: gl.muted }}>
                        {t("filter.emptyHidden", { n: displayFinished.length })}
                      </p>
                      <button onClick={filters.clearAll} className="hover:underline underline-offset-2 text-[12px] font-bold mt-1.5 transition-all"
                        style={{ color: gl.accent }}>
                        {t("filter.showAll")}
                      </button>
                    </div>
                  )}
                  {visibleFinished.map((c) => (
                    // whole-row click is a mouse convenience; the View button below
                    // is the keyboard/screen-reader path to the same action
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                    <div key={c.id} className="hover-glow flex items-center gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer"
                      style={{ background: gl.row, backdropFilter: gl.blur16, boxShadow: gl.shadowSm,
                        border: starOf(c).starred ? `1px solid ${gl.warning}4D` : gl.border }}
                      onClick={() => openFinishedCase(c)}>
                      <StarButton view={starOf(c)} canToggle={canToggle(c)} onToggle={() => toggleStar(c)} vn={c.vn ?? c.id} />
                      <div className="flex-1 min-w-0">
                        <CaseIdent vn={c.vn ?? c.id} hn={c.hn} patient={c.patient} age={c.age} coverage={c.coverageFamily ?? c.coverage} date={c.visitDate ? formatDate(c.visitDate) : null} badge={
                          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: `rgba(${gl.accentRgb},0.18)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.28)` }}>
                            <Flag size={8} /> {t("tab.finished")}
                          </span>
                        } />
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[12px] font-normal" style={{ color: gl.muted }}>
                            {/* API dates are ISO; locally-approved rows are already DD/MM/YYYY */}
                            {/^\d{4}-/.test(c.codedDate) ? formatDate(c.codedDate) : c.codedDate}
                          </span>
                          {/* responsible coder = latest editor; earlier coders
                              follow it, because a case can have many (items 16/17) */}
                          <span className="text-[12px] font-normal" style={{ color: gl.muted }}
                            title={(c.coders ?? [c.coder]).join(" → ")}>
                            {c.coder}
                            {(c.coders?.length ?? 0) > 1 && (
                              <span className="ml-1 font-semibold" style={{ color: gl.accent }}>
                                {t("coder.plusOthers", { n: c.coders!.length - 1 })}
                              </span>
                            )}
                          </span>
                          <span className="text-[12px] font-bold" style={{ color: gl.accent }}>{c.drg}</span>
                        </div>
                      </div>
                      <button className="hover-glow text-[12px] font-bold px-3.5 py-2 rounded-lg shrink-0 transition-all"
                        style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}
                        onClick={e => {
                          e.stopPropagation();
                          setPendingReopen({ id: c.id, patient: c.patient });
                        }}>
                        {t("btn.reopen")}
                      </button>
                      <button className="hover-glow text-[12px] font-semibold px-3.5 py-2 rounded-lg flex items-center gap-1.5 shrink-0 transition-all"
                        style={viewBtn} onClick={e => { e.stopPropagation(); openFinishedCase(c); }}>
                        <Eye size={10} /> {t("btn.view")}
                      </button>
                    </div>
                  ))}
                  {visibleFinished.length > 0 && (
                    <Pagination current={1} total={visibleFinished.length} perPage={5} />
                  )}
                </div>
              </div>

            </div>
            )}
          </div>
          </div>
        </div>

      </div>

      {/* approval confirmation dialog — gates every approve action (F14) */}
      {pendingApproval && (
        <ConfirmDialog
          icon={CheckCircle2}
          title={t("confirm.title")}
          body={t("confirm.body", { n: pendingApproval.n })}
          confirmLabel={t("confirm.confirm", { n: pendingApproval.n })}
          onConfirm={confirmApproval}
          onClose={() => setPendingApproval(null)}
        />
      )}

      {/* reopen confirmation — the counterpart gate on the Finished tab */}
      {pendingReopen && (
        <ConfirmDialog
          icon={RotateCcw}
          danger
          title={t("confirm.reopen.title")}
          body={t("confirm.reopen.body", { patientName: pendingReopen.patient })}
          confirmLabel={t("confirm.reopen.confirm")}
          onConfirm={confirmReopen}
          onClose={() => setPendingReopen(null)}
        />
      )}
    </main>
  );
}

