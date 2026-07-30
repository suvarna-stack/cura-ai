// ============================================================
// Vital-signs table at the top of the discharge report — the same
// element the hospital's own coder UI shows above CC,PI,PE
// (Time | BT | BP | PR …). Values come from the synced
// medhack_vitalsign rows verbatim; blanks arrive as null and
// render as "—". BP is composed systolic/diastolic like the
// hospital's "119/80".
// ============================================================
import { Activity } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { ApiCaseDetail } from "../../types/api.types";

type Vital = NonNullable<ApiCaseDetail["vitals"]>[number];

const COLS: { label: string; value: (v: Vital) => string | null }[] = [
  { label: "Time",      value: (v) => v.measured_at },
  { label: "BT(c)",     value: (v) => v.temperature },
  { label: "BP(mmHg)",  value: (v) => v.systolic || v.diastolic
      ? `${v.systolic ?? "—"}/${v.diastolic ?? "—"}` : null },
  { label: "PR(/min)",  value: (v) => v.heart_rate },
  { label: "O2Sat(%)",  value: (v) => v.oxygen_saturation },
  { label: "Wt(kg)",    value: (v) => v.weight },
  { label: "Ht(cm)",    value: (v) => v.height },
];

export function VitalsStrip({ detail }: { detail: ApiCaseDetail | null }) {
  const { gl } = useTheme();
  const { t } = useLang();
  const vitals = detail?.vitals ?? [];
  if (vitals.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Activity size={12} style={{ color: gl.accent }} />
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: gl.accent }}>
          {t("vitals.title")}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg" style={{ border: gl.borderSm }}>
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: `rgba(${gl.accentRgb},0.08)` }}>
              {COLS.map((c) => (
                <th key={c.label} className="text-left font-bold px-2.5 py-1.5 whitespace-nowrap"
                  style={{ color: gl.muted, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vitals.map((v, i) => (
              <tr key={i} style={i > 0 ? { borderTop: gl.borderSm } : undefined}>
                {COLS.map((c) => (
                  <td key={c.label} className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: gl.text }}>
                    {c.value(v) ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
