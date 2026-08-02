// ============================================================
// Generic confirmation dialog — same glassmorphism pattern as the
// Dashboard approval dialog (fixed overlay + centered card + gl.*).
// Used for delete-code and approve-codes confirmations (Prompt 4).
// ============================================================
import type { LucideIcon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { ModalShell } from "../../../../components/ui/Modal";

export function ConfirmDialog({
  icon: Icon, title, body, confirmLabel, danger = false, onConfirm, onClose,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  confirmLabel: string;
  /** true → red confirm button (destructive actions like delete) */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const tint = danger ? "239,68,68" : gl.accentRgb; // #ef4444 for destructive
  const tintColor = danger ? "#ef4444" : gl.accent;
  return (
    <ModalShell onClose={onClose} ariaLabel={title}
      overlayStyle={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      className="w-full max-w-sm rounded-2xl p-5"
      style={{
        background: gl.card, backdropFilter: gl.blur20, WebkitBackdropFilter: gl.blur20,
        border: `1px solid rgba(${tint},0.25)`, boxShadow: gl.shadow,
      }}>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: `rgba(${tint},0.15)`, color: tintColor }}>
            <Icon size={18} />
          </div>
          <h3 className="text-[15px] font-bold" style={{ color: gl.text }}>{title}</h3>
        </div>
        <p className="text-[12px] font-normal leading-relaxed mb-4" style={{ color: gl.muted }}>{body}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="text-[12px] font-semibold px-4 py-2 rounded-lg hover:opacity-80 transition-all"
            style={{ border: gl.border, color: gl.text, background: gl.inputBg }}>
            {t("confirm.cancel")}
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-lg hover:opacity-90 transition-all"
            style={danger
              ? { background: "#ef4444", color: "#fff" }
              : { background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}>
            <Icon size={12} /> {confirmLabel}
          </button>
        </div>
    </ModalShell>
  );
}
