// ============================================================
// caseReportDocument — the printable / exportable Coding Summary
// for an approved case (the Print and Export PDF buttons on
// FinishedCaseDetailPage).
//
// WHY A STANDALONE HTML STRING, not a React print stylesheet:
// the screen page is a dark-glass three-column dashboard built to
// be scrolled, and a medical record is a paginated black-on-white
// A4 form. Trying to make one CSS file be both ends in a stylesheet
// nobody dares touch. This builds the document from the SAME data
// the page already fetched, and printDocument.ts hands it to the
// browser's print engine.
//
// The browser's print engine (rather than a client-side PDF
// library) is also what makes Thai render correctly — Thai
// combining vowels and tone marks need real OpenType shaping,
// which jsPDF-style canvas writers do not do.
//
// LAYOUT follows the structure a discharge/coding abstract is
// expected to carry — HL7 C-CDA Discharge Summary header
// (identifiers, encounter, author, authenticator) plus the coded
// content in ICD order: principal diagnosis first, then
// comorbidities, other diagnoses, external cause, then procedures
// (ICD-10-TM Standard Coding Guidelines Vol. 5; see
// medcode-api/docs/medical-glossary.md §5). Every page carries the
// patient identifiers, which is why the whole body sits in a table
// with a repeating <thead>.
//
// TWO PROJECT RULES BIND THIS FILE:
//  - Never synthesize per-case data. A field the hospital did not
//    send prints "—", never a plausible-looking value. The patient
//    NAME is null on every live row, so it prints "—" too.
//  - Disease group / severity / completeness / confidence / DRG are
//    [POC] rules of ours, not clinical findings (glossary §11), so
//    they are confined to the "system metadata" block and labelled
//    as non-clinical.
// ============================================================
import type { FinishedCase } from "../types/case.types";
import type { ApiCaseDetail } from "../types/api.types";
import type { StoredCode } from "./caseLocal";
import { assignRoles, isApproved, DIAGNOSIS_ROLE_ORDER, ROLE_LABEL } from "./codeRole";
import type { CodeRole, RoledCode } from "./codeRole";
import { originOf } from "./codeOrigin";
import { FIELD_LABEL, TITLE_KEYS, byPanel } from "./orderFields";

export interface CaseReportInput {
  caseData: FinishedCase;
  detail: ApiCaseDetail | null;
  /** the case's full code list in saved order (missing rows included) */
  codes: StoredCode[];
  /** display name of the account that pressed Print / Export */
  generatedBy: string;
}

// ------------------------------------------------------------
// primitives
// ------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** Every value below reaches the document through this. */
function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

const EMDASH = "—";

/** Escaped value, or an em dash when the hospital sent nothing. */
function val(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? EMDASH : esc(s);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Hospital datetime text ("2026-04-02 23:55:00") → "02/04/2026 23:55".
 *  Anything that is not that shape prints verbatim — the extract is raw
 *  hospital text and reformatting what we cannot parse would be a guess. */
function hospitalDateTime(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return EMDASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return esc(s);
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  return esc(m[4] ? `${date} ${m[4]}:${m[5]}` : date);
}

/** cases.ageyear is "years,months,days" ("65,2,13"), not a number (glossary §3). */
function ageAtVisit(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return EMDASH;
  const [y, mo, d] = s.split(",").map((p) => p.trim());
  if (!y) return esc(s);
  const parts = [`${y} y`];
  if (mo) parts.push(`${mo} m`);
  if (d) parts.push(`${d} d`);
  return esc(parts.join(" "));
}

function timestamp(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** The origin marker, as a printed provenance word. */
const SOURCE_LABEL: Record<string, string> = {
  manual:   "Coder",
  hospital: "iMed (hospital)",
  ai:       "AI, coder-approved",
  gap:      EMDASH,
};

/** codeTypeFromRole appends " · principal diagnosis" to descriptions built
 *  from the iMed feed; the Role column already says that, so drop the echo. */
function cleanDesc(desc: string, role: CodeRole): string {
  const words = role.replace(/_/g, " ");
  const suffix = ` · ${words}`;
  return desc.endsWith(suffix) ? desc.slice(0, -suffix.length) : desc;
}

// ------------------------------------------------------------
// document chrome
// ------------------------------------------------------------

/** One numbered section. `body` is already-escaped HTML. */
interface Section { en: string; th: string; body: string }

function renderSections(sections: Section[]): string {
  return sections.map((s, i) => `
    <section class="sec">
      <h2 class="sec-h"><span class="sec-n">${i + 1}</span>
        <span class="sec-t">${esc(s.en)}</span>
        <span class="sec-th">${esc(s.th)}</span>
      </h2>
      ${s.body}
    </section>`).join("");
}

const STYLES = `
  @page { size: A4 portrait; margin: 13mm 12mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans Thai",
                 "Leelawadee UI", Tahoma, sans-serif;
    font-size: 9.6pt; line-height: 1.42; color: #10161c;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* Rules and fills are the only colour: a record has to photocopy and
     fax legibly, so nothing carries meaning by hue alone. */
  .doc { width: 100%; border-collapse: collapse; }
  .doc > thead > tr > td, .doc > tbody > tr > td, .doc > tfoot > tr > td { padding: 0; }

  /* repeating page furniture — every page of a patient record must be
     identifiable on its own (why the body lives in a table) */
  .runhead {
    display: flex; justify-content: space-between; align-items: baseline; gap: 10mm;
    border-bottom: 0.5pt solid #9aa8b5; padding-bottom: 1.5mm; margin-bottom: 3mm;
    font-size: 7.6pt; letter-spacing: 0.03em; color: #4a5763;
  }
  .runhead b { color: #14324a; letter-spacing: 0.06em; }
  .runfoot {
    border-top: 0.5pt solid #9aa8b5; margin-top: 3mm; padding-top: 1.5mm;
    font-size: 7.2pt; color: #61707c; display: flex;
    justify-content: space-between; gap: 8mm;
  }
  .conf { font-weight: 700; color: #14324a; }

  /* letterhead */
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          gap: 10mm; border-bottom: 2pt solid #14324a; padding-bottom: 3mm; margin-bottom: 2mm; }
  .brand { font-size: 15pt; font-weight: 700; letter-spacing: 0.02em; color: #14324a; }
  .brand-sub { font-size: 8pt; color: #4a5763; margin-top: 0.5mm; }
  .head-r { text-align: right; }
  .doctitle { font-size: 12pt; font-weight: 700; letter-spacing: 0.05em;
              text-transform: uppercase; color: #10161c; }
  .doctitle-th { font-size: 9pt; color: #4a5763; }
  .docmeta { font-size: 7.6pt; color: #61707c; margin-top: 1.5mm; line-height: 1.5; }
  .stamp {
    display: inline-block; margin-top: 2mm; padding: 1mm 3mm;
    border: 1pt solid #14324a; border-radius: 1mm; font-size: 8pt;
    font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #14324a;
  }

  /* sections */
  .sec { margin-top: 5mm; break-inside: auto; }
  .sec-h {
    display: flex; align-items: baseline; gap: 2.5mm; margin: 0 0 2mm;
    font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em;
    color: #14324a; border-bottom: 1pt solid #14324a; padding-bottom: 1mm;
    break-after: avoid;
  }
  .sec-n {
    display: inline-block; min-width: 5.5mm; text-align: center;
    background: #14324a; color: #fff; border-radius: 0.8mm;
    font-size: 8pt; padding: 0.3mm 1mm; letter-spacing: 0;
  }
  .sec-th { font-weight: 400; text-transform: none; letter-spacing: 0; color: #4a5763; font-size: 8.4pt; }
  .sub-h { font-size: 8.4pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
           color: #2c4a63; margin: 3mm 0 1.5mm; break-after: avoid; }

  /* tables */
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td {
    border: 0.5pt solid #9aa8b5; padding: 1.1mm 1.8mm; text-align: left;
    vertical-align: top; font-size: 9pt;
  }
  table.grid thead th {
    background: #e8edf2; font-size: 7.8pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em; color: #2c4a63;
  }
  table.grid tbody tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .num { text-align: center; width: 8mm; color: #4a5763; }
  .code { font-family: "SFMono-Regular", Menlo, Consolas, monospace;
          font-size: 8.8pt; font-weight: 700; white-space: nowrap; }
  .role { white-space: nowrap; }
  .role-th { display: block; font-size: 7.6pt; color: #61707c; }
  .nowrap { white-space: nowrap; }
  .muted { color: #61707c; }

  /* identification block — a form, so labels sit in their own ruled column */
  table.ident { width: 100%; border-collapse: collapse; }
  table.ident th, table.ident td {
    border: 0.5pt solid #9aa8b5; padding: 1.1mm 1.8mm; vertical-align: top; font-size: 9pt;
  }
  table.ident th {
    background: #f2f5f8; width: 32mm; text-align: left; font-weight: 700;
    font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.03em; color: #2c4a63;
    line-height: 1.3;
  }
  table.ident th em { display: block; font-style: normal; font-weight: 400;
                      text-transform: none; letter-spacing: 0; color: #61707c;
                      font-size: 7.8pt; }
  /* the two value columns share what the labels leave, evenly */
  table.ident td { width: 30%; }
  /* the metadata block is single-pair rows, so that split does not apply */
  table.meta td { width: auto; }

  /* clinical narrative */
  .doc-group { margin-bottom: 3mm; }
  .doc-type { font-size: 8pt; font-weight: 700; letter-spacing: 0.06em;
              text-transform: uppercase; color: #2c4a63;
              background: #f2f5f8; border-left: 1.5pt solid #14324a;
              padding: 1mm 2mm; margin-bottom: 1.5mm; }
  .field { margin: 0 0 2mm 2mm; break-inside: avoid; }
  .field-n { font-size: 8.2pt; font-weight: 700; color: #14324a; }
  .field-when { font-size: 7.6pt; font-weight: 400; color: #61707c; }
  .field-v { white-space: pre-wrap; margin: 0.5mm 0 0; }

  /* attestation */
  .attest { border: 0.5pt solid #9aa8b5; padding: 2.5mm 3mm; break-inside: avoid; }
  .attest p { margin: 0 0 2mm; font-size: 8.6pt; }
  .sigs { display: flex; gap: 8mm; margin-top: 6mm; }
  .sig { flex: 1; border-top: 0.5pt solid #10161c; padding-top: 1mm;
         font-size: 7.8pt; color: #4a5763; }
  .sig b { display: block; font-size: 8.4pt; color: #10161c; }
  .note { font-size: 7.6pt; color: #61707c; margin-top: 1.5mm; }
  .warn { border-left: 1.5pt solid #14324a; background: #f2f5f8;
          padding: 1.5mm 2.5mm; font-size: 8.2pt; margin-top: 2mm; }

  /* screen preview: a sheet of paper on a desk, so Export shows what prints */
  @media screen {
    body { background: #525659; padding: 0 0 40px; }
    .toolbar {
      position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
      justify-content: center; gap: 10px; flex-wrap: wrap;
      background: #2f3336; color: #e7ebee; padding: 10px 16px;
      font-size: 12px; box-shadow: 0 1px 6px rgba(0,0,0,0.4);
    }
    .toolbar button {
      font: inherit; font-weight: 600; cursor: pointer; border-radius: 6px;
      padding: 6px 14px; border: 1px solid #5c646b; background: #3d4247; color: #e7ebee;
    }
    .toolbar button.primary { background: #14324a; border-color: #1f4d70; color: #fff; }
    .toolbar span { color: #aab3ba; }
    .sheet {
      width: 210mm; min-height: 297mm; margin: 24px auto 0; padding: 13mm 12mm 12mm;
      background: #fff; box-shadow: 0 3px 18px rgba(0,0,0,0.45);
    }
  }
  @media print {
    .toolbar { display: none !important; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  }
`;

// ------------------------------------------------------------
// sections
// ------------------------------------------------------------

/** §1 — the C-CDA-style header: who, which visit, when, under whose cover. */
function identification(input: CaseReportInput): string {
  const { caseData: c, detail } = input;
  const dc = detail?.case ?? {};
  const cov = detail?.coverage;
  const isIpd = dc.encountertype === "1";

  const coverage = (() => {
    const family = cov?.scheme_family ?? dc.coverage_type;
    if (!family) return EMDASH;
    const label = cov?.label_th ?? cov?.label_en;
    const raw = dc.coverage_type;
    const bits = [esc(label ?? family)];
    if (raw && raw !== label && raw !== family) bits.push(`<span class="muted">(${esc(raw)})</span>`);
    return bits.join(" ");
  })();

  const row = (a: [string, string, string], b: [string, string, string]) => `
    <tr>
      <th>${esc(a[0])}<em>${esc(a[1])}</em></th><td>${a[2]}</td>
      <th>${esc(b[0])}<em>${esc(b[1])}</em></th><td>${b[2]}</td>
    </tr>`;

  return `
    <table class="ident">
      <tbody>
        ${row(["HN — hospital no.", "เลขประจำตัวผู้ป่วย", val(dc.patient_ref ?? c.hn)],
              ["VN — visit no.", "เลขที่การรับบริการ", val(dc.case_id ?? c.vn ?? c.id)])}
        ${row(["Patient name", "ชื่อผู้ป่วย", val(c.patient)],
              ["Sex", "เพศ", val(dc.sex)])}
        ${row(["Date of birth", "วันเกิด", hospitalDateTime(dc.birthdate)],
              ["Age at visit", "อายุ", ageAtVisit(dc.ageyear)])}
        ${row(["Encounter type", "ประเภทผู้ป่วย", isIpd ? "IPD (inpatient)" : "OPD (outpatient)"],
              ["Department", "แผนก", val(dc.department ?? c.dept)])}
        ${row(["Ward", "หอผู้ป่วย", val(dc.ward)],
              ["Attending physician", "แพทย์ผู้รักษา", val(dc.attending_physician)])}
        ${row(["Admission", "วันเวลารับเข้า", hospitalDateTime(dc.admissiondatetime)],
              ["Discharge", "วันเวลาจำหน่าย", hospitalDateTime(dc.dischargedatetime)])}
        ${row(["Discharge type", "ประเภทการจำหน่าย", val(dc.dischargetype)],
              ["Discharge status", "สภาพการจำหน่าย", val(dc.dischargestatus)])}
        ${row(["Coverage scheme", "สิทธิการรักษา", coverage],
              ["Payer", "ผู้รับผิดชอบค่าใช้จ่าย", val(cov?.payer)])}
      </tbody>
    </table>
    <p class="note">Fields shown as ${EMDASH} are not present in the hospital extract for this
      visit. iMed fills admission, discharge and ward for inpatient stays only, and the extract
      carries no patient-name or attending-physician column.</p>`;
}

/** §2 — diagnoses in ICD order, principal first. */
function diagnoses(roled: RoledCode[]): string {
  const diag = roled.filter((r) => r.role !== "procedure");
  if (diag.length === 0) {
    return `<p class="warn">No ICD-10 diagnosis is recorded on this case.</p>`;
  }
  const ordered = DIAGNOSIS_ROLE_ORDER.flatMap((role) => diag.filter((r) => r.role === role));
  // assignRoles can only ever hand out ONE principal (it mirrors the backend's
  // positional rule), so the case to warn about is zero — a code list that is
  // all comorbidities, which the guidelines do not allow.
  const hasPrincipal = diag.some((r) => r.role === "principal_diagnosis");

  const rows = ordered.map((r, i) => {
    const label = ROLE_LABEL[r.role];
    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="role"><b>${esc(label.en)}</b><span class="role-th">${esc(label.th)}</span></td>
        <td class="code">${val(r.entry.code)}</td>
        <td>${val(cleanDesc(r.entry.desc ?? "", r.role))}</td>
        <td class="nowrap muted">${esc(SOURCE_LABEL[originOf(r.entry)] ?? EMDASH)}</td>
      </tr>`;
  }).join("");

  const warning = hasPrincipal ? "" :
    `<p class="warn">No principal diagnosis is recorded on this case. The ICD-10-TM Standard
     Coding Guidelines (Volume 5) require exactly one.</p>`;

  return `
    <table class="grid">
      <thead><tr>
        <th class="num">#</th><th>Role / บทบาท</th><th>ICD-10</th>
        <th>Description</th><th>Source</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${warning}
    <p class="note">Principal diagnosis = the single final condition chiefly responsible for the
      visit, present before admission; comorbidities are further conditions that affected care
      (ICD-10-TM Standard Coding Guidelines, Volume 5).</p>`;
}

/** §3 — ICD-9-CM procedures with the hospital's own operation window and type. */
function procedures(roled: RoledCode[]): string {
  const procs = roled.filter((r) => r.role === "procedure");
  if (procs.length === 0) {
    return `<p class="muted">No procedure codes recorded for this visit.</p>`;
  }
  const rows = procs.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="code">${val(r.entry.code)}</td>
        <td>${val(cleanDesc(r.entry.desc ?? "", r.role))}</td>
        <td class="nowrap">${val(r.entry.operation_type)}</td>
        <td class="nowrap">${hospitalDateTime(r.entry.operation_start)}</td>
        <td class="nowrap">${hospitalDateTime(r.entry.operation_end)}</td>
        <td class="nowrap muted">${esc(SOURCE_LABEL[originOf(r.entry)] ?? EMDASH)}</td>
      </tr>`).join("");
  return `
    <table class="grid">
      <thead><tr>
        <th class="num">#</th><th>ICD-9-CM</th><th>Description</th>
        <th>Operation type</th><th>Start</th><th>End</th><th>Source</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">Listed in the priority order the coder set. The record does not distinguish
      the main procedure for the principal diagnosis from additional procedures.</p>`;
}

/** §x — suggestions the coder reviewed and deliberately left out. */
function notSelected(codes: StoredCode[]): string {
  const rows = codes.map((c) => `
      <tr>
        <td class="code">${val(c.code)}</td>
        <td>${val(c.desc)}</td>
        <td class="nowrap muted">${val(c.type)}</td>
        <td class="nowrap muted">${esc(SOURCE_LABEL[originOf(c)] ?? EMDASH)}</td>
      </tr>`).join("");
  return `
    <table class="grid">
      <thead><tr><th>Code</th><th>Description</th><th>Proposed as</th><th>Source</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">Reviewed by the coder and not included in the approved code set. Recorded here
      for audit; these codes were not sent to the hospital.</p>`;
}

/** §x — vital signs, the same columns the hospital's own coder UI shows. */
function vitals(detail: ApiCaseDetail): string {
  const rows = (detail.vitals ?? []).map((v) => {
    const bp = v.systolic || v.diastolic ? `${v.systolic ?? EMDASH}/${v.diastolic ?? EMDASH}` : null;
    return `
      <tr>
        <td class="nowrap">${hospitalDateTime(v.measured_at)}</td>
        <td>${val(v.temperature)}</td><td>${val(bp)}</td><td>${val(v.heart_rate)}</td>
        <td>${val(v.oxygen_saturation)}</td><td>${val(v.weight)}</td><td>${val(v.height)}</td>
      </tr>`;
  }).join("");
  return `
    <table class="grid">
      <thead><tr>
        <th>Time</th><th>BT (°C)</th><th>BP (mmHg)</th><th>PR (/min)</th>
        <th>O₂ sat (%)</th><th>Weight (kg)</th><th>Height (cm)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** §x — the doctor's own writing, grouped by document then field, verbatim. */
function clinicalRecord(detail: ApiCaseDetail): string {
  const groups: { type: string; rows: ApiCaseDetail["sections"] }[] = [];
  for (const s of detail.sections) {
    const type = s.documenttype || "Record";
    const last = groups[groups.length - 1];
    if (last && last.type === type) last.rows.push(s);
    else groups.push({ type, rows: [s] });
  }
  return groups.map((g) => `
      <div class="doc-group">
        <div class="doc-type">${esc(g.type)}</div>
        ${g.rows.map((s) => `
          <div class="field">
            <div class="field-n">${esc(s.fieldname)}
              ${s.recorddatetime ? `<span class="field-when">· ${hospitalDateTime(s.recorddatetime)}</span>` : ""}
            </div>
            <p class="field-v">${val(s.value)}</p>
          </div>`).join("")}
      </div>`).join("");
}

/** §x — labs the way a coder reads them: grouped by panel, value + unit. */
function laboratory(detail: ApiCaseDetail): string {
  const labs = detail.orders.filter((o) => o.order_category === "lab");
  const panels = [...byPanel(labs).entries()].map(([panel, rows]) => {
    const when = rows[0].detail?.reported_at ?? rows[0].detail?.reportdatetime;
    const items = rows.map((r) => {
      const name = r.detail?.item_name || r.detail?.itemname || r.order_name;
      const value = r.detail?.value ?? r.detail?.itemvalue;
      const unit = r.detail?.unit ?? r.detail?.itemuom;
      return `<tr><td>${val(name)}</td><td class="nowrap">${val(value)}</td>
              <td class="nowrap muted">${val(unit)}</td></tr>`;
    }).join("");
    return `
      <div class="doc-group">
        <div class="sub-h">${esc(panel)}${when ? ` <span class="muted">· ${hospitalDateTime(when)}</span>` : ""}</div>
        <table class="grid">
          <thead><tr><th>Test</th><th>Result</th><th>Unit</th></tr></thead>
          <tbody>${items}</tbody>
        </table>
      </div>`;
  }).join("");
  const total = detail.orderCounts?.lab ?? labs.length;
  const capped = total > labs.length
    ? `<p class="note">Showing ${labs.length} of ${total} laboratory rows — the case payload caps
       them per category.</p>`
    : "";
  return `${panels}${capped}
    <p class="note">Values are the hospital's own, with no reference ranges in the feed, so nothing
      is flagged abnormal here. A laboratory value is not by itself a diagnosis
      (ICD-10-TM Standard Coding Guidelines, Volume 5).</p>`;
}

const ORDER_CATEGORIES: [string, string][] = [
  ["medicine", "Medication orders / คำสั่งใช้ยา"],
  ["X-ray", "Imaging — X-ray / CT / ultrasound"],
  ["surgery", "Operative and procedural orders"],
  ["other", "Other orders and recorded items"],
];

/** §x — everything ordered or given, each row with the raw iMed fields. */
function orders(detail: ApiCaseDetail): string {
  const rows = detail.orders.filter((o) => o.order_category !== "lab");
  return ORDER_CATEGORIES.map(([key, label]) => {
    const list = rows.filter((o) => o.order_category === key);
    if (list.length === 0) return "";
    const total = detail.orderCounts?.[key] ?? list.length;
    const body = list.map((o) => {
      const d = o.detail ?? {};
      const title = TITLE_KEYS.map((k) => d[k]).find(Boolean) ?? o.order_name;
      const fields = Object.entries(d)
        .filter(([k, v]) => !TITLE_KEYS.includes(k) && v !== null && String(v).trim() !== "")
        .map(([k, v]) => `<b>${esc(FIELD_LABEL[k] ?? k)}</b> ${esc(v)}`)
        .join(" · ");
      return `<tr><td>${val(title)}</td><td class="nowrap">${hospitalDateTime(o.ordered_at)}</td>
              <td class="muted">${fields || EMDASH}</td></tr>`;
    }).join("");
    const capped = total > list.length
      ? `<p class="note">Showing ${list.length} of ${total} — the case payload caps orders per category.</p>`
      : "";
    return `
      <div class="doc-group">
        <div class="sub-h">${esc(label)} <span class="muted">(${total})</span></div>
        <table class="grid">
          <thead><tr><th>Item</th><th>Ordered</th><th>Detail as recorded by iMed</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        ${capped}
      </div>`;
  }).join("");
}

/** §x — the server-side coding history: who did what to this case, when. */
function auditTrail(detail: ApiCaseDetail): string {
  const rows = (detail.history ?? []).map((h) => `
      <tr>
        <td class="nowrap">${hospitalDateTime(h.at)}</td>
        <td>${esc((h.action ?? "").replace(/_/g, " "))}</td>
        <td>${val(h.coder)}</td>
      </tr>`).join("");
  return `
    <table class="grid">
      <thead><tr><th>When</th><th>Action</th><th>Coder</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** §x — signature block. A coding abstract is only evidence once it is signed. */
function attestation(input: CaseReportInput, approvedCount: number): string {
  const { caseData: c } = input;
  const coders = c.coders?.length ? c.coders : [c.coder];
  // Mirrors what approve actually did: with nothing ticked, ApprovalService
  // re-confirms the diagnosis already imported from iMed instead of writing a
  // new code set (simulateCoderAssignment) — so "0 codes were transmitted"
  // would be the wrong claim to put over a signature.
  const statement = approvedCount === 0
    ? `<p>No coder-selected code was recorded for this case when it was approved in Cura AI on
        <b>${val(c.codedDate)}</b>. The diagnosis already held by the hospital was re-confirmed as
        the final code set; no new code was transmitted.</p>`
    : `<p>The ${approvedCount} code${approvedCount === 1 ? "" : "s"} listed above ${
        approvedCount === 1 ? "was" : "were"} reviewed and approved in Cura AI on
        <b>${val(c.codedDate)}</b> and transmitted to the hospital information system (iMed) as
        the final code set for this visit.</p>`;

  return `
    <div class="attest">
      ${statement}
      <p class="muted">Coder(s) of record: <b>${val(coders.join(" → "))}</b>${
        coders.length > 1 ? " (most recent last — the last name is the responsible coder)" : ""}</p>
      <div class="sigs">
        <div class="sig"><b>Coder / ผู้ให้รหัส</b>Signature &amp; date</div>
        <div class="sig"><b>Reviewed by / ผู้ตรวจสอบ</b>Signature &amp; date</div>
        <div class="sig"><b>Attending physician / แพทย์ผู้รักษา</b>Signature &amp; date</div>
      </div>
    </div>`;
}

/** §x — our own workflow labels, fenced off from the clinical content. */
function systemMetadata(input: CaseReportInput): string {
  const { caseData: c, detail } = input;
  const dc = detail?.case ?? {};
  const cell = (label: string, v: string) =>
    `<tr><th>${esc(label)}</th><td>${v}</td></tr>`;
  return `
    <table class="ident meta">
      <tbody>
        ${cell("Case status", val(dc.case_status))}
        ${cell("Completeness at sync", val(dc.completeness_status) +
          (dc.missing_detail ? ` <span class="muted">(missing: ${esc(dc.missing_detail)})</span>` : ""))}
        ${cell("Disease group", val(dc.disease_group ?? c.group))}
        ${cell("Severity label", val(dc.severity_level ?? c.severity))}
        ${cell("DRG", val(c.drg))}
        ${cell("Record fetched", hospitalDateTime(dc.fetched_at))}
      </tbody>
    </table>
    <p class="note"><b>Not clinical findings.</b> Disease group is the first letter of the principal
      ICD-10 code mapped to a label, severity is a count of secondary diagnoses, and completeness
      records whether the visit arrived from the hospital already coded. None of them is a DRG, a
      complexity level, or a statement about how ill the patient is. No DRG source exists on our
      side, so DRG prints as ${EMDASH}.</p>`;
}

// ------------------------------------------------------------
// assembly
// ------------------------------------------------------------

/** Filename stem for the exported PDF — also the preview window's title, which
 *  is what the browser offers as the default "Save as PDF" name. */
export function caseReportFilename(caseData: FinishedCase, now = new Date()): string {
  const vn = (caseData.vn ?? caseData.id).replace(/[^\w-]+/g, "");
  const day = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return `Cura-Coding-Summary-VN${vn}-${day}`;
}

export interface BuildOptions {
  /** "preview" adds the screen-only toolbar the Export window shows; the
   *  hidden print frame uses "print" and renders none. */
  mode?: "print" | "preview";
  now?: Date;
}

/**
 * The whole Coding Summary as one self-contained HTML document.
 * Nothing is fetched: it is built from the data the detail page already holds,
 * so it prints identically offline.
 */
export function buildCaseReportDocument(
  input: CaseReportInput, options: BuildOptions = {},
): string {
  const { mode = "print", now = new Date() } = options;
  const { caseData: c, detail, codes, generatedBy } = input;

  // Split exactly the way ApprovalService did at approve time, so the printed
  // "final code set" is the set the hospital actually received.
  const approved = codes.filter(isApproved);
  const excluded = codes.filter((k) => !k.missing && !isApproved(k));
  const roled = assignRoles(approved);

  const vn = c.vn ?? c.id;
  const hn = detail?.case?.patient_ref ?? c.hn;
  const generatedAt = timestamp(now);
  const docId = `MCS-${String(vn).replace(/[^\w-]+/g, "")}-` +
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

  const sections: Section[] = [
    { en: "Patient & Encounter Identification", th: "ข้อมูลผู้ป่วยและการรับบริการ",
      body: identification(input) },
    { en: "Final Coded Diagnoses (ICD-10)", th: "การวินิจฉัยที่ให้รหัสแล้ว",
      body: diagnoses(roled) },
    { en: "Procedures (ICD-9-CM)", th: "หัตถการ",
      body: procedures(roled) },
  ];
  if (excluded.length > 0) {
    sections.push({ en: "Codes Reviewed but Not Selected", th: "รหัสที่ตรวจสอบแล้วไม่ได้เลือก",
      body: notSelected(excluded) });
  }
  if (detail) {
    if ((detail.vitals ?? []).length > 0) {
      sections.push({ en: "Vital Signs", th: "สัญญาณชีพ", body: vitals(detail) });
    }
    if (detail.sections.length > 0) {
      sections.push({ en: "Clinical Record", th: "บันทึกเวชระเบียน", body: clinicalRecord(detail) });
    }
    if (detail.orders.some((o) => o.order_category === "lab")) {
      sections.push({ en: "Laboratory Results", th: "ผลตรวจทางห้องปฏิบัติการ",
        body: laboratory(detail) });
    }
    if (detail.orders.some((o) => o.order_category !== "lab")) {
      sections.push({ en: "Orders & Treatments", th: "คำสั่งการรักษา", body: orders(detail) });
    }
    if ((detail.history ?? []).length > 0) {
      sections.push({ en: "Coding Audit Trail", th: "ประวัติการให้รหัส", body: auditTrail(detail) });
    }
  }
  sections.push({ en: "Attestation", th: "การรับรอง",
    body: attestation(input, approved.length) });
  sections.push({ en: "System Metadata (non-clinical)", th: "ข้อมูลระบบ (ไม่ใช่ข้อมูลทางคลินิก)",
    body: systemMetadata(input) });

  const toolbar = mode === "preview" ? `
    <div class="toolbar">
      <button class="primary" onclick="window.print()">Save as PDF / Print</button>
      <button onclick="window.close()">Close</button>
      <span>In the print dialog choose <b>Save as PDF</b> as the destination.</span>
    </div>` : "";

  const letterhead = `
    <div class="head">
      <div>
        <div class="brand">Cura AI</div>
        <div class="brand-sub">Medical Coding Audit System · ระบบตรวจสอบการให้รหัสทางการแพทย์</div>
        <div class="stamp">Approved · Final</div>
      </div>
      <div class="head-r">
        <div class="doctitle">Medical Coding Summary</div>
        <div class="doctitle-th">สรุปการให้รหัสทางการแพทย์</div>
        <div class="docmeta">
          Document ${esc(docId)}<br>
          Generated ${esc(generatedAt)} by ${val(generatedBy)}<br>
          Approved ${val(c.codedDate)}
        </div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(caseReportFilename(c, now))}</title>
<style>${STYLES}</style>
</head>
<body>
${toolbar}
<div class="sheet">
<table class="doc">
  <thead><tr><td>
    <div class="runhead">
      <span><b>MEDCODE AI</b> · Medical Coding Summary</span>
      <span>VN ${val(vn)} · HN ${val(hn)} · <span class="conf">Confidential — patient health information</span></span>
    </div>
  </td></tr></thead>
  <tfoot><tr><td>
    <div class="runfoot">
      <span>${esc(docId)} · generated ${esc(generatedAt)} by ${val(generatedBy)}</span>
      <span>Generated from the synced hospital record — verify against iMed before use.</span>
    </div>
  </td></tr></tfoot>
  <tbody><tr><td>
    ${letterhead}
    ${renderSections(sections)}
  </td></tr></tbody>
</table>
</div>
</body>
</html>`;
}
