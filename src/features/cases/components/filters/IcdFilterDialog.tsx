// ============================================================
// ICD code filter dialog (2026-08-20): the ICD-10 / ICD-9 facets
// hold hundreds of codes — far too many for the 224px sidebar, so
// the sidebar keeps only the selected chips and this dialog does
// the actual browsing. Search matches code AND description (one
// bulk catalog lookup on open, cached across reopens; case-row
// previews fill gaps). Selections apply LIVE through the same
// useCaseFilters toggle the sidebar uses, so chips / counts /
// clear-all keep working; the footer just reports the match count.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { ModalShell } from "../../../../components/ui/Modal";
import { lookupIcdDescriptions } from "../../api/casesService";
import type { CaseFilters } from "../../hooks/useCaseFilters";

export type IcdTab = "icd10" | "icd9";

// soft render cap per list — search exists so this never blocks anyone
const VISIBLE_CAP = 60;

// catalog descriptions survive reopen (module cache) — the codes on screen
// barely change within a session, so one lookup per new code is plenty
let descCache: Record<string, string> = {};

export function IcdFilterDialog({
  f, initialTab, onClose,
}: {
  f: CaseFilters;
  initialTab: IcdTab;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [tab, setTab] = useState<IcdTab>(initialTab);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const facetOf = (key: IcdTab) => f.facets.find((x) => x.key === key);
  const facet = facetOf(tab);
  const selectedCount = (key: IcdTab) =>
    facetOf(key)?.options.filter((o) => o.selected).length ?? 0;

  // catalog descriptions: the case rows don't carry them, so look up every
  // code on open (one bulk POST, cached across reopens); the case-row map
  // (f.codeDesc) fills any gaps
  const [fetched, setFetched] = useState<Record<string, string>>(descCache);
  useEffect(() => {
    const codes = (["icd10", "icd9"] as IcdTab[])
      .flatMap((k) => facetOf(k)?.options.map((o) => o.value) ?? [])
      .filter((c) => !(c in descCache));
    if (codes.length === 0) return;
    let cancelled = false;
    lookupIcdDescriptions(codes)
      .then((map) => {
        descCache = { ...descCache, ...map };
        if (!cancelled) setFetched(descCache);
      })
      .catch(() => {}); // descriptions are enrichment — codes alone still work
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one lookup per open
  }, []);
  const descOf = (code: string) => fetched[code] ?? f.codeDesc[code] ?? "";

  // selected codes stay pinned on top (a pick must never vanish mid-search);
  // unticked ones are narrowed by the query over code + description
  const { visible, hidden, total } = useMemo(() => {
    const options = facet?.options ?? [];
    const fq = q.trim().toLowerCase();
    const matches = (code: string) =>
      fq === "" ||
      code.toLowerCase().includes(fq) ||
      descOf(code).toLowerCase().includes(fq);
    const ticked = options.filter((o) => o.selected);
    const unticked = options.filter((o) => !o.selected && matches(o.value));
    return {
      visible: [...ticked, ...unticked.slice(0, VISIBLE_CAP)],
      hidden: Math.max(0, unticked.length - VISIBLE_CAP),
      total: options.length,
    };
  }, [facet, q, fetched]);  // eslint-disable-line react-hooks/exhaustive-deps -- descOf reads `fetched`

  const matchCount = f.totalComplete + f.totalIncomplete;

  // portal to <body>: the sidebar's sticky/backdrop-filter ancestry traps the
  // fixed overlay in a lower stacking context than the case list otherwise
  return createPortal(
    <ModalShell onClose={onClose} ariaLabel={t("filter.icd.dialogTitle")}
      initialFocusRef={searchRef}
      overlayStyle={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      className="w-full max-w-lg rounded-2xl p-5 flex flex-col"
      style={{
        // opaque, like the bar's dropdowns: a code list is read one line at a
        // time, and glass put the dimmed dashboard behind every one of them
        background: gl.popover,
        border: `1px solid rgba(${gl.accentRgb},0.25)`, boxShadow: gl.shadow,
        maxHeight: "min(40rem, calc(100vh - 4rem))",
      }}>
      {/* header */}
      <div className="flex items-center gap-2.5 mb-3 shrink-0">
        <h3 className="text-[15px] font-bold flex-1" style={{ color: gl.text }}>
          {t("filter.icd.dialogTitle")}
        </h3>
        <button onClick={onClose} aria-label={t("a11y.close")}
          className="hover-glow hover-glow-halo transition-all" style={{ color: gl.muted }}>
          <X size={16} />
        </button>
      </div>

      {/* ICD-10 / ICD-9 tabs — a selected-count pill marks the other tab's
          picks so switching never feels like they were lost */}
      <div className="flex gap-2 mb-3 shrink-0">
        {(["icd10", "icd9"] as IcdTab[]).map((key) => {
          const active = key === tab;
          const n = selectedCount(key);
          return (
            <button key={key} type="button" onClick={() => { setTab(key); setQ(""); }}
              className="hover-glow flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-bold transition-all"
              style={active
                ? { background: gl.accentGrad, color: "#fff", boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.30)` }
                : { background: gl.inputBg, color: gl.muted, border: gl.borderSm }}>
              {t(`facet.${key}`)}
              {n > 0 && (
                <span className="rounded-full px-1.5 text-[10px] font-bold"
                  style={active
                    ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                    : { background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* search over code + description */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 shrink-0"
        style={{ background: gl.inputBg, border: gl.borderSm }}>
        <Search size={12} style={{ color: gl.muted }} className="shrink-0" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("filter.icd.search")}
          placeholder={t("filter.icd.search")}
          className="bg-transparent text-[13px] font-normal outline-none w-full min-w-0"
          style={{ color: gl.text }} />
        {q !== "" && (
          <button onClick={() => setQ("")} aria-label={t("list.clearSearch")}
            className="hover-glow hover-glow-halo shrink-0 transition-all" style={{ color: gl.muted }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* the code list — the only scrolling part */}
      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {total === 0 && (
          <p className="text-[12px] font-normal py-3 text-center" style={{ color: gl.muted }}>
            {t("filter.icd.empty")}
          </p>
        )}
        {visible.map((o) => (
          <label key={o.value}
            className="hover-glow flex items-center gap-2.5 cursor-pointer rounded-xl px-2.5 py-2 transition-all"
            style={o.selected
              ? { background: `rgba(${gl.accentRgb},0.10)`, border: `1px solid rgba(${gl.accentRgb},0.22)` }
              : { border: "1px solid transparent" }}>
            <input type="checkbox" checked={o.selected} onChange={() => f.toggle(tab, o.value)}
              className="w-3.5 h-3.5 rounded shrink-0" style={{ accentColor: gl.accent }} />
            <span className="text-[13px] font-bold shrink-0" style={{ color: gl.text }}>
              {o.value}
            </span>
            <span className="text-[12px] font-normal flex-1 truncate" style={{ color: gl.muted }}
              title={descOf(o.value)}>
              {descOf(o.value)}
            </span>
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: gl.muted }}>
              {o.count}
            </span>
          </label>
        ))}
        {q !== "" && visible.every((o) => o.selected) && total > 0 && (
          <p className="text-[12px] font-normal py-2 text-center" style={{ color: gl.muted }}>
            {t("filter.icd.noMatch", { q })}
          </p>
        )}
        {hidden > 0 && (
          <p className="text-[12px] font-medium py-1.5 text-center" style={{ color: gl.muted }}>
            {t("filter.icd.more", { n: hidden })}
          </p>
        )}
      </div>

      {/* footer — selections already applied live; this just reports + closes */}
      <div className="flex items-center gap-2 pt-3 mt-2 shrink-0" style={{ borderTop: gl.borderSm }}>
        {selectedCount(tab) > 0 && (
          <button type="button"
            onClick={() => facet?.options.filter((o) => o.selected).forEach((o) => f.toggle(tab, o.value))}
            className="hover-glow text-[12px] font-semibold px-3 py-2 rounded-xl transition-all"
            style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}>
            {t("filter.icd.clear", { s: t(`facet.${tab}`) })}
          </button>
        )}
        <button type="button" onClick={onClose}
          className="hover-glow flex-1 text-[13px] font-bold px-4 py-2 rounded-xl transition-all"
          style={{ background: gl.accentGrad, color: "#fff", boxShadow: `0 2px 10px rgba(${gl.accentRgb},0.30)` }}>
          {t("filter.icd.show", { n: matchCount })}
        </button>
      </div>
    </ModalShell>,
    document.body,
  );
}
