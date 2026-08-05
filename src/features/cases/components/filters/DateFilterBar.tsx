// ============================================================
// Horizontal date bar — sits at the top of the Dashboard.
// Repurposed 2026-08-05: the selected period no longer filters
// the case lists, it is the SYNC period — the bar's Sync button
// pulls only the hospital cases whose visit date falls inside it
// (POST /api/sync {from,to}); with nothing selected it reads
// "Sync all" and pulls everything. State via useCaseFilters.
// ============================================================
import { CalendarDays, RefreshCw, X } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { useSync } from "../../context/SyncContext";
import { formatDate } from "../../utils/formatDate";
import type { CaseFilters, DateMode, QuickFilter } from "../../hooks/useCaseFilters";

/** Local YYYY-MM-DD (toISOString would shift the day in TH). */
function isoToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DateFilterBar({ f }: { f: CaseFilters }) {
  const { gl } = useTheme();
  const { t } = useLang();
  const { syncing, runSync } = useSync();

  const w = f.syncWindow;
  const windowLabel = w
    ? `${w.from ? formatDate(w.from) : "…"} – ${w.to ? formatDate(w.to) : "…"}`
    : null;

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
          // entering a mode pre-fills today, so the inputs show a REAL value
          // (dark, and matching the Sync button) instead of the browser's pale
          // placeholder skeleton — the complaint behind this default
          const activate = () => {
            f.setDateMode(active ? null : m.mode);
            if (active) return;
            if (m.mode === "specific" && !f.specificDate) f.setSpecificDate(isoToday());
            if (m.mode === "range") {
              if (!f.dateFrom) f.setDateFrom(isoToday());
              if (!f.dateTo) f.setDateTo(isoToday());
            }
          };
          return (
            <button key={m.mode} onClick={activate}
              className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap hover:opacity-90 transition-all"
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
            className="text-[12px] font-medium px-2 py-1.5 rounded-lg outline-none" style={inputStyle} />
          {f.specificDate && (
            <span className="text-[12px] font-semibold" style={{ color: gl.accent }}>{formatDate(f.specificDate)}</span>
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
              <span className="text-[12px] font-semibold" style={{ color: gl.muted }}>{r.label}</span>
              <input type="date" value={r.value ?? ""} onChange={(e) => r.set(e.target.value || null)}
                className="text-[12px] font-medium px-2 py-1.5 rounded-lg outline-none" style={inputStyle} />
              {r.value && (
                <span className="text-[12px] font-semibold" style={{ color: gl.accent }}>{formatDate(r.value)}</span>
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
                className="text-[12px] font-semibold px-2.5 py-1 rounded-full hover:opacity-90 transition-all"
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

      {/* clear the selected period (back to "Sync all") */}
      {f.dateActive && (
        <button onClick={f.clearDateFilter}
          className="flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg hover:opacity-80 transition-all"
          style={{ color: gl.accent, background: `rgba(${gl.accentRgb},0.10)` }}>
          <X size={10} /> {t("date.clearFilter")}
        </button>
      )}

      {/* the action: pull the selected period from the hospital — or everything */}
      <button onClick={() => runSync(w ?? undefined)} disabled={syncing}
        className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
        style={{ background: gl.accentGrad, color: gl.isDark ? "#1a0a00" : "#fff" }}
        title={windowLabel ? `${t("sync.label")} · ${windowLabel}` : t("sync.label")}>
        <RefreshCw size={12} className={syncing ? "animate-spin" : undefined} />
        {syncing ? t("sync.syncing") : w ? `${t("sync.btn")} ${windowLabel}` : t("sync.all")}
      </button>
    </div>
  );
}
