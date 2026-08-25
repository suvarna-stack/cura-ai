// ============================================================
// Sort picker (hospital request 2026-08-25).
//
// Sorting used to be five radio buttons sitting open in the left
// sidebar. The coder asked for the sidebar to go and for sort to
// be a click that opens a chooser — the list is what she wants to
// look at, not the controls. So: one button showing the ACTIVE
// sort, and this dialog behind it.
//
// Picking applies immediately and closes. There is nothing to
// confirm: a sort is instantly reversible and instantly visible.
// ============================================================
import { ArrowUpDown, Check } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { ModalShell } from "../../../../components/ui/Modal";
import type { SortMode } from "../../hooks/useCaseFilters";
import { SORT_OPTIONS } from "../../utils/sortOptions";

export function SortDialog({
  value,
  onPick,
  onClose,
}: {
  value: SortMode;
  onPick: (m: SortMode) => void;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t("sort.title")}
      overlayStyle={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      className="w-full max-w-xs rounded-2xl p-5"
      style={{
        background: gl.card,
        backdropFilter: gl.blur20,
        WebkitBackdropFilter: gl.blur20,
        border: `1px solid rgba(${gl.accentRgb},0.25)`,
        boxShadow: gl.shadow,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <ArrowUpDown size={15} style={{ color: gl.accent }} />
        <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>
          {t("sort.title")}
        </h3>
      </div>

      <div role="radiogroup" aria-label={t("sort.title")} className="space-y-1.5">
        {SORT_OPTIONS.map((o) => {
          const on = value === o.mode;
          return (
            <button
              key={o.mode}
              role="radio"
              aria-checked={on}
              onClick={() => {
                onPick(o.mode);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition-all hover:opacity-90"
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
              {on && <Check size={14} />}
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}
