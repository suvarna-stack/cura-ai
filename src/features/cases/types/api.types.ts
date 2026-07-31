// ============================================================
// Frontend <-> Backend API contract types.
// The static JSON in /public/api implements this contract today;
// the future backend (NestJS / Spring Boot over PostgreSQL) must
// serve the exact same shapes from GET /api/cases and
// GET /api/cases/{id}.
// ============================================================

/** A code preview shown on case rows (feedback item 3). */
export interface ApiCodePreview {
  code: string;            // READ: MedHack_Diagnosis(ICD10).icd / Procedure(ICD9).icd
  system: "ICD-10" | "ICD-9";
  role: string;            // principal_diagnosis / secondary_diagnosis / procedure / ...
  desc?: string | null;    // READ: icd_codes.description (meeting item 7 — code + meaning on the card)
}

/** One case row as shown in the Dashboard lists (READ from iMed + CREATE fields).
 *  Nullability follows medcode-api's contract (docs/types.ts CaseCard): fields
 *  with no real data source are null — useCases.rich() normalizes for display. */
export interface ApiCase {
  id: string;              // READ: iMed transactionnumber (visit number)
  patient: string | null;  // always null from the live server (no real name source)
  vn?: string;             // not sent by the live server — falls back to id
  /** READ: MedHack_Patient.admissionnumber. iMed only fills this for IPD
   *  admissions, so it is null on every OPD case the dashboard shows. */
  hn: string | null;
  dept: string;            // READ: MedHack_BedManagement.department / ward
  ward: string | null;     // READ: MedHack_BedManagement.ward
  group: string;           // CREATE: disease_group (F04)
  confidence: number | null; // always null from the live server (no real AI confidence yet)
  severity: string | null; // CREATE: severity_level (F06)
  coverage: string | null; // READ: MedHack_Patient.healthcoverage (raw code, e.g. OFC_O4)
  coverageLabel?: string | null; // REF: coverage_types label (falls back to scheme family until hospital list arrives)
  /** REF: coverage_types.scheme_family — OFC_O1/OFC_O4/OFC_E2 all collapse to
   *  "OFC". The hospital reads coverage per scheme, so this (not `coverage`)
   *  is what the UI displays and filters on. */
  coverageFamily?: string | null;
  encountertype: string | null;
  ccpi: string | null;     // READ: Chief Complaint / Present Illness snippet (item 3)
  cc: string;              // READ: Chief Complaint (MedHack_MedicalRecord CC section)
  pi: string;              // READ: Present Illness (MedHack_MedicalRecord PI section)
  codes: ApiCodePreview[]; // READ: existing iMed codes (item 3)
  orders: Record<string, number>; // READ: order-category counts (items 3, 5)
  /** READ: a few real order names per category (meeting item 7 — the treatment
   *  side of the card). Capped server-side; `orders` still holds the totals. */
  orderNames?: Record<string, string[]>;
  missing?: string;        // CREATE: only on incomplete cases (F03)
  created_at: string | null; // READ: raw hospital datetime text; null on OPD rows today
  updated_at: string | null; // READ: same caveat
  revenue_impact: "high" | "medium" | "low" | null; // always null from the live server (no real DRG revenue)
  /** CREATE: every coder who worked this case, from coding_history — a case is
   *  not limited to one responsible coder. Most recent toucher LAST, so
   *  `coders.at(-1)` is the responsible coder. Empty on untouched cases. */
  coders?: string[];
  /** CREATE: the case's last approve/reopen action in coding_history is
   *  'reopened' — it belongs in the Dashboard's Reopen tab, not the queues.
   *  Live server only; absent in the static baseline export (= false). */
  reopened?: boolean;
}

export interface ApiIncompleteGroup {
  id: string;
  label: string;
  total: number;
  cases: ApiCase[];
}

export interface ApiFinishedCase {
  id: string;
  patient: string | null;  // always null from the live server
  vn?: string;             // not sent by the live server — falls back to id
  hn: string | null;
  codedDate: string;
  /** Responsible coder = the LATEST person to touch the case (= coders.at(-1)),
   *  which is not necessarily whoever approved it first. */
  coder: string;           // display name (e.g. "Sarah K.")
  coders?: string[];       // everyone who worked it, most recent last
  /** Raw workflow id behind `coder` ("demo.coder" = run_demo baseline,
   *  "web.coder" = approved through this UI). The Settings demo tools use it
   *  to tell baseline approvals from web ones. Absent on older payloads,
   *  where `coder` still holds the raw id. */
  coderId?: string;
  drg: string;
  reopenable: boolean;     // DEPRECATED: always true — any coder may reopen any case; kept so old payloads/frontends still parse, the UI no longer reads it
  created_at: string | null; // READ: raw hospital datetime text; null on OPD rows today
  updated_at: string | null; // READ: same caveat
  // facet fields (same sources as ApiCase) so the sidebar filters work on Finished too
  dept: string;
  ward: string | null;
  group: string;
  severity: string | null;
  coverage: string | null;
  coverageLabel?: string | null;
  coverageFamily?: string | null;
  encountertype: string | null;
  orders: Record<string, number>;
  codes: ApiCodePreview[];
  revenue_impact: "high" | "medium" | "low" | null; // always null from the live server
}

/** One row of the server-side audit trail (medcodeai `coding_history`).
 *  Shows what OTHER coders did — the frontend's own activity log is local
 *  to a single browser. */
export interface ApiCaseHistoryEntry {
  action: string;          // approved_single / approved_group / approved_all / reopened / code_assigned
  coder: string;           // display name
  at: string;              // "YYYY-MM-DD HH:MM:SS"
  detail?: Record<string, unknown>;
}

export interface ApiCasesResponse {
  stats: { total: number; complete: number; incomplete: number; reopened?: number; finished: number };
  complete: ApiCase[];
  incompleteGroups: ApiIncompleteGroup[];
  /** since 2026-07-24 the server sends reopened-awaiting-re-approval cases as
   *  their own exclusive list (they no longer ride inside complete/incomplete
   *  with just a flag). Optional so the mock seed payload stays valid. Each
   *  row carries reopened: true (+ reopenedAt/By); incomplete-origin rows
   *  keep `missing`. */
  reopened?: ApiCase[];
  finished: ApiFinishedCase[];
}

/** One editable code row as the UI stores it (same shape as caseLocal's
 *  StoredCode). PUT /api/cases/{id}/codes sends an array of these; the live
 *  server echoes them back inside the detail as `codeEdits`. */
export interface ApiStoredCode {
  code: string;
  type: string;
  desc: string;
  confidence: number;
  missing?: boolean;     // unresolved "???" placeholder row
  missingMsg?: string;
  /** internal coder note — round-trips verbatim, never reaches the hospital */
  note?: string;
}

/** GET /api/cases/{id} — full case detail. */
export interface ApiCaseDetail {
  case: Record<string, string | null>;
  coverage: Record<string, string | null> | null; // REF: full coverage_types row (doc B4)
  sections: { documenttype: string; fieldname: string; value: string | null; recorddatetime: string | null }[];
  codes: { code: string; code_system: string; description: string | null; code_role: string; source: string;
           /** procedure time window — ICD-9 rows only, null on ICD-10 */
           operation_start: string | null; operation_end: string | null;
           /** the hospital's operation type, extract vocabulary verbatim
            *  ("OR Procedure" / "NON OR Procedure" / "OTH" / …) — ICD-9 rows
            *  only, null on ICD-10 */
           operation_type: string | null }[];
  orders: {
    order_category: string;
    imed_source: string;
    order_name: string | null;
    ordered_at: string | null;
    /** the exact iMed source row — dosage, quantity, result value, unit,
     *  procedure times… Keys differ per imed_source, so the UI renders
     *  whatever is present. Null when sync stored no source row. The array
     *  is capped at 50 rows per category; see orderCounts for true totals. */
    detail?: Record<string, string | null> | null;
  }[];
  /** true per-category order totals, even when `orders` is truncated */
  orderCounts?: Record<string, number>;
  /** Hospital vital-sign readings (the strip above CC/PI/PE in the original
   *  coder UI), chronological. Every value is raw hospital text or null.
   *  Optional so the static JSON export stays valid. */
  vitals?: { measured_at: string | null; temperature: string | null;
             systolic: string | null; diastolic: string | null;
             heart_rate: string | null; oxygen_saturation: string | null;
             weight: string | null; height: string | null }[];
  history?: ApiCaseHistoryEntry[];
  // Present only when served by the live server (server/app.py), which echoes
  // the coder's saved working state; absent in the static JSON export.
  codeEdits?: ApiStoredCode[] | null;
  reportDraft?: string | null;
}
