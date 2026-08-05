// ============================================================
// Shared empty-state block for the case list tabs: an icon in a
// soft accent circle, a line saying why the list is empty, and
// (optionally) the one action that would fill it. Callers hide
// the select-all toolbar and pagination at zero rows, so nothing
// on screen invites acting on an empty list.
// ============================================================
import type { LucideIcon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

export function EmptyState({ icon: Icon, title, subtext, actionLabel, onAction }: {
  icon: LucideIcon;
  title: string;
  subtext?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { gl } = useTheme();
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className="flex items-center justify-center w-11 h-11 rounded-full mb-3"
        style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>
        <Icon size={20} />
      </div>
      <p className="text-[13px] font-bold" style={{ color: gl.text }}>{title}</p>
      {subtext && (
        <p className="text-[12px] font-normal leading-relaxed mt-1 max-w-sm" style={{ color: gl.muted }}>
          {subtext}
        </p>
      )}
      {actionLabel && onAction && (
        <button onClick={onAction}
          className="text-[12px] font-bold px-3.5 py-2 rounded-lg mt-3.5 hover:opacity-90 transition-all"
          style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
