// ============================================================
// One facet, one dropdown on the filter bar (hospital request
// 2026-08-25: "move filters from left to top as dropdown list").
//
// Replaces the sidebar card AND the single Filters modal that
// briefly stood in for it: the coder wants each filter type
// reachable in one click from the bar, not two clicks through a
// dialog that covers the list she is filtering.
//
// The popover is absolutely positioned inside the sticky bar, so
// it travels with it and closes on outside-click or Escape.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { CaseFilters, Facet } from "../../hooks/useCaseFilters";

/** How many unticked options render at once. The search box exists so this
 *  cap never hides anything findable — it only limits what is DRAWN. */
const CAP = 10;

export function FacetDropdown({
  facet,
  f,
}: {
  facet: Facet;
  f: CaseFilters;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  // per-list search text, keyed so the Order Type list and each nested
  // Study/Item list keep their own box
  const [query, setQuery] = useState<Record<string, string>>({});
  const wrap = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape. Bound only while open, so the page is
  // not carrying five idle document listeners.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const picked = facet.options.filter((o) => o.selected).length;

  /** Ticked options stay pinned even mid-search, so a selection can never
   *  silently vanish behind a query the coder typed after making it. */
  const shown = (options: Facet["options"], qk: string) => {
    const q = (query[qk] ?? "").trim().toLowerCase();
    const ticked = options.filter((o) => o.selected);
    const rest = options.filter(
      (o) => !o.selected && (q === "" || o.label.toLowerCase().includes(q)),
    );
    return {
      q,
      visible: [...ticked, ...rest.slice(0, CAP)],
      hidden: Math.max(rest.length - CAP, 0),
      noMatch: q !== "" && rest.length === 0,
    };
  };

  const searchBox = (qk: string) => (
    <div
      className="mb-1 flex items-center gap-1.5 rounded-lg px-1.5 py-1"
      style={{ background: gl.inputBg, border: gl.borderSm }}
    >
      <Search size={10} style={{ color: gl.muted }} className="shrink-0" />
      <input
        value={query[qk] ?? ""}
        onChange={(e) => setQuery((p) => ({ ...p, [qk]: e.target.value }))}
        aria-label={t("facet.ordernameSearch")}
        placeholder={t("facet.ordernameSearch")}
        className="w-full min-w-0 bg-transparent text-[12px] font-normal outline-none"
        style={{ color: gl.text }}
      />
      {(query[qk] ?? "") !== "" && (
        <button
          onClick={() => setQuery((p) => ({ ...p, [qk]: "" }))}
          aria-label={t("list.clearSearch")}
          className="shrink-0 transition-all hover:opacity-70"
          style={{ color: gl.muted }}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );

  const row = (
    o: Facet["options"][number],
    key: Facet["key"],
    small = false,
  ) => (
    <label
      key={o.value}
      className="flex cursor-pointer items-center gap-2 py-0.5 transition-all hover:opacity-80"
    >
      <input
        type="checkbox"
        checked={o.selected}
        onChange={() => f.toggle(key, o.value)}
        className={small ? "h-2.5 w-2.5 rounded" : "h-3 w-3 rounded"}
        style={{ accentColor: gl.accent }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[12px] ${small ? "font-normal" : "font-medium"}`}
        style={{ color: gl.text }}
        title={o.label}
      >
        {o.label}
      </span>
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[12px] font-semibold"
        style={{
          background: gl.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          color: gl.muted,
        }}
      >
        {o.count}
      </span>
    </label>
  );

  const main = shown(facet.options, `facet:${facet.key}`);

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all hover:opacity-90"
        style={
          picked > 0
            ? {
                background: `rgba(${gl.accentRgb},0.15)`,
                border: `1px solid rgba(${gl.accentRgb},0.35)`,
                color: gl.accent,
              }
            : { background: gl.inputBg, border: gl.border, color: gl.text }
        }
      >
        {t(`facet.${facet.key}`)}
        {picked > 0 && (
          <span
            className="rounded-full px-1.5 text-[11px] font-bold"
            style={{ background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff" }}
          >
            {picked}
          </span>
        )}
        <ChevronDown
          size={12}
          style={{
            color: gl.muted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 z-30 mt-1.5 w-72 overflow-y-auto rounded-2xl p-3"
          style={{
            top: "100%",
            maxHeight: "60vh",
            background: gl.card,
            backdropFilter: gl.blur20,
            WebkitBackdropFilter: gl.blur20,
            border: `1px solid rgba(${gl.accentRgb},0.25)`,
            boxShadow: gl.shadow,
            scrollbarWidth: "none",
          } as React.CSSProperties}
        >
          {facet.options.length === 0 ? (
            <p className="py-0.5 text-[12px] font-normal" style={{ color: gl.muted }}>
              {t("facet.ordernameEmpty")}
            </p>
          ) : (
            <>
              {/* a searchable facet can run to hundreds of options */}
              {facet.searchable && searchBox(`facet:${facet.key}`)}
              {main.visible.map((o) => (
                <div key={o.value}>
                  {row(o, facet.key)}
                  {/* second level: ticking an order type opens the studies
                      inside it, right under the box just ticked — the two
                      levels read as one control, as they did in the sidebar */}
                  {o.children && (() => {
                    const kid = shown(o.children, o.value);
                    return (
                      <div
                        className="mt-0.5 mb-1 ml-4 space-y-0.5 pl-2"
                        style={{ borderLeft: `1px solid rgba(${gl.accentRgb},0.25)` }}
                      >
                        <p
                          className="pb-0.5 text-[12px] font-bold uppercase tracking-wide"
                          style={{ color: gl.accent, opacity: 0.7 }}
                        >
                          {t("facet.ordername")}
                        </p>
                        {o.children.length === 0 ? (
                          <p className="text-[12px] font-normal" style={{ color: gl.muted }}>
                            {t("facet.ordernameEmpty")}
                          </p>
                        ) : (
                          <>
                            {searchBox(o.value)}
                            {kid.visible.map((k) => row(k, "ordername", true))}
                            {kid.noMatch && (
                              <p className="py-0.5 text-[12px] font-normal" style={{ color: gl.muted }}>
                                {t("facet.ordernameNoMatch", { q: query[o.value] ?? "" })}
                              </p>
                            )}
                            {kid.hidden > 0 && (
                              <p className="py-0.5 text-[12px] font-medium" style={{ color: gl.muted }}>
                                {t("facet.ordernameMore", { n: kid.hidden })}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              {main.noMatch && (
                <p className="py-0.5 text-[12px] font-normal" style={{ color: gl.muted }}>
                  {t("facet.ordernameNoMatch", { q: query[`facet:${facet.key}`] ?? "" })}
                </p>
              )}
              {main.hidden > 0 && (
                <p className="py-0.5 text-[12px] font-medium" style={{ color: gl.muted }}>
                  {t("facet.ordernameMore", { n: main.hidden })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
