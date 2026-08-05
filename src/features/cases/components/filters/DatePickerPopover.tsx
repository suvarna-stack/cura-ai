// ============================================================
// Calendar popover for the sync-period bar — replaces the bare
// native date inputs (UX research: range picking wants a visual
// calendar with the range highlighted, not two disconnected
// "from"/"to" fields). react-day-picker v10 (WCAG 2.1 AA,
// keyboard-navigable grid) inside a glass-styled popover; the
// trigger chip shows the current selection.
// ============================================================
import { useEffect, useId, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { enUS, th } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { formatDate } from "../../utils/formatDate";
import type { GL } from "../../types/theme.types";

/**
 * Theme vars for the calendar. They MUST sit on DayPicker's own root element
 * (its `style` prop): style.css declares defaults on `.rdp-root`, which beat
 * any value merely inherited from a wrapper.
 */
const rdpVars = (gl: GL): React.CSSProperties => ({
  "--rdp-accent-color": gl.accent,
  "--rdp-accent-background-color": `rgba(${gl.accentRgb},0.16)`,
  "--rdp-today-color": gl.accent,
  "--rdp-font-family": "inherit",
  "--rdp-day-height": "2.1rem",
  "--rdp-day-width": "2.1rem",
  "--rdp-months-gap": "1rem", // default 2rem pushes two months past the panel cap -> vertical wrap
} as React.CSSProperties);

/** Local YYYY-MM-DD <-> Date (toISOString would shift the day in TH). */
const toIso = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};
const fromIso = (s: string | null): Date | undefined =>
  s ? new Date(`${s}T00:00:00`) : undefined;

type SingleProps = {
  mode: "single";
  date: string | null;
  onPick: (d: string | null) => void;
};
type RangeProps = {
  mode: "range";
  from: string | null;
  to: string | null;
  onPick: (from: string | null, to: string | null) => void;
};

export function DatePickerPopover(props: SingleProps | RangeProps) {
  const { gl } = useTheme();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // close on click outside / Escape (focus back on the trigger)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    props.mode === "single"
      ? props.date
        ? formatDate(props.date)
        : t("date.pickDate")
      : props.from || props.to
        ? `${props.from ? formatDate(props.from) : "…"} – ${props.to ? formatDate(props.to) : "…"}`
        : t("date.pickRange");
  const hasValue = props.mode === "single" ? props.date !== null : props.from !== null || props.to !== null;

  return (
    <div ref={rootRef} className="relative">
      <button ref={triggerRef} type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? panelId : undefined}
        className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg hover:opacity-90 transition-all"
        style={hasValue
          ? { background: `rgba(${gl.accentRgb},0.12)`, border: `1px solid rgba(${gl.accentRgb},0.30)`, color: gl.accent }
          : { background: gl.inputBg, border: gl.border, color: gl.muted }}>
        <CalendarDays size={12} />
        {label}
        <ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 120ms" }} />
      </button>

      {open && (
        <div id={panelId} role="dialog" aria-label={label}
          className="absolute left-0 top-full z-40 mt-2 rounded-2xl p-3"
          style={{
            // solid surface (glass over the case cards makes day numbers illegible)
            background: gl.isDark ? "#1c1917" : "#ffffff",
            border: `1px solid rgba(${gl.accentRgb},0.25)`, boxShadow: gl.shadow,
            color: gl.text,
            // shrink-to-fit against the narrow trigger would wrap the two
            // months vertically — size to the calendar itself instead
            width: "max-content", maxWidth: "min(92vw, 44rem)",
          }}>
          {props.mode === "single" ? (
            <DayPicker mode="single" required={false} style={rdpVars(gl)}
              locale={lang === "th" ? th : enUS}
              selected={fromIso(props.date)}
              defaultMonth={fromIso(props.date) ?? new Date()}
              onSelect={(d?: Date) => {
                props.onPick(d ? toIso(d) : null);
                if (d) setOpen(false); // one click picks the day and closes
              }} />
          ) : (
            <DayPicker mode="range" required={false} numberOfMonths={2} style={rdpVars(gl)}
              locale={lang === "th" ? th : enUS}
              selected={{ from: fromIso(props.from), to: fromIso(props.to) }}
              defaultMonth={fromIso(props.from) ?? new Date()}
              onSelect={(r?: DateRange) => {
                props.onPick(r?.from ? toIso(r.from) : null, r?.to ? toIso(r.to) : null);
                // stays open: picking a range is two clicks; outside/Escape closes
              }} />
          )}
        </div>
      )}
    </div>
  );
}
