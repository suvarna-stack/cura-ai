// ============================================================
// Horizontal date-filter bar — sits at the top of the Dashboard
// (moved out of the FilterPanel sidebar for better UX: dates are
// the first thing coders narrow by). Same state/API as the other
// filters via useCaseFilters.
// ============================================================
import { CalendarDays, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { formatDate } from "../../utils/formatDate";
import type { CaseFilters, DateMode, QuickFilter } from "../../hooks/useCaseFilters";

export function DateFilterBar({ f }: { f: CaseFilters }) {
  const { gl } = useTheme();
  const { t } = useLang();

  const inputStyle: React.CSSProperties = {
    background: gl.inputBg, border: gl.border, color: gl.text,
    colorScheme: gl.isDark ? "dark" : "light",
  };

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-2xl"
      style={{
        background: gl.card, backdropFilter: gl.blur16, WebkitBackdropFilter: gl.blur16,
        border: f.dateActive ? `1px solid rgba(${gl.accentRgb},0.35)` : gl.border,
        boxShadow: gl.shadowSm,
      }}>
      <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: gl.text }}>
        <CalendarDays size={12} style={{ color: gl.accent }} />
        {t("date.title")}
        {f.dateActive && <span>📅</span>}
      </span>

      {/* mode selector */}
      <div className="flex gap-1">
        {([
          { mode: "specific" as DateMode, label: `📅 ${t("date.specificDate")}` },
          { mode: "range"    as DateMode, label: `📆 ${t("date.dateRange")}` },
          { mode: "quick"    as DateMode, label: `⚡ ${t("date.quick")}` },
        ]).map((m) => {
          const active = f.dateMode === m.mode;
          return (
            <button key={m.mode} onClick={() => f.setDateMode(active ? null : m.mode)}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap hover:opacity-90 transition-all"
              style={active
                ? { background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff", border: `1px solid rgba(${gl.accentRgb},0.45)` }
                : { background: gl.inputBg, color: gl.muted, border: gl.borderSm }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {/* specific date */}
      {f.dateMode === "specific" && (
        <div className="flex items-center gap-2">
          <input type="date" value={f.specificDate ?? ""}
            onChange={(e) => f.setSpecificDate(e.target.value || null)}
            aria-label={t("date.specificDate")}
            className="text-[11px] font-medium px-2 py-1.5 rounded-lg outline-none" style={inputStyle} />
          {f.specificDate && (
            <span className="text-[11px] font-semibold" style={{ color: gl.accent }}>{formatDate(f.specificDate)}</span>
          )}
        </div>
      )}

      {/* date range */}
      {f.dateMode === "range" && (
        <div className="flex items-center gap-2">
          {([
            { label: t("date.from"), value: f.dateFrom, set: f.setDateFrom },
            { label: t("date.to"),   value: f.dateTo,   set: f.setDateTo },
          ]).map((r) => (
            <label key={r.label} className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: gl.muted }}>{r.label}</span>
              <input type="date" value={r.value ?? ""} onChange={(e) => r.set(e.target.value || null)}
                className="text-[11px] font-medium px-2 py-1.5 rounded-lg outline-none" style={inputStyle} />
              {r.value && (
                <span className="text-[11px] font-semibold" style={{ color: gl.accent }}>{formatDate(r.value)}</span>
              )}
            </label>
          ))}
        </div>
      )}

      {/* quick chips */}
      {f.dateMode === "quick" && (
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { q: "today" as QuickFilter, label: t("date.today") },
            { q: "week"  as QuickFilter, label: t("date.thisWeek") },
            { q: "month" as QuickFilter, label: t("date.thisMonth") },
            { q: "year"  as QuickFilter, label: t("date.thisYear") },
          ]).map((c) => {
            const active = f.quickFilter === c.q;
            return (
              <button key={c.q} onClick={() => f.setQuickFilter(active ? null : c.q)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full hover:opacity-90 transition-all"
                style={active
                  ? { background: gl.accent, color: gl.isDark ? "#1a0a00" : "#fff", border: `1px solid rgba(${gl.accentRgb},0.45)` }
                  : { background: gl.inputBg, color: gl.muted, border: gl.borderSm }}>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1" />

      {/* clear */}
      {f.dateActive && (
        <button onClick={f.clearDateFilter}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg hover:opacity-80 transition-all"
          style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}>
          <X size={10} /> {t("date.clearFilter")}
        </button>
      )}
    </div>
  );
}
