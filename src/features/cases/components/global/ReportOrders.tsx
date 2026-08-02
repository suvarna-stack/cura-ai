// ============================================================
// Orders & results block appended to the discharge report
// (meeting item 8: Order / Lab / X-ray / Operative Note belong in
// the report the coder reads, not only in the case list).
//
// Every field iMed sent is shown — dosage signature and instruction,
// quantity, result value + unit, procedure times, document type,
// billing/terminology codes. The key set differs per source table,
// so the rows render whatever `detail` actually contains rather
// than a fixed column list.
// ============================================================
import { useState } from "react";
import { ChevronDown, Pill, Scan, Scissors, ClipboardList } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { ApiCaseDetail } from "../../types/api.types";

// "lab" is deliberately absent: lab rows render as the hospital-style
// results table (LabResults, 2026-07-30), not as generic order rows
const CATS: [string, string, typeof Pill][] = [
  ["medicine", "Order (medication)", Pill],
  ["X-ray", "CT / X-ray", Scan],
  ["surgery", "Operative / procedure", Scissors],
  ["other", "Other", ClipboardList],
];
const PREVIEW = 6;

/** iMed field name -> what a coder calls it. Unknown keys fall back to the raw
 *  name, so a new iMed field shows up instead of silently disappearing. */
const FIELD_LABEL: Record<string, string> = {
  dosagesignature: "Dosage", dosageinstruction: "Instruction", quantity: "Qty",
  remark: "Remark", receiveddatetime: "Received",
  panelname: "Panel", itemname: "Item", itemvalue: "Result", itemuom: "Unit",
  collectdatetime: "Collected", reportdatetime: "Reported",
  value: "Value", uom: "Unit", documenttype: "Document",
  fieldname: "Field", subfieldname: "Section", recorddatetime: "Recorded",
  icd: "ICD-9", operationtype: "Type", startdatetime: "Start", enddatetime: "End",
  tmt: "TMT", tmlt: "TMT", paneltmlt: "TMT", itemtmlt: "TMT",
  cgd: "CGD", panelcgd: "CGD", itemcgd: "CGD",
};
// shown as the row title instead of repeated in the field list
const TITLE_KEYS = ["name", "panelname"];

export function ReportOrders({ detail }: { detail: ApiCaseDetail | null }) {
  const { gl } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // labs live in their own LabResults table — without this filter a lab-only
  // case would render an empty "Orders & results" heading
  const orders = (detail?.orders ?? []).filter((o) => o.order_category !== "lab");
  if (orders.length === 0) return null;

  const row = (o: ApiCaseDetail["orders"][number], i: number) => {
    const d = o.detail ?? {};
    const title = TITLE_KEYS.map((k) => d[k]).find(Boolean) ?? o.order_name ?? "—";
    const fields = Object.entries(d).filter(([k]) => !TITLE_KEYS.includes(k));
    return (
      <li key={i} className="rounded-lg px-2.5 py-1.5" style={{ background: gl.row, border: gl.borderSm }}>
        <p className="text-[12px] font-semibold" style={{ color: gl.text }}>{title}</p>
        {fields.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {fields.map(([k, v]) => (
              <span key={k} className="text-[12px] font-normal">
                <span className="font-semibold uppercase tracking-wide" style={{ color: gl.muted, opacity: 0.75, fontSize: "9px" }}>
                  {FIELD_LABEL[k] ?? k}{" "}
                </span>
                <span style={{ color: gl.muted }}>{v}</span>
              </span>
            ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="mt-5 pt-4" style={{ borderTop: `1px solid rgba(${gl.accentRgb},${gl.isDark ? 0.22 : 0.16})` }}>
      <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: gl.accent }}>
        {t("report.orders")}
      </p>
      <div className="space-y-2">
        {CATS.map(([key, label, Icon]) => {
          const rows = orders.filter((o) => o.order_category === key);
          if (rows.length === 0) return null;
          // the payload caps orders at 150 — say so rather than quietly showing less
          const total = detail?.orderCounts?.[key] ?? rows.length;
          const expanded = open[key] ?? false;
          const shown = expanded ? rows : rows.slice(0, PREVIEW);
          return (
            <div key={key} className="rounded-xl px-3 py-2"
              style={{ background: `rgba(${gl.accentRgb},0.04)`, border: `1px solid rgba(${gl.accentRgb},0.12)` }}>
              <button onClick={() => setOpen((o) => ({ ...o, [key]: !expanded }))}
                className="w-full flex items-center gap-2 text-left">
                <Icon size={11} style={{ color: gl.accent }} />
                <span className="text-[12px] font-bold flex-1" style={{ color: gl.text }}>{label}</span>
                <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ background: `rgba(${gl.accentRgb},0.12)`, color: gl.accent }}>{total}</span>
                {rows.length > PREVIEW && (
                  <ChevronDown size={12} style={{ color: gl.muted, transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                )}
              </button>
              <ul className="mt-1.5 space-y-1">
                {shown.map(row)}
                {!expanded && rows.length > PREVIEW && (
                  <li className="text-[12px] font-semibold px-1" style={{ color: gl.accent }}>
                    +{rows.length - PREVIEW} {t("report.moreOrders")}
                  </li>
                )}
                {expanded && total > rows.length && (
                  <li className="text-[12px] font-normal px-1" style={{ color: gl.muted }}>
                    {t("report.ordersCapped", { shown: rows.length, total })}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
