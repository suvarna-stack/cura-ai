// ============================================================
// Horizontal filter + sort bar — top of the Dashboard, sticky.
//
// Replaces three things (hospital request 2026-08-25):
//   * the left FilterPanel sidebar, which the coder asked to move
//     to the top. This knowingly reverses hospital feedback item 7
//     ("e-commerce style") — she asked for the reverse later, and
//     the later ask wins.
//   * the single "Filters" modal that briefly stood in for it. She
//     wanted each filter type reachable in ONE click from the bar,
//     not two clicks through a dialog covering the list being
//     filtered. So every facet is its own dropdown here.
//   * the old DateFilterBar, whose only job was picking a SYNC
//     period. Sync moved to the header beside the account chip.
//
// ICD-10 / ICD-9 are the exception: hundreds of codes each, needing
// search and catalog descriptions, so their buttons open the
// existing IcdFilterDialog rather than a cramped popover.
// ============================================================
import { useState } from "react";
import { ArrowUpDown, FilterX, ListFilter, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { FacetDropdown } from "./FacetDropdown";
import { IcdFilterDialog, type IcdTab } from "./IcdFilterDialog";
import { SortDialog } from "./SortDialog";
import { useSortLabel } from "../../utils/sortOptions";
import type { CaseFilters } from "../../hooks/useCaseFilters";

/** Rendered by their own dialog, not as a popover — see the header note. */
const ICD_KEYS: IcdTab[] = ["icd10", "icd9"];

export function FilterBar({
  f,
  loading = false,
}: {
  f: CaseFilters;
  loading?: boolean;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [sortOpen, setSortOpen] = useState(false);
  const [icdDialog, setIcdDialog] = useState<IcdTab | null>(null);
  const sortLabel = useSortLabel(f.sortMode);

  // `ordername` is the second level inside Order Type, never a bar control of
  // its own; the ICD facets get buttons below instead of dropdowns.
  const dropdowns = f.facets.filter(
    (x) => x.key !== "ordername" && !ICD_KEYS.includes(x.key as IcdTab),
  );

  const offStyle = { background: gl.inputBg, border: gl.border, color: gl.text };
  const onStyle = {
    background: `rgba(${gl.accentRgb},0.15)`,
    border: `1px solid rgba(${gl.accentRgb},0.35)`,
    color: gl.accent,
  };

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
        {/* facets are derived from the fetched list — show the shape of the
            bar while it loads rather than popping controls in one by one */}
        {loading && dropdowns.length === 0
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-8 w-28 animate-pulse rounded-lg"
                style={{ background: gl.inputBg, border: gl.border }}
              />
            ))
          : dropdowns.map((facet) => (
              <FacetDropdown key={facet.key} facet={facet} f={f} />
            ))}

        {/* ICD pickers: the count of picked codes is the whole status here —
            the codes themselves are chips further along the bar */}
        {ICD_KEYS.map((key) => {
          const facet = f.facets.find((x) => x.key === key);
          if (!facet) return null;
          const picked = facet.options.filter((o) => o.selected).length;
          return (
            <button
              key={key}
              onClick={() => setIcdDialog(key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all hover:opacity-90"
              style={picked > 0 ? onStyle : offStyle}
            >
              <ListFilter size={12} style={{ color: gl.accent }} />
              {t(`facet.${key}`)}
              {picked > 0 && (
                <span
                  className="rounded-full px-1.5 text-[11px] font-bold"
                  style={{ background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff" }}
                >
                  {picked}
                </span>
              )}
            </button>
          );
        })}

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

        {f.active && (
          <>
            <span className="text-[12px] font-semibold" style={{ color: gl.muted }}>
              {t("filter.match", { n: f.totalComplete + f.totalIncomplete })}
            </span>
            <button
              onClick={f.clearAll}
              className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all hover:opacity-80"
              style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}
            >
              <FilterX size={11} /> {t("filter.clearAll")}
            </button>
          </>
        )}

        {/* Active picks on their own row: a chip names the exact value, which
            the dropdown's count cannot, and removing one is a single click
            without reopening anything. */}
        {f.chips.length > 0 && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
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
                title={`${f.codeDesc[c.value] ?? c.label} — remove`}
              >
                {c.label} <X size={9} />
              </button>
            ))}
          </div>
        )}
      </div>

      {icdDialog && (
        <IcdFilterDialog f={f} initialTab={icdDialog} onClose={() => setIcdDialog(null)} />
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
