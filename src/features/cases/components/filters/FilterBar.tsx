// ============================================================
// Horizontal filter + sort bar — top of the Dashboard.
//
// Replaces two things at once (hospital request 2026-08-25):
//   * the left FilterPanel sidebar, which the coder asked to move
//     to the top so the case list gets the full width. This is a
//     reversal of hospital feedback item 7 ("e-commerce style"),
//     made knowingly — the facets themselves are unchanged, they
//     just live behind a button now.
//   * the old DateFilterBar, whose only job was picking a SYNC
//     period. Sync moved to the header next to the account chip,
//     so that bar had nothing left to hold.
//
// The bar shows state, not controls: how many filters are on,
// what the sort is, which chips are active. Changing any of it
// opens a dialog. That keeps a row of ~12 facet checkboxes off a
// screen whose job is reading cases.
// ============================================================
import { useState } from "react";
import { ArrowUpDown, FilterX, SlidersHorizontal, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { ModalShell } from "../../../../components/ui/Modal";
import { FilterPanel } from "./FilterPanel";
import { SortDialog } from "./SortDialog";
import { useSortLabel } from "../../utils/sortOptions";
import type { CaseFilters } from "../../hooks/useCaseFilters";

/** The facets, lifted out of the sidebar and into a modal. */
function FilterDialog({
  f,
  loading,
  onClose,
}: {
  f: CaseFilters;
  loading: boolean;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t("filter.title")}
      overlayStyle={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      className="flex w-full max-w-md flex-col rounded-2xl"
      style={{
        background: gl.card,
        backdropFilter: gl.blur20,
        WebkitBackdropFilter: gl.blur20,
        border: `1px solid rgba(${gl.accentRgb},0.25)`,
        boxShadow: gl.shadow,
        maxHeight: "min(80vh, 46rem)",
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
        <SlidersHorizontal size={15} style={{ color: gl.accent }} />
        <h3 className="flex-1 text-[15px] font-bold" style={{ color: gl.text }}>
          {t("filter.title")}
        </h3>
        {f.active && (
          <button
            onClick={f.clearAll}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold transition-all hover:opacity-80"
            style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}
          >
            <FilterX size={11} /> {t("filter.clearAll")}
          </button>
        )}
      </div>

      {/* the facet list scrolls; the header and footer stay put */}
      <div
        className="min-h-0 flex-1 overflow-y-auto px-5"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <FilterPanel f={f} loading={loading} variant="dialog" />
      </div>

      <div
        className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-5"
        style={{ borderTop: gl.borderSm }}
      >
        <p className="text-[12px] font-semibold" style={{ color: gl.muted }}>
          {t("filter.match", { n: f.totalComplete + f.totalIncomplete })}
        </p>
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-[12px] font-bold transition-all hover:opacity-90"
          style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}
        >
          {t("filter.done")}
        </button>
      </div>
    </ModalShell>
  );
}

export function FilterBar({
  f,
  loading = false,
}: {
  f: CaseFilters;
  loading?: boolean;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = useSortLabel(f.sortMode);

  // A control reads "on" only when it is actually narrowing the list, so an
  // untouched bar is visually quiet and an active filter is impossible to miss.
  const onStyle = {
    background: `rgba(${gl.accentRgb},0.15)`,
    border: `1px solid rgba(${gl.accentRgb},0.35)`,
    color: gl.accent,
  };
  const offStyle = { background: gl.inputBg, border: gl.border, color: gl.text };

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2"
        style={{
          background: gl.card,
          backdropFilter: gl.blur16,
          WebkitBackdropFilter: gl.blur16,
          border: f.active ? `1px solid rgba(${gl.accentRgb},0.35)` : gl.border,
          boxShadow: gl.shadowSm,
        }}
      >
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold whitespace-nowrap transition-all hover:opacity-90"
          style={f.active ? onStyle : offStyle}
        >
          <SlidersHorizontal size={12} />
          {t("filter.title")}
          {f.chips.length > 0 && (
            <span
              className="ml-0.5 rounded-full px-1.5 text-[11px] font-bold"
              style={{ background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff" }}
            >
              {f.chips.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSortOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all hover:opacity-90"
          style={offStyle}
          title={t("sort.title")}
        >
          <ArrowUpDown size={12} style={{ color: gl.accent }} />
          <span style={{ color: gl.muted }}>{t("sort.title")}:</span>
          <span style={{ color: gl.text }}>{sortLabel}</span>
        </button>

        {/* active facets stay visible on the bar — the whole reason the panel
            could move behind a button without the coder losing track */}
        {f.chips.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {f.chips.map((c) => (
              <button
                key={`${c.key}:${c.value}`}
                onClick={() => f.toggle(c.key, c.value)}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold transition-all hover:opacity-80"
                style={{
                  background: `rgba(${gl.accentRgb},0.15)`,
                  color: gl.accent,
                  border: `1px solid rgba(${gl.accentRgb},0.30)`,
                }}
                title={`${c.label} — remove`}
              >
                {c.label} <X size={9} />
              </button>
            ))}
          </div>
        )}

        {f.active && (
          <button
            onClick={f.clearAll}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all hover:opacity-80"
            style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}
          >
            <FilterX size={11} /> {t("filter.clearAll")}
          </button>
        )}
      </div>

      {filtersOpen && (
        <FilterDialog f={f} loading={loading} onClose={() => setFiltersOpen(false)} />
      )}
      {sortOpen && (
        <SortDialog
          value={f.sortMode}
          onPick={f.setSortMode}
          onClose={() => setSortOpen(false)}
        />
      )}
    </>
  );
}
