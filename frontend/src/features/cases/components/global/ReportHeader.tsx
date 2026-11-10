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
// The strip carries two different kinds of fact, so it is drawn as
// two groups split by a rule:
//   · narrative sections (CC&PI / PE / MX) — present or not, ✓ or –
//   · order categories (Order / Lab / X-ray / Operative) — HOW MANY
// The count is a separate badge, never plain text after the label:
// "Lab 7" set in one weight reads as the name of a thing, which is
// exactly the confusion this layout fixes.
//
// Fields iMed does not supply at all (MD, Operative Note for OPD)
// are shown as "—" with the reason on hover rather than hidden:
// the gap is information the hospital needs.
// ============================================================
import {
  User, Hash, Calendar, Activity, UserCheck, Stethoscope,
  FileText, ClipboardList, Pill, FlaskConical, Scan, Scissors, Check, Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import type { GL } from "../../types/theme.types";
import type { ApiCaseDetail } from "../../types/api.types";

/** narrative parts — presence only, matched on the synced section fieldnames */
const SECTION_PARTS: { key: string; icon: LucideIcon; names: string[] }[] = [
  { key: "CC&PI", icon: FileText,      names: ["chief complaint", "present illness", "subjective"] },
  { key: "PE",    icon: Stethoscope,   names: ["physical examination", "objective"] },
  { key: "MX",    icon: ClipboardList, names: ["plan", "assessment", "progression"] },
];

/** order parts — countable, so they carry a number badge */
const ORDER_PARTS: { key: string; icon: LucideIcon; cat: string; section?: string }[] = [
  { key: "Order",     icon: Pill,         cat: "medicine", section: "order" },
  { key: "Lab",       icon: FlaskConical, cat: "lab" },
  { key: "X-ray",     icon: Scan,         cat: "X-ray" },
  { key: "Operative", icon: Scissors,     cat: "surgery" },
];

type Part = { key: string; icon: LucideIcon; ok: boolean; n: number };

/** Which report parts are present, derived from the synced sections + orders. */
function reportParts(detail: ApiCaseDetail | null): { sections: Part[]; orders: Part[] } {
  const has = (...names: string[]) =>
    (detail?.sections ?? []).some(
      (s) => names.some((n) => (s.fieldname ?? "").toLowerCase().includes(n)) && (s.value ?? "").trim() !== "");
  // true totals from orderCounts — the orders[] array is capped per category
  const count = (cat: string) =>
    detail?.orderCounts?.[cat] ?? (detail?.orders ?? []).filter((o) => o.order_category === cat).length;
  return {
    sections: SECTION_PARTS.map((p) => ({ key: p.key, icon: p.icon, ok: has(...p.names), n: 0 })),
    orders: ORDER_PARTS.map((p) => {
      const n = count(p.cat);
      return { key: p.key, icon: p.icon, n, ok: n > 0 || (p.section ? has(p.section) : false) };
    }),
  };
}

/** One part of the record: icon + name, then either a count badge, a ✓, or a – */
function PartChip({ part, gl, title }: { part: Part; gl: GL; title: string }) {
  const base = "inline-flex items-center gap-1.5 h-[22px] rounded-full text-[12px] font-semibold";
  if (!part.ok) {
    return (
      <span title={title}
        className={`${base} pl-2 pr-2.5`}
        style={{ background: "transparent", color: gl.muted, border: `1px dashed ${gl.isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.20)"}`, opacity: 0.75 }}>
        <part.icon size={11} className="shrink-0" />
        {part.key}
        <Minus size={11} className="shrink-0" />
      </span>
    );
  }
  return (
    <span title={title}
      className={`${base} ${part.n > 0 ? "pl-2 pr-1" : "pl-2 pr-2.5"}`}
      style={{
        background: gl.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
        color: gl.text, border: gl.borderSm,
      }}>
      <part.icon size={11} className="shrink-0" style={{ color: gl.accent }} />
      {part.key}
      {part.n > 0 ? (
        // the number lives in its own badge so it reads as a quantity,
        // not as part of the category name
        <span className="min-w-[18px] h-[16px] px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold tabular-nums leading-none"
          style={{ background: `rgba(${gl.accentRgb},0.16)`, color: gl.accent }}>
          {part.n}
        </span>
      ) : (
        <Check size={11} className="shrink-0" style={{ color: gl.accent }} />
      )}
    </span>
  );
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

  const parts = reportParts(detail);

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
        <span className="inline-flex items-center h-[22px] px-2.5 text-[12px] font-bold rounded-full"
          style={{ background: `rgba(${gl.accentRgb},0.14)`, color: gl.accent, border: `1px solid rgba(${gl.accentRgb},0.25)` }}>
          {enc === "1" ? "IPD" : "OPD"}
        </span>

        {/* written-up sections: present or missing, no quantity to show */}
        {parts.sections.map((p) => (
          <PartChip key={p.key} part={p} gl={gl}
            title={p.ok ? t("report.partPresent", { part: p.key })
                        : t("report.partMissing", { part: p.key })} />
        ))}

        {/* rule keeps the ✓/– group from being read as the same scale as the counts */}
        <span aria-hidden className="w-px h-[16px] mx-0.5 shrink-0"
          style={{ background: gl.isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)" }} />

        {/* order categories: the badge is the number of records in this visit */}
        {parts.orders.map((p) => (
          <PartChip key={p.key} part={p} gl={gl}
            title={p.n > 0 ? t("report.partCount", { n: String(p.n), part: p.key })
                 : p.ok  ? t("report.partPresent", { part: p.key })
                         : t("report.partMissing", { part: p.key })} />
        ))}
      </div>
    </>
  );
}
