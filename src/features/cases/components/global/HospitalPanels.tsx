// ============================================================
// Hospital-style panel view of the case record (2026-07-31):
// mirrors the panels the hospital's own coder UI shows —
// CC,PI,PE (with the vitals table) · Past history · Lab/X-ray ·
// Diagnosis/Procedure · Order Entry (CPOE) · Investigations
// finding · Management/Suggestion — so a coder coming from iMed
// reads our record the way they are used to.
//
// It regroups the SAME synced data the chronological view shows
// (sections by fieldname, codes, orders); a toggle lets the coder
// switch back to the chronological document view, which preserves
// the day-by-day order the panels flatten. Section fields the
// hospital panels don't cover (Progression, Order …) land in a
// "Progress / other notes" panel rather than disappearing.
// ============================================================
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useLang } from "../../context/LanguageContext";
import { VitalsStrip } from "./VitalsStrip";
import { LabResults } from "./LabResults";
import type { ApiCaseDetail } from "../../types/api.types";

type Sec = ApiCaseDetail["sections"][number];
type OrderRow = ApiCaseDetail["orders"][number];

// which section fieldnames feed which panel (glossary §6 vocabulary);
// SOAP names ride with their classic equivalents like the completeness rule
const CC_FIELDS = ["Chief Complaint", "Subjective", "Present Illness", "Physical Examination", "Objective"];
const ALLERGY_FIELDS = ["Food-Drug Allergy"];
const PAST_FIELDS = ["Past History", "Family History"];
const INVEST_FIELDS = ["Investigation"];
const MGMT_FIELDS = ["Plan"];
const ASSESS_FIELDS = ["Assessment"];
const KNOWN = new Set([...CC_FIELDS, ...ALLERGY_FIELDS, ...PAST_FIELDS,
  ...INVEST_FIELDS, ...MGMT_FIELDS, ...ASSESS_FIELDS]);

export type ReportView = "hospital" | "chrono";
const VIEW_KEY = "mcai.reportView";

/** Persisted choice between the hospital panel view and the
 *  chronological document view — shared by all three detail pages. */
export function useReportView(): [ReportView, (v: ReportView) => void] {
  const [view, setView] = useState<ReportView>(() =>
    localStorage.getItem(VIEW_KEY) === "chrono" ? "chrono" : "hospital");
  return [view, (v) => { setView(v); localStorage.setItem(VIEW_KEY, v); }];
}

export function ReportViewToggle({ view, onChange }: {
  view: ReportView; onChange: (v: ReportView) => void;
}) {
  const { gl } = useTheme();
  const { t } = useLang();
  const opts: [ReportView, string][] = [
    ["hospital", t("hosp.view")],
    ["chrono", t("hosp.viewChrono")],
  ];
  return (
    <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: gl.borderSm }}>
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className="text-[10px] font-bold px-2 py-1 transition-all"
          style={v === view
            ? { background: `rgba(${gl.accentRgb},0.15)`, color: gl.accent }
            : { background: "transparent", color: gl.muted }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const { gl } = useTheme();
  return (
    <section className="rounded-xl overflow-hidden" style={{ border: gl.borderSm }}>
      <header className="px-3 py-1.5" style={{ background: `rgba(${gl.accentRgb},0.10)` }}>
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: gl.accent }}>{title}</h3>
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

function Empty() {
  const { gl } = useTheme();
  const { t } = useLang();
  return <p className="text-[11px] italic" style={{ color: gl.muted }}>{t("hosp.empty")}</p>;
}

/** Section entries with their fieldname + document/date label; `color`
 *  overrides text color (the hospital shows allergies in red). */
function Entries({ list, color }: { list: Sec[]; color?: string }) {
  const { gl } = useTheme();
  return (
    <div className="space-y-2.5">
      {list.map((s, i) => (
        <div key={i}>
          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: color ?? gl.accent }}>{s.fieldname}</span>
            <span className="text-[9px] font-normal" style={{ color: gl.muted }}>
              {s.documenttype}{s.recorddatetime ? ` · ${s.recorddatetime}` : ""}
            </span>
          </div>
          <p className="text-[12px] leading-5 whitespace-pre-wrap" style={{ color: color ?? gl.text }}>{s.value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

export function HospitalPanels({ detail }: { detail: ApiCaseDetail }) {
  const { gl } = useTheme();
  const { t } = useLang();

  const secs = detail.sections;
  const pick = (fields: string[]) => {
    const rank = (s: Sec) => fields.indexOf(s.fieldname);
    // stable sort: CC before PI before PE, chronological within a field
    return secs.filter((s) => fields.includes(s.fieldname)).sort((a, b) => rank(a) - rank(b));
  };
  const cc = pick(CC_FIELDS);
  const allergy = pick(ALLERGY_FIELDS);
  const past = pick(PAST_FIELDS);
  const invest = pick(INVEST_FIELDS);
  const mgmt = pick(MGMT_FIELDS);
  const assess = pick(ASSESS_FIELDS);
  const leftover = secs.filter((s) => !KNOWN.has(s.fieldname));

  const dx = detail.codes.filter((c) => c.code_system !== "ICD-9");
  const px = detail.codes.filter((c) => c.code_system === "ICD-9");

  const orders = detail.orders ?? [];
  // CPOE = things the doctor ordered (drugs, procedures). Lab rows are
  // RESULTS here (they render in the Lab panel), "other" is billing noise.
  const cpoe = orders.filter((o) => o.order_category === "medicine" || o.order_category === "surgery");
  const cpoeTotal = (detail.orderCounts?.medicine ?? 0) + (detail.orderCounts?.surgery ?? 0);
  const xray = orders.filter((o) =>
    o.order_category === "X-ray" || o.order_category === "CT" || o.order_category === "ROIP");

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 items-start">
      {/* left stack — the clinical narrative */}
      <div className="space-y-3 min-w-0">
        <Panel title={t("hosp.ccpipe")}>
          <VitalsStrip detail={detail} embedded />
          {cc.length > 0 ? <Entries list={cc} /> : <Empty />}
        </Panel>
        <Panel title={t("hosp.pastHistory")}>
          {allergy.length === 0 && past.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {/* allergies first and in red, the way the hospital flags them */}
              {allergy.length > 0 && <Entries list={allergy} color={gl.danger} />}
              {past.length > 0 && <Entries list={past} />}
            </div>
          )}
        </Panel>
        <Panel title={t("hosp.invfinding")}>
          {invest.length > 0 ? <Entries list={invest} /> : <Empty />}
        </Panel>
        {leftover.length > 0 && (
          <Panel title={t("hosp.progress")}>
            <Entries list={leftover} />
          </Panel>
        )}
      </div>

      {/* right stack — diagnosis, results, orders */}
      <div className="space-y-3 min-w-0">
        <Panel title={t("hosp.diagproc")}>
          {dx.length === 0 && px.length === 0 && assess.length === 0 ? <Empty /> : (
            <div className="space-y-2.5">
              {dx.length > 0 && (
                <div className="space-y-1">
                  {dx.map((c, i) => (
                    <div key={i} className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[12px] font-bold" style={{ color: gl.text }}>{c.code}</span>
                      <span className="text-[12px] font-normal" style={{ color: gl.text }}>{c.description ?? ""}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: gl.muted }}>
                        {c.code_role.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {px.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: gl.accent }}>
                    {t("hosp.procedures")}
                  </p>
                  <div className="space-y-1">
                    {px.map((c, i) => (
                      <div key={i}>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[12px] font-bold" style={{ color: gl.text }}>{c.code}</span>
                          <span className="text-[12px] font-normal" style={{ color: gl.text }}>{c.description ?? ""}</span>
                          {c.operation_type && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: gl.muted }}>
                              {c.operation_type}
                            </span>
                          )}
                        </div>
                        {(c.operation_start || c.operation_end) && (
                          <p className="text-[10px] font-normal" style={{ color: gl.muted }}>
                            {c.operation_start ?? "—"} → {c.operation_end ?? "—"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* the doctor's diagnosis in words, from the Assessment sections */}
              {assess.length > 0 && <Entries list={assess} />}
            </div>
          )}
        </Panel>
        <Panel title={t("hosp.labxray")}>
          <LabResults detail={detail} embedded />
          {xray.length > 0 && (
            <div className={(detail.orders ?? []).some((o) => o.order_category === "lab") ? "mt-2.5" : ""}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: gl.accent }}>
                {t("hosp.xray")}
              </p>
              <div className="space-y-1.5">
                {xray.map((o, i) => (
                  <div key={i}>
                    <p className="text-[12px] font-semibold" style={{ color: gl.text }}>
                      {o.detail?.name ?? o.order_name ?? "—"}
                    </p>
                    {o.detail?.value && (
                      <p className="text-[11px] leading-4 whitespace-pre-wrap" style={{ color: gl.muted }}>{o.detail.value}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {xray.length === 0 && !(detail.orders ?? []).some((o) => o.order_category === "lab") && <Empty />}
        </Panel>
        <Panel title={t("hosp.cpoe")}>
          {cpoe.length === 0 && cpoeTotal > 0 ? (
            /* orders exist but were truncated out of the capped payload */
            <p className="text-[10px] font-normal" style={{ color: gl.muted }}>
              {t("hosp.shownOf", { shown: 0, total: cpoeTotal })}
            </p>
          ) : cpoe.length === 0 ? <Empty /> : (
            <>
              <div className="overflow-y-auto rounded-lg scroll-thin" style={{ border: gl.borderSm, maxHeight: "240px" }}>
                <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                  <caption className="sr-only">{t("hosp.cpoe")}</caption>
                  <thead>
                    <tr style={{ background: `rgba(${gl.accentRgb},0.08)` }}>
                      <th scope="col" className="text-left font-bold px-2.5 py-1.5" style={{ color: gl.muted, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {t("hosp.orderName")}
                      </th>
                      <th scope="col" className="text-right font-bold px-2.5 py-1.5" style={{ color: gl.muted, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {t("hosp.qty")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpoe.map((o: OrderRow, i) => (
                      <tr key={i} style={i > 0 ? { borderTop: gl.borderSm } : undefined}>
                        <td className="px-2.5 py-1" style={{ color: gl.text }}>{o.order_name ?? "—"}</td>
                        <td className="px-2.5 py-1 text-right whitespace-nowrap" style={{ color: gl.text }}>
                          {o.detail?.quantity ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* the detail payload caps orders at 150 — say so, don't hide it */}
              {cpoeTotal > cpoe.length && (
                <p className="text-[10px] font-normal mt-1" style={{ color: gl.muted }}>
                  {t("hosp.shownOf", { shown: cpoe.length, total: cpoeTotal })}
                </p>
              )}
            </>
          )}
        </Panel>
        <Panel title={t("hosp.mgmt")}>
          {mgmt.length > 0 ? <Entries list={mgmt} /> : <Empty />}
        </Panel>
      </div>
    </div>
  );
}
