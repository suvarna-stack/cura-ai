// ============================================================
// Discharge-report header (meeting item 8).
//
// The hospital asked the report to carry HN / VN / Date / CC&PI /
// PE / X-ray / Lab / MX / Order / MD / OPD / Operative Note.
// The identity fields sit in the grid; the clinical parts are a
// presence strip — because the point of the request is that the
// AI cannot suggest codes when a part is missing, so a coder must
// see at a glance WHICH part is missing.
//
// Fields iMed does not supply at all (MD, Operative Note for OPD)
// are shown as "—" with the reason on hover rather than hidden:
// the gap is information the hospital needs.
// ============================================================
import { User, Hash, Calendar, Activity, UserCheck, Stethoscope } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { ApiCaseDetail } from "../../types/api.types";

/** Which report parts are present, derived from the synced sections + orders. */
function reportParts(detail: ApiCaseDetail | null) {
  const has = (...names: string[]) =>
    (detail?.sections ?? []).some(
      (s) => names.some((n) => (s.fieldname ?? "").toLowerCase().includes(n)) && (s.value ?? "").trim() !== "");
  // true totals from orderCounts — the orders[] array is capped per category
  const orders = (cat: string) =>
    detail?.orderCounts?.[cat] ?? (detail?.orders ?? []).filter((o) => o.order_category === cat).length;
  return [
    { key: "CC&PI",     ok: has("chief complaint", "present illness", "subjective"), n: 0 },
    { key: "PE",        ok: has("physical examination", "objective"), n: 0 },
    { key: "MX",        ok: has("plan", "assessment", "progression"), n: 0 },
    { key: "Order",     ok: has("order") || orders("medicine") > 0, n: orders("medicine") },
    { key: "Lab",       ok: orders("lab") > 0, n: orders("lab") },
    { key: "X-ray",     ok: orders("X-ray") > 0, n: orders("X-ray") },
    { key: "Operative", ok: orders("surgery") > 0, n: orders("surgery") },
  ];
}

export function ReportHeader({ detail, caseId, dept }: {
  detail: ApiCaseDetail | null;
  caseId: string;
  /** fallback when the detail fetch has not settled */
  dept?: string;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const dc = detail?.case;
  const enc = dc?.encountertype;
  const visitDate =
    dc?.admissiondatetime ||
    detail?.sections.find((s) => s.recorddatetime)?.recorddatetime ||
    (dc?.fetched_at ?? "").slice(0, 10) || "—";

  const meta: { icon: typeof User; label: string; value: string; title?: string }[] = [
    { icon: Hash,       label: "VN",         value: dc?.case_id ?? caseId },
    { icon: User,       label: "HN",         value: dc?.patient_ref ?? "—",
      title: dc?.patient_ref ? undefined : t("ident.hnMissing") },
    { icon: Calendar,   label: t("meta.date"), value: visitDate },
    { icon: Activity,   label: t("meta.dept"), value: dc?.department ?? dc?.ward ?? dept ?? "—" },
    { icon: UserCheck,  label: t("meta.coverage"),
      value: detail?.coverage?.scheme_family ?? dc?.coverage_type ?? "—",
      title: dc?.coverage_type ?? undefined },
    // the iMed extract has no MD column, so this reads "—" with the reason on
    // hover — except on a payload that does supply one (the showcase case)
    { icon: Stethoscope, label: "MD", value: dc?.attending_physician ?? "—",
      title: dc?.attending_physician ? undefined : t("report.mdMissing") },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-x-5 gap-y-1.5">
        {meta.map((item) => (
          <div key={item.label} className="flex items-center gap-2 min-w-0" title={item.title}>
            <item.icon size={11} style={{ color: gl.accent }} className="shrink-0" />
            <span className="text-[12px] font-normal shrink-0" style={{ color: gl.muted }}>{item.label}:</span>
            <span className="text-[12px] font-semibold truncate"
              style={{ color: item.value === "—" ? gl.muted : gl.text }}>{item.value}</span>
          </div>
        ))}
      </div>
      {/* encounter type + which clinical parts the record actually holds */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `rgba(${gl.accentRgb},0.14)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
          {enc === "1" ? "IPD" : "OPD"}
        </span>
        {reportParts(detail).map((p) => (
          <span key={p.key}
            title={p.ok ? undefined : t("report.partMissing", { part: p.key })}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={p.ok
              ? { background: gl.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", color: gl.text, border: gl.borderSm }
              : { background: "transparent", color: gl.muted, border: gl.borderSm, opacity: 0.7 }}>
            {p.key} {p.ok ? (p.n > 0 ? p.n : "✓") : "—"}
          </span>
        ))}
      </div>
    </>
  );
}
