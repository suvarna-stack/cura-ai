// ============================================================
// E-commerce style filter sidebar (hospital feedback item 7).
// Checkbox facets with live counts + active-filter chips.
// ============================================================
import { useState } from "react";
import { ChevronDown, FilterX, ListFilter, Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { CaseFilters, Facet, SortMode } from "../../hooks/useCaseFilters";
import { IcdFilterDialog, type IcdTab } from "./IcdFilterDialog";

// how many unticked studies are visible at once inside one order type;
// the search box exists precisely so this cap never blocks anyone
const CHILD_CAP = 10;

export function FilterPanel({ f, loading = false }: { f: CaseFilters; loading?: boolean }) {
  const { gl } = useTheme();
  const { t } = useLang();
  // Decision: every facet starts expanded so all options + selections are
  // visible at once — except Sort by, which always starts minimized (user
  // request 22/07/2026): the active sort still applies while collapsed.
  const [open, setOpen] = useState<Record<string, boolean>>({ sort: false });
  const isOpen = (key: string) => open[key] ?? true;
  // per-order-type search text over the nested Study/Item list (can be 100s)
  const [childQuery, setChildQuery] = useState<Record<string, string>>({});
  // which ICD system the filter dialog is open on (null = closed) — the
  // sidebar shows only selected chips; the full code list lives in the dialog
  const [icdDialog, setIcdDialog] = useState<IcdTab | null>(null);
  const bar = gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  return (
    // sticky + self-scrolling: stays in view while the coder scrolls the results,
    // and its own overflow scrolls rather than making the whole page tall
    <div className="w-56 shrink-0 space-y-2 sticky top-5 self-start overflow-y-auto pr-0.5"
      style={{ maxHeight: "calc(100vh - 7rem)", scrollbarWidth: "none" } as React.CSSProperties}>
      <div className="flex items-center gap-2 px-1">
        <SlidersHorizontal size={12} style={{ color: gl.accent }} />
        <span className="text-[13px] font-bold flex-1" style={{ color: gl.text }}>
          {t("filter.title")}
        </span>
        {f.active && (
          <button onClick={f.clearAll}
            className="text-[12px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-lg hover:opacity-80 transition-all"
            style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}>
            <FilterX size={10} /> {t("filter.clearAll")}
          </button>
        )}
      </div>

      {f.chips.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {f.chips.map((c) => (
            <button key={`${c.key}:${c.value}`} onClick={() => f.toggle(c.key, c.value)}
              className="text-[12px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80 transition-all"
              style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
              {c.label} <X size={8} />
            </button>
          ))}
        </div>
      )}

      {/* explicit filter result count — tabs alone made this too implicit */}
      {f.active && (
        <div className="rounded-2xl px-3 py-2.5"
          style={{ background: `rgba(${gl.accentRgb},0.08)`, border: `1px solid rgba(${gl.accentRgb},0.22)` }}>
          <p className="text-[12px] font-bold" style={{ color: gl.accent }}>
            {t("filter.match", { n: f.totalComplete + f.totalIncomplete })}
          </p>
          <p className="text-[12px] font-medium mt-0.5" style={{ color: gl.muted }}>
            {t("filter.breakdown", { c: f.totalComplete, i: f.totalIncomplete })}
          </p>
        </div>
      )}

      {/* sort lives with the filters — one control panel, list stays clean.
          Collapsible like the facet cards below ("sort" can't collide with a
          facet key). */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: gl.card, backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16, border: gl.border, boxShadow: gl.shadowSm }}>
        <button onClick={() => setOpen((o) => ({ ...o, sort: !isOpen("sort") }))}
          className="w-full flex items-center gap-2 px-3 py-2.5">
          <ArrowUpDown size={11} style={{ color: gl.accent }} />
          <span className="text-[12px] font-bold flex-1 text-left" style={{ color: gl.text }}>{t("sort.title")}</span>
          <ChevronDown size={12}
            style={{ color: gl.muted, transform: isOpen("sort") ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
        </button>
        {isOpen("sort") && (
        <div className="px-3 pb-2.5 space-y-1">
          {/* date sort on top (default: newest first); confidence, then the
              A–Z code sort (item 4) keyed on each card's primary code */}
          {([
            { label: t("sort.newest"),  mode: "date-desc" as SortMode },
            { label: t("sort.oldest"),  mode: "date-asc"  as SortMode },
            { label: t("sort.highest"), mode: "conf-desc" as SortMode },
            { label: t("sort.lowest"),  mode: "conf-asc"  as SortMode },
            { label: t("sort.codeAz"),  mode: "code-asc"  as SortMode },
          ]).map((o) => (
            <label key={o.mode} className="flex items-center gap-2 cursor-pointer py-0.5 hover:opacity-80 transition-all">
              <input type="radio" name="sort" checked={f.sortMode === o.mode}
                onChange={() => f.setSortMode(o.mode)}
                className="w-3 h-3" style={{ accentColor: gl.accent }} />
              <span className="text-[12px] font-medium flex-1" style={{ color: gl.text }}>{o.label}</span>
            </label>
          ))}
        </div>
        )}
      </div>

      {/* facets derive from the fetched case list — placeholder cards while it loads */}
      {loading && Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl px-3 py-2.5 space-y-2 animate-pulse"
          style={{ background: gl.card, border: gl.border, boxShadow: gl.shadowSm }}>
          <div className="h-2.5 w-20 rounded" style={{ background: bar }} />
          <div className="h-2 w-32 rounded" style={{ background: bar }} />
          <div className="h-2 w-28 rounded" style={{ background: bar }} />
        </div>
      ))}
      {!loading && (() => {
        // ICD-10 / ICD-9 are embedded facets: real filters in the hook, but
        // rendered as sections INSIDE the Order Type card instead of cards
        const cards = f.facets.filter((x) => !x.embedded);
        const embedded = f.facets.filter((x) => x.embedded);

        // shared renderer for a searchable option list — the search covers the
        // FULL list; ticked options stay pinned, unticked ones are narrowed by
        // the text and capped for display
        const searchableList = (facet: Facet) => {
          const qk = `facet:${facet.key}`;
          const fq = (childQuery[qk] ?? "").trim().toLowerCase();
          const ticked = facet.options.filter((o) => o.selected);
          const unticked = facet.options.filter((o) => !o.selected && (fq === "" || o.label.toLowerCase().includes(fq)));
          const visible = [...ticked, ...unticked.slice(0, CHILD_CAP)];
          const hidden = unticked.length - Math.min(unticked.length, CHILD_CAP);
          if (facet.options.length === 0) {
            return <p className="text-[12px] font-normal py-0.5" style={{ color: gl.muted }}>{t("facet.ordernameEmpty")}</p>;
          }
          return (
            <>
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg mb-1"
                style={{ background: gl.inputBg, border: gl.borderSm }}>
                <Search size={9} style={{ color: gl.muted }} className="shrink-0" />
                <input
                  value={childQuery[qk] ?? ""}
                  onChange={(e) => setChildQuery((p) => ({ ...p, [qk]: e.target.value }))}
                  aria-label={t("facet.ordernameSearch")}
                  placeholder={t("facet.ordernameSearch")}
                  className="bg-transparent text-[12px] font-normal outline-none w-full min-w-0"
                  style={{ color: gl.text }} />
                {fq !== "" && (
                  <button onClick={() => setChildQuery((p) => ({ ...p, [qk]: "" }))}
                    aria-label={t("list.clearSearch")}
                    className="shrink-0 hover:opacity-70 transition-all" style={{ color: gl.muted }}>
                    <X size={9} />
                  </button>
                )}
              </div>
              {visible.map((o) => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer py-0.5 hover:opacity-80 transition-all">
                  <input type="checkbox" checked={o.selected} onChange={() => f.toggle(facet.key, o.value)}
                    className="w-3 h-3 rounded" style={{ accentColor: gl.accent }} />
                  <span className="text-[12px] font-medium flex-1 truncate" style={{ color: gl.text }} title={o.label}>{o.label}</span>
                  <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: gl.muted }}>{o.count}</span>
                </label>
              ))}
              {fq !== "" && unticked.length === 0 && (
                <p className="text-[12px] font-normal py-0.5" style={{ color: gl.muted }}>
                  {t("facet.ordernameNoMatch", { q: childQuery[qk] ?? "" })}
                </p>
              )}
              {hidden > 0 && (
                <p className="text-[12px] font-medium py-0.5" style={{ color: gl.muted }}>
                  {t("facet.ordernameMore", { n: hidden })}
                </p>
              )}
            </>
          );
        };

        return cards.map((facet) => (
        <div key={facet.key} className="rounded-2xl overflow-hidden"
          style={{ background: gl.card, backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16, border: gl.border, boxShadow: gl.shadowSm }}>
          <button onClick={() => setOpen((o) => ({ ...o, [facet.key]: !isOpen(facet.key) }))}
            className="w-full flex items-center gap-2 px-3 py-2.5">
            <span className="text-[12px] font-bold flex-1 text-left" style={{ color: gl.text }}>{t(`facet.${facet.key}`)}</span>
            {(facet.options.some((o) => o.selected) ||
              (facet.key === "ordercat" && embedded.some((e) => e.options.some((o) => o.selected)))) && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: gl.accent }} />
            )}
            <ChevronDown size={12}
              style={{ color: gl.muted, transform: isOpen(facet.key) ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
          </button>
          {isOpen(facet.key) && (
            <div className="px-3 pb-2.5 space-y-1">
              {facet.searchable && searchableList(facet)}
              {!facet.searchable && facet.options.map((o) => (
                <div key={o.value}>
                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:opacity-80 transition-all">
                    <input type="checkbox" checked={o.selected} onChange={() => f.toggle(facet.key, o.value)}
                      className="w-3 h-3 rounded" style={{ accentColor: gl.accent }} />
                    <span className="text-[12px] font-medium flex-1 truncate" style={{ color: gl.text }} title={o.label}>{o.label}</span>
                    <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: gl.muted }}>{o.count}</span>
                  </label>
                  {/* second level: ticking an order type opens the studies inside
                      it, right under the box the coder just ticked — the two
                      levels read as one control instead of two filter cards */}
                  {o.children && (() => {
                    const cq = (childQuery[o.value] ?? "").trim().toLowerCase();
                    // ticked studies stay pinned on top (even mid-search, so a
                    // selection never silently disappears); unticked ones are
                    // narrowed by the search text, then capped for display
                    const ticked = o.children.filter((k) => k.selected);
                    const unticked = o.children.filter((k) => !k.selected && (cq === "" || k.label.toLowerCase().includes(cq)));
                    const visible = [...ticked, ...unticked.slice(0, CHILD_CAP)];
                    const hidden = unticked.length - Math.min(unticked.length, CHILD_CAP);
                    return (
                    <div className="ml-4 pl-2 mt-0.5 mb-1 space-y-0.5"
                      style={{ borderLeft: `1px solid rgba(${gl.accentRgb},0.25)` }}>
                      <p className="text-[12px] font-bold uppercase tracking-wide pb-0.5" style={{ color: gl.accent, opacity: 0.7 }}>
                        {t("facet.ordername")}
                      </p>
                      {o.children.length === 0 ? (
                        <p className="text-[12px] font-normal" style={{ color: gl.muted }}>{t("facet.ordernameEmpty")}</p>
                      ) : (
                        <>
                          {/* search over the full study list — the cap below only
                              limits what is SHOWN, never what is findable */}
                          <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg mb-1"
                            style={{ background: gl.inputBg, border: gl.borderSm }}>
                            <Search size={9} style={{ color: gl.muted }} className="shrink-0" />
                            <input
                              value={childQuery[o.value] ?? ""}
                              onChange={(e) => setChildQuery((p) => ({ ...p, [o.value]: e.target.value }))}
                              aria-label={t("facet.ordernameSearch")}
                              placeholder={t("facet.ordernameSearch")}
                              className="bg-transparent text-[12px] font-normal outline-none w-full min-w-0"
                              style={{ color: gl.text }} />
                            {cq !== "" && (
                              <button onClick={() => setChildQuery((p) => ({ ...p, [o.value]: "" }))}
                                aria-label={t("list.clearSearch")}
                                className="shrink-0 hover:opacity-70 transition-all" style={{ color: gl.muted }}>
                                <X size={9} />
                              </button>
                            )}
                          </div>
                          {visible.map((k) => (
                            <label key={k.value} className="flex items-center gap-2 cursor-pointer py-0.5 hover:opacity-80 transition-all">
                              <input type="checkbox" checked={k.selected} onChange={() => f.toggle("ordername", k.value)}
                                className="w-2.5 h-2.5 rounded" style={{ accentColor: gl.accent }} />
                              <span className="text-[12px] font-normal flex-1 truncate" style={{ color: gl.text }} title={k.label}>{k.label}</span>
                              <span className="text-[12px] font-medium" style={{ color: gl.muted }}>{k.count}</span>
                            </label>
                          ))}
                          {cq !== "" && unticked.length === 0 && (
                            <p className="text-[12px] font-normal py-0.5" style={{ color: gl.muted }}>
                              {t("facet.ordernameNoMatch", { q: childQuery[o.value] ?? "" })}
                            </p>
                          )}
                          {hidden > 0 && (
                            <p className="text-[12px] font-medium py-0.5" style={{ color: gl.muted }}>
                              {t("facet.ordernameMore", { n: hidden })}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })()}
                </div>
              ))}
              {/* ICD-10 / ICD-9 live inside the Order Type card (user request
                  22/07/2026) — each a labeled, collapsible section with its own
                  search. A collapsed section with active picks keeps its dot. */}
              {facet.key === "ordercat" && embedded.map((ef) => {
                // starts minimized; auto-expands when it holds active picks
                // (user request 22/07/2026), e.g. selections restored on reload
                const sectionOpen = open[ef.key] ?? ef.options.some((o) => o.selected);
                return (
                <div key={ef.key} className="mt-1.5 pt-1 space-y-0.5" style={{ borderTop: gl.borderSm }}>
                  <button onClick={() => setOpen((o) => ({ ...o, [ef.key]: !sectionOpen }))}
                    className="w-full flex items-center gap-2 py-1">
                    <span className="text-[12px] font-bold uppercase tracking-wide flex-1 text-left"
                      style={{ color: gl.accent, opacity: 0.7 }}>
                      {t(`facet.${ef.key}`)}
                    </span>
                    {ef.options.some((o) => o.selected) && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: gl.accent }} />
                    )}
                    <ChevronDown size={11}
                      style={{ color: gl.muted, transform: sectionOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                  </button>
                  {/* the sidebar shows ONLY the picked codes as removable
                      chips — the full (hundreds-long) list lives in the
                      dialog, where there is room for search + descriptions */}
                  {sectionOpen && (
                    <div className="space-y-1 pb-1">
                      {ef.options.some((o) => o.selected) && (
                        <div className="flex flex-wrap gap-1">
                          {ef.options.filter((o) => o.selected).map((o) => (
                            <button key={o.value} onClick={() => f.toggle(ef.key, o.value)}
                              title={f.codeDesc[o.value] ?? o.label}
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 hover:opacity-80 transition-all"
                              style={{ background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.30)` }}>
                              {o.label} <X size={8} />
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setIcdDialog(ef.key as IcdTab)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] font-semibold hover:opacity-80 transition-all"
                        style={{ background: gl.inputBg, border: gl.borderSm, color: gl.muted }}>
                        <ListFilter size={11} style={{ color: gl.accent }} />
                        {t("filter.icd.select", { n: ef.options.length })}
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
        ));
      })()}
      {/* the date bar at the top of the Dashboard picks the SYNC period, not a filter */}

      {icdDialog && (
        <IcdFilterDialog f={f} initialTab={icdDialog} onClose={() => setIcdDialog(null)} />
      )}
    </div>
  );
}
