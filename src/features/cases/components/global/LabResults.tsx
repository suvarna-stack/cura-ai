// ============================================================
// Laboratory results, hospital-style (2026-07-30): the original
// coder UI shows labs as a results table grouped under a panel
// heading — "HEMATOLOGY: Hb : 9.8, Hct : 30.9 …" — not as generic
// order rows. The synced lab orders carry exactly that shape
// (panelname / itemname / itemvalue / itemuom in the detail JSON),
// so this renders them the way a coder is used to reading them.
// No abnormal-value highlighting: the feed has no normal ranges,
// and inventing our own would be fake clinical judgment.
// ============================================================
import { FlaskConical } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { ApiCaseDetail } from "../../types/api.types";

type OrderRow = ApiCaseDetail["orders"][number];

/** Group lab rows by panel, keeping first-appearance order. */
function byPanel(rows: OrderRow[]): Map<string, OrderRow[]> {
  const panels = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const panel = r.detail?.panelname || r.order_name || "—";
    const list = panels.get(panel);
    if (list) list.push(r);
    else panels.set(panel, [r]);
  }
  return panels;
}

export function LabResults({ detail }: { detail: ApiCaseDetail | null }) {
  const { gl } = useTheme();
  const { t } = useLang();
  const labs = (detail?.orders ?? []).filter((o) => o.order_category === "lab");
  if (labs.length === 0) return null;

  return (
    <div className="mt-5 pt-4" style={{ borderTop: `1px solid rgba(${gl.accentRgb},${gl.isDark ? 0.22 : 0.16})` }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: gl.accent }}>
        <FlaskConical size={12} /> {t("report.labs")}
      </p>
      <div className="space-y-2">
        {[...byPanel(labs).entries()].map(([panel, rows]) => (
          <div key={panel} className="rounded-lg overflow-hidden" style={{ border: gl.borderSm }}>
            <div className="px-2.5 py-1.5 flex items-center justify-between gap-2"
              style={{ background: `rgba(${gl.accentRgb},0.08)` }}>
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: gl.accent }}>{panel}</span>
              {rows[0].detail?.reportdatetime && (
                <span className="text-[10px] font-normal shrink-0" style={{ color: gl.muted }}>
                  {rows[0].detail.reportdatetime}
                </span>
              )}
            </div>
            <div>
              {rows.map((r, i) => {
                const name = r.detail?.itemname || r.order_name || "—";
                const value = r.detail?.itemvalue;
                const unit = r.detail?.itemuom;
                return (
                  <div key={i} className="px-2.5 py-1 flex items-baseline gap-2"
                    style={i > 0 ? { borderTop: gl.borderSm } : undefined}>
                    <span className="text-[12px] font-normal flex-1 min-w-0" style={{ color: gl.text }}>{name}</span>
                    <span className="text-[12px] font-semibold shrink-0" style={{ color: gl.text }}>
                      {value || "—"}{value && unit ? ` ${unit}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
