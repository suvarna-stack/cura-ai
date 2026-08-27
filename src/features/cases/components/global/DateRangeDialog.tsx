// ============================================================
// Shared date-window picker (hospital request 2026-08-25).
//
// One dialog, three ways to say the same thing — a Quick preset,
// a Specific date, or a from/to Date range — because the coder
// asked for exactly those three on both the sync control and the
// Analytics filter. Both surfaces render this, so "this month"
// can never mean two different things on two screens.
//
// The value is always a plain inclusive {from,to} of ISO days, or
// null for "everything". Callers never see the mode: it is an
// input affordance, not state worth persisting.
// ============================================================
import { useState } from "react";
import { CalendarDays, CalendarRange, Zap, Check } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { ModalShell } from "../../../../components/ui/Modal";
import { QUICK_PRESETS, isoDay, type DateRange } from "../../utils/dateRange";

type Mode = "quick" | "specific" | "range";

export function DateRangeDialog({
  value,
  title,
  confirmLabel = "Apply",
  allLabel = "All time",
  /** Hide "All time" where an unbounded window makes no sense. */
  allowAll = true,
  onApply,
  onClose,
}: {
  value: DateRange | null;
  title: string;
  confirmLabel?: string;
  allLabel?: string;
  allowAll?: boolean;
  onApply: (next: DateRange | null) => void;
  onClose: () => void;
}) {
  const { gl } = useTheme();
  // Open on the tab that matches what the value already is, so reopening the
  // dialog shows the choice that produced the current window.
  const [mode, setMode] = useState<Mode>(
    !value ? "quick" : value.from === value.to ? "specific" : "range",
  );
  const today = isoDay(new Date());
  const [specific, setSpecific] = useState(value?.from ?? today);
  const [from, setFrom] = useState(value?.from ?? today);
  const [to, setTo] = useState(value?.to ?? today);

  // A backwards range is the one input error this dialog can produce; block
  // Apply rather than silently swapping the ends behind the coder's back.
  const invalid = mode === "range" && from > to;

  const apply = () => {
    if (invalid) return;
    if (mode === "specific") onApply({ from: specific, to: specific });
    else if (mode === "range") onApply({ from, to });
    onClose();
  };

  const tabs: { id: Mode; label: string; icon: typeof Zap }[] = [
    { id: "quick", label: "Quick", icon: Zap },
    { id: "specific", label: "Specific date", icon: CalendarDays },
    { id: "range", label: "Date range", icon: CalendarRange },
  ];

  const field: React.CSSProperties = {
    background: gl.inputBg,
    border: gl.border,
    color: gl.text,
    colorScheme: gl.isDark ? "dark" : "light",
  };

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={title}
      overlayStyle={{
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      className="w-full max-w-md rounded-2xl p-5"
      style={{
        background: gl.card,
        backdropFilter: gl.blur20,
        WebkitBackdropFilter: gl.blur20,
        border: `1px solid rgba(${gl.accentRgb},0.25)`,
        boxShadow: gl.shadow,
      }}
    >
      <h3 className="mb-3 text-[15px] font-bold" style={{ color: gl.text }}>
        {title}
      </h3>

      {/* mode switch */}
      <div className="mb-4 flex items-center gap-1.5">
        {tabs.map((t) => {
          const on = mode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className="hover-glow flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-semibold transition-all"
              style={
                on
                  ? {
                      background: `rgba(${gl.accentRgb},0.15)`,
                      border: `1px solid rgba(${gl.accentRgb},0.35)`,
                      color: gl.accent,
                    }
                  : { background: gl.inputBg, border: gl.border, color: gl.muted }
              }
            >
              <t.icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {mode === "quick" && (
        <div className="grid grid-cols-2 gap-2">
          {QUICK_PRESETS.filter((p) => allowAll || p.id !== "all").map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onApply(p.range());
                onClose();
              }}
              className="hover-glow rounded-lg px-3 py-2.5 text-left text-[12px] font-semibold transition-all"
              style={{ background: gl.inputBg, border: gl.border, color: gl.text }}
            >
              {p.id === "all" ? allLabel : p.label}
            </button>
          ))}
        </div>
      )}

      {mode === "specific" && (
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide" style={{ color: gl.muted }}>
            Date
          </span>
          <input
            type="date"
            value={specific}
            max={today}
            onChange={(e) => setSpecific(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] font-medium outline-none"
            style={field}
          />
        </label>
      )}

      {mode === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide" style={{ color: gl.muted }}>
              From
            </span>
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] font-medium outline-none"
              style={field}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide" style={{ color: gl.muted }}>
              To
            </span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[13px] font-medium outline-none"
              style={field}
            />
          </label>
        </div>
      )}

      {invalid && (
        <p className="mt-2 text-[12px] font-semibold" style={{ color: "#ef4444" }}>
          The start date is after the end date.
        </p>
      )}

      {/* Quick applies on click — it has no pending state to confirm. */}
      {mode !== "quick" && (
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="hover-glow rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
            style={{ border: gl.border, color: gl.text, background: gl.inputBg }}
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={invalid}
            className="hover-glow flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold transition-all disabled:opacity-40"
            style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}
          >
            <Check size={12} /> {confirmLabel}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
