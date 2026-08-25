// ============================================================
// Sort picker (hospital request 2026-08-25).
//
// Sorting used to be five radio buttons sitting open in the left
// sidebar. The coder asked for the sidebar to go and for sort to
// be a click that opens a chooser — the list is what she wants to
// look at, not the controls. So: one button showing the ACTIVE
// sort, and this menu under it.
//
// It was briefly a centered MODAL (SortDialog). That was wrong on
// two counts, both reported 25/08/2026: the dim overlay covered
// the list for a choice that changes nothing about it, and the
// glass panel let the tab strip read straight through the options.
// Now it is an anchored dropdown on an opaque surface, matching
// every other control on this bar.
//
// Picking applies immediately and closes. There is nothing to
// confirm: a sort is instantly reversible and instantly visible.
// ============================================================
import { useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { useMenuDismiss } from "./useMenuDismiss";
import type { SortMode } from "../../hooks/useCaseFilters";
import { SORT_OPTIONS, useSortLabel } from "../../utils/sortOptions";

export function SortMenu({
  value,
  onPick,
}: {
  value: SortMode;
  onPick: (m: SortMode) => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const label = useSortLabel(value);

  useMenuDismiss(open, wrap, () => setOpen(false));

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={t("sort.title")}
        className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-all hover:opacity-90"
        style={{ background: gl.inputBg, border: gl.border, color: gl.text }}
      >
        <ArrowUpDown size={14} style={{ color: gl.accent }} />
        <span style={{ color: gl.muted }}>{t("sort.title")}:</span>
        <span style={{ color: gl.text }}>{label}</span>
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
          role="radiogroup"
          aria-label={t("sort.title")}
          // right-0: sort is the last control on the bar, so a left-anchored
          // panel would hang off the edge on a narrow window
          className="absolute right-0 z-50 mt-2 w-72 space-y-1.5 rounded-2xl p-3"
          style={{
            top: "100%",
            // opaque for the same reason FacetDropdown is — this opens over
            // the tab strip, and glass let the tabs read through the options
            background: gl.popover,
            border: `1.5px solid rgba(${gl.accentRgb},0.35)`,
            boxShadow: gl.isDark
              ? "0 12px 32px rgba(0,0,0,0.55)"
              : "0 12px 32px rgba(0,0,0,0.18)",
          }}
        >
          {SORT_OPTIONS.map((o) => {
            const on = value === o.mode;
            return (
              <button
                key={o.mode}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  onPick(o.mode);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition-all hover:opacity-90"
                style={
                  on
                    ? {
                        background: `rgba(${gl.accentRgb},0.15)`,
                        border: `1px solid rgba(${gl.accentRgb},0.35)`,
                        color: gl.accent,
                      }
                    : { background: gl.inputBg, border: gl.border, color: gl.text }
                }
              >
                <span className="flex-1">{t(o.labelKey)}</span>
                {on && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
