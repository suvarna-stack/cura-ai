// ============================================================
// Sort options + the active-mode label, kept component-free so
// fast refresh works in SortDialog (same split as
// LanguageContext / LanguageProvider).
// ============================================================
import { useLang } from "../context/LanguageContext";
import type { SortMode } from "../hooks/useCaseFilters";

/** The five modes, in the order the sidebar used to show them: date first
 *  (the default axis), then confidence, then the A–Z code sort (item 4). */
export const SORT_OPTIONS: { mode: SortMode; labelKey: string }[] = [
  { mode: "date-desc", labelKey: "sort.newest" },
  { mode: "date-asc", labelKey: "sort.oldest" },
  { mode: "conf-desc", labelKey: "sort.highest" },
  { mode: "conf-asc", labelKey: "sort.lowest" },
  { mode: "code-asc", labelKey: "sort.codeAz" },
];

/** The active mode's label, for the button that opens the sort dialog. */
export function useSortLabel(mode: SortMode): string {
  const { t } = useLang();
  const hit = SORT_OPTIONS.find((o) => o.mode === mode);
  return t(hit ? hit.labelKey : "sort.title");
}
