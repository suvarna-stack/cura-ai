/**
 * medcode-api — TypeScript contract (mirror of api-contract.md).
 *
 * THE BACKEND OWNS THIS CONTRACT. The next frontend copies/imports this file;
 * any backend response-shape change updates api-contract.md + this file +
 * CasesApiIntegrationTest in the same commit.
 *
 * Conventions:
 *  - No key is ever absent unless marked optional (`?:`) — everything else is
 *    always present, possibly null.
 *  - Hospital-sourced datetimes are RAW text (formats vary, may be malformed;
 *    treat as opaque display strings). Backend-written datetimes are
 *    "YYYY-MM-DD HH:MM:SS" ("YYYY-MM-DD" where noted).
 */

// ---------- GET /api/cases ----------

export interface CasesPayload {
  stats: { total: number; complete: number; incomplete: number; finished: number };
  /** complete, not yet approved */
  complete: CaseCard[];
  /** sorted by size desc, then label */
  incompleteGroups: IncompleteGroup[];
  /** approved queue (exclusive — a case is here OR in the other buckets) */
  finished: FinishedCard[];
}

export interface IncompleteGroup {
  id: "surgery" | "ct-x-ray" | "medicine" | "other";
  label: string; // "<Group> Group"
  total: number;
  cases: CaseCard[]; // each additionally carries `missing`
}

export interface CodeChip {
  code: string;
  system: "ICD-10" | "ICD-9";
  role: "principal_diagnosis" | "secondary_diagnosis" | "procedure" | "other" | "external_cause";
}

export interface CaseCard {
  /** the real iMed transaction (visit) number */
  id: string;
  /** always null — no real patient-name source exists */
  patient: null;
  /** cases.patient_ref; OPD extracts don't carry it → null on dashboard rows today */
  hn: string | null;
  /** department, else ward, else "—" */
  dept: string;
  ward: string | null;
  /** disease group, else "Ungrouped" */
  group: string;
  /** always null — no real AI-confidence source exists yet */
  confidence: null;
  severity: "low" | "medium" | "high";
  /** hospital's own coverage code (e.g. "UCS_89_I") */
  coverage: string | null;
  /** label_th → label_en → scheme_family (labels null until hospital provides the list) */
  coverageLabel: string | null;
  coverageFamily: string | null;
  /** real actor ids from the audit trail, first-touch order */
  coders: string[];
  /** dashboard is OPD-only */
  encountertype: "0";
  /** 120-char snippet: Chief Complaint → Subjective → Present Illness */
  ccpi: string | null;
  cc: string;
  pi: string;
  /** first 6 code chips, principal → secondary → procedure → other */
  codes: CodeChip[];
  /** {category: count}; key order CT, ROIP, X-ray, lab, medicine, other, surgery */
  orders: Partial<Record<OrderCategory, number>>;
  /** cases.admissiondatetime (raw hospital text); null on OPD rows today */
  created_at: string | null;
  /** cases.dischargedatetime — same caveat */
  updated_at: string | null;
  /** always null — no real DRG/revenue source exists */
  revenue_impact: null;
  /** only on reopened, not-yet-reapproved cases (human reopen) */
  reopened?: true;
  /** "YYYY-MM-DD", only alongside reopened */
  reopenedAt?: string;
  /** real actor id, only alongside reopened */
  reopenedBy?: string;
  /** INCOMPLETE rows only: human-readable missing labels joined ", ", else "—" */
  missing?: string;
}

/** CaseCard minus confidence/ccpi/cc/pi, plus finalization info. */
export interface FinishedCard extends Omit<CaseCard, "confidence" | "ccpi" | "cc" | "pi"> {
  /** approval date "YYYY-MM-DD" from the audit trail, else fetched_at[:10] */
  codedDate: string;
  /** real approving actor id (e.g. "demo.coder"), "" if unknown */
  coder: string;
  /** same, "—" if unknown */
  coderId: string;
  /** static placeholder — no DRG source exists */
  drg: "—";
  /** DEPRECATED constant: any coder may reopen any case */
  reopenable: true;
}

export type OrderCategory = "CT" | "ROIP" | "X-ray" | "lab" | "medicine" | "other" | "surgery";

// ---------- GET /api/cases/{caseId} ----------

export interface CaseDetail {
  /** the full cases row; hospital-sourced values are raw text or null */
  case: CaseRow;
  coverage: CoverageRow | null;
  /** sorted by recorddatetime (nulls first, stable) */
  sections: SectionRow[];
  codes: DetailCodeRow[];
  /** max 150, grouped by category */
  orders: DetailOrderRow[];
  /** last PUT …/codes payload, echoed verbatim; null when never saved */
  codeEdits: CodeEdit[] | null;
  /** last PUT …/draft text (feature deprecated); null when never saved */
  reportDraft: string | null;
}

export interface CaseRow {
  case_id: string;
  patient_ref: string | null;
  encountertype: "0" | "1";
  sex: string | null;
  birthdate: string | null;
  /** "Y,M,D", e.g. "65,2,13" */
  ageyear: string | null;
  admissiondatetime: string | null;
  dischargedatetime: string | null;
  dischargetype: string | null;
  dischargestatus: string | null;
  ispregnant: string | null;
  ward: string | null;
  department: string | null;
  coverage_type: string | null;
  completeness_status: "complete" | "incomplete";
  missing_detail: string | null;
  disease_group: string | null;
  severity_level: "low" | "medium" | "high";
  case_status: "open" | "in_review" | "approved" | "reopened";
  fetched_at: string;
}

export interface CoverageRow {
  coverage_code: string;
  scheme_family: string | null;
  label_th: string | null;
  label_en: string | null;
  payer: string | null;
}

export interface SectionRow {
  documenttype: string | null;
  fieldname: string | null;
  value: string | null;
  recorddatetime: string | null;
}

export interface DetailCodeRow {
  code: string;
  code_system: "ICD-10" | "ICD-9";
  description: string | null;
  code_role: CodeChip["role"];
  source: "imported_from_imed" | "coder_assigned";
}

export interface DetailOrderRow {
  order_category: OrderCategory;
  imed_source: string | null;
  order_name: string | null;
  ordered_at: string | null;
}

// ---------- PUT /api/cases/{caseId}/codes ----------

/** Request body: CodeEdit[] (a BARE array). Stored verbatim, echoed back as
 *  codeEdits. Only these fields are interpreted at approve time; extra fields
 *  round-trip untouched. */
export interface CodeEdit {
  /** skipped at approve when empty or "???" */
  code: string;
  /** default "ICD-10"; "ICD-9" / "…PCS" → procedure */
  type?: string;
  desc?: string;
  /** truthy → row skipped at approve (unresolved placeholder) */
  missing?: boolean;
  [extra: string]: unknown;
}

// ---------- write responses ----------

export interface OkResponse {
  ok: true;
}

/** POST /api/cases/approve — request {ids: string[], coder?: string} */
export interface ApproveResponse {
  ok: true;
  approved: string[];
  notFound: string[];
  stats: {
    cases_finalized: number;
    status_rows: number;
    coder_codes_created: number;
    mcai_code_rows: number;
  };
}

/** POST /api/demo/reset — request {baselineCoder?: string} */
export interface DemoResetResponse {
  ok: true;
  reopened: number;
  restoredBaseline: number;
}

/**
 * POST /api/sync (all cases) and POST /api/cases/{caseId}/sync (one case) — no
 * request body. Non-destructive pull from the hospital: new cases imported,
 * open cases refreshed (coder work kept), finalized cases skipped. For the
 * per-case route the arrays hold at most that one id; 404 if the hospital has
 * no such case.
 */
export interface SyncResponse {
  ok: true;
  /** newly created cases */
  imported: string[];
  /** existing open cases whose hospital data was re-pulled */
  refreshed: string[];
  /** finalized cases left untouched */
  skippedApproved: string[];
  /** cases that errored mid-sync (batch continues) */
  failed: { caseId: string; error: string }[];
  stats: {
    cases: number;
    sections: number;
    codes: number;
    orders: number;
    chunks: number;
    coverageTypes: number;
  };
}

/** 400 / 404 body. 500s return Spring's default error body — the triggering
 *  action (approve/reopen) is idempotent: retry it. */
export interface ApiError {
  error: string;
}

// ---------- health ----------

export interface Healthz {
  ok: true;
  cases: number;
  db: "pg";
}
