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
//
// The panel is OPAQUE (gl.popover), unlike the glass cards around
// it: it opens straight over the tab strip and the case rows, and
// as glass their text read through it (hospital, 25/08/2026 —
// "a little crash"). backdrop-filter cannot save it either, since
// the sticky bar it lives in already blurs and the two do not
// compose.
// ============================================================
import { useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { useMenuDismiss } from "./useMenuDismiss";
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

  useMenuDismiss(open, wrap, () => setOpen(false));

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
      className="mb-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5"
      style={{ background: gl.inputBg, border: gl.borderSm }}
    >
      <Search size={13} style={{ color: gl.muted }} className="shrink-0" />
      <input
        value={query[qk] ?? ""}
        onChange={(e) => setQuery((p) => ({ ...p, [qk]: e.target.value }))}
        aria-label={t("facet.ordernameSearch")}
        placeholder={t("facet.ordernameSearch")}
        className="w-full min-w-0 bg-transparent text-[13px] font-normal outline-none"
        style={{ color: gl.text }}
      />
      {(query[qk] ?? "") !== "" && (
        <button
          onClick={() => setQuery((p) => ({ ...p, [qk]: "" }))}
          aria-label={t("list.clearSearch")}
          className="hover-glow hover-glow-halo shrink-0 transition-all"
          style={{ color: gl.muted }}
        >
          <X size={12} />
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
      className="hover-glow flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 transition-all"
    >
      <input
        type="checkbox"
        checked={o.selected}
        onChange={() => f.toggle(key, o.value)}
        className={small ? "h-3.5 w-3.5 rounded" : "h-4 w-4 rounded"}
        style={{ accentColor: gl.accent }}
      />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] ${small ? "font-normal" : "font-semibold"}`}
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
        className="hover-glow flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-all"
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
            className="rounded-full px-2 py-0.5 text-[12px] font-bold leading-none"
            style={{ background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff" }}
          >
            {picked}
          </span>
        )}
        <ChevronDown
          size={14}
          style={{
            color: gl.muted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 mt-2 w-80 overflow-y-auto rounded-2xl p-3.5"
          style={{
            top: "100%",
            maxHeight: "60vh",
            // opaque, NOT gl.card — see the header note
            background: gl.popover,
            border: `1.5px solid rgba(${gl.accentRgb},0.35)`,
            boxShadow: gl.isDark
              ? "0 12px 32px rgba(0,0,0,0.55)"
              : "0 12px 32px rgba(0,0,0,0.18)",
            scrollbarWidth: "none",
          } as React.CSSProperties}
        >
          {facet.options.length === 0 ? (
            <p className="py-1 text-[13px] font-normal" style={{ color: gl.muted }}>
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
                          className="pb-1 text-[12px] font-bold uppercase tracking-wide"
                          style={{ color: gl.accent, opacity: 0.7 }}
                        >
                          {t("facet.ordername")}
                        </p>
                        {o.children.length === 0 ? (
                          <p className="text-[13px] font-normal" style={{ color: gl.muted }}>
                            {t("facet.ordernameEmpty")}
                          </p>
                        ) : (
                          <>
                            {searchBox(o.value)}
                            {kid.visible.map((k) => row(k, "ordername", true))}
                            {kid.noMatch && (
                              <p className="py-1 text-[13px] font-normal" style={{ color: gl.muted }}>
                                {t("facet.ordernameNoMatch", { q: query[o.value] ?? "" })}
                              </p>
                            )}
                            {kid.hidden > 0 && (
                              <p className="py-1 text-[13px] font-medium" style={{ color: gl.muted }}>
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
                <p className="py-1 text-[13px] font-normal" style={{ color: gl.muted }}>
                  {t("facet.ordernameNoMatch", { q: query[`facet:${facet.key}`] ?? "" })}
                </p>
              )}
              {main.hidden > 0 && (
                <p className="py-1 text-[13px] font-medium" style={{ color: gl.muted }}>
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
