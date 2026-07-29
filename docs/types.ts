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

/** The four case collections are mutually exclusive — every case appears in
 *  exactly one of complete / an incompleteGroups group / reopened / finished;
 *  stats.total is their sum. */
export interface CasesPayload {
  stats: { total: number; complete: number; incomplete: number; reopened: number; finished: number };
  /** complete, not yet approved */
  complete: CaseCard[];
  /** sorted by size desc, then label */
  incompleteGroups: IncompleteGroup[];
  /** reopened, awaiting re-approval (human reopen; demo.reset doesn't count) */
  reopened: ReopenedCard[];
  /** approved queue */
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
  /** {category: distinct order names A–Z}; same key order as `orders`. The
   *  items behind each count — feeds the dashboard's nested Study/Item filter.
   *  A category with only nameless rows is absent; {} when the case has none */
  orderNames: Partial<Record<OrderCategory, string[]>>;
  /** cases.admissiondatetime (raw hospital text); null on OPD rows today */
  created_at: string | null;
  /** cases.dischargedatetime — same caveat */
  updated_at: string | null;
  /** always null — no real DRG/revenue source exists */
  revenue_impact: null;
  /** incomplete-origin rows only (incomplete groups + reopened rows that came
   *  from one): human-readable missing labels joined ", ", else "—" */
  missing?: string;
}

/** A human-reopened, not-yet-reapproved case. Lives ONLY in the top-level
 *  `reopened` list — it leaves complete/incompleteGroups until re-approved. */
export interface ReopenedCard extends CaseCard {
  /** always present on these rows (and only here) */
  reopened: true;
  /** reopen "YYYY-MM-DD" from the audit trail, when known */
  reopenedAt?: string;
  /** real reopening actor id, when known */
  reopenedBy?: string;
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
  /** this case's coder audit trail, oldest first (empty array when none) */
  history: CaseHistoryEntry[];
  /** last PUT …/codes payload, echoed verbatim; null when never saved */
  codeEdits: CodeEdit[] | null;
  /** last PUT …/draft text (feature deprecated); null when never saved */
  reportDraft: string | null;
}

/** One row of this case's coder audit trail (medcodeai `coding_history`) — what
 *  coders did to THIS case. `demo.reset` churn is excluded. The frontend also
 *  keeps a separate browser-local activity log; this is the server side. */
export interface CaseHistoryEntry {
  /** the raw action: "approved_single" | "approved_group" | "approved_all" |
   *  "reopened" | "code_assigned" */
  action: string;
  /** acting account id/email (e.g. "demo.coder", an email); "" when unrecorded */
  coder: string;
  /** "YYYY-MM-DD HH:MM:SS" */
  at: string;
  /** the raw action_detail object (e.g. {by, at, codes}); absent when empty */
  detail?: Record<string, unknown>;
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

/** POST /api/cases/approve — request {ids: string[]}. The acting coder is
 *  the logged-in account; a body `coder` field is ignored (2026-07-25). */
export interface ApproveResponse {
  ok: true;
  approved: string[];
  notFound: string[];
  stats: {
    cases_finalized: number;
    status_rows: number;
    coder_codes_created: number;
    /** hospital code writes made by the diff write-back (creates + edits +
     *  cancels); key name kept from the pre-diff contract */
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

// ---------- GET /api/icd-codes ----------

/**
 * One catalog hit. GET /api/icd-codes?q=…&system=…&limit=… returns
 * IcdCatalogHit[] — a BARE array, best matches first (exact code, then code
 * prefix, then the rest). `system` says which catalog table the row came from,
 * so the same `code` may appear under both. `description` is "" when the
 * catalog row has none, never null. 400 on a blank `q` or a `system` outside
 * ICD-10 / ICD-9.
 */
export interface IcdCatalogHit {
  code: string;
  system: "ICD-10" | "ICD-9";
  description: string;
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

// ---------- authentication ----------
//
// Since 2026-07-25 auth guards the WHOLE API except POST /api/auth/login,
// the health probes, and Swagger — case/approve/sync included (401 without a
// token). Login returns an opaque Bearer token; send it as
// `Authorization: Bearer <token>`. /api/admin/** additionally requires the
// "admin" role (403 for a coder token). Approve/reopen record the logged-in
// account as the acting coder; body `coder` fields are ignored.

export type UserRole = "coder" | "admin";
export type UserStatus = "active" | "inactive" | "suspended";

/** POST /api/auth/login — request body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /api/auth/login — response (401 {error} on bad credentials). */
export interface LoginResponse {
  /** opaque Bearer token; store and send as Authorization: Bearer <token> */
  token: string;
  user: {
    id: number;
    email: string;
    fullName: string | null;
    role: UserRole;
  };
}

/** GET /api/auth/me — the account behind the token. */
export interface AuthMe {
  id: number;
  email: string;
  fullName: string | null;
  role: UserRole;
  /** always "active" — the token wouldn't resolve otherwise */
  status: "active";
}

/** An account row — GET /api/admin/accounts returns Account[]; create/update/
 *  status all return a single Account. Never carries the password. */
export interface Account {
  id: number;
  fullName: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** backend text "YYYY-MM-DD HH:MM:SS"; may be null */
  createdAt: string | null;
  /** null until the account's first login */
  lastLoginAt: string | null;
}

/** POST /api/admin/accounts — request (409 on duplicate email). role default "coder". */
export interface CreateAccountRequest {
  fullName: string;
  email: string;
  /** ≥ 8 chars */
  password: string;
  role?: UserRole;
}

/** PUT /api/admin/accounts/{id} — request (all optional; non-blank password re-hashes). */
export interface UpdateAccountRequest {
  fullName?: string;
  email?: string;
  role?: UserRole;
  password?: string;
}

/** PUT /api/admin/accounts/{id}/status — request. */
export interface UpdateStatusRequest {
  status: "active" | "inactive";
}

/** GET /api/admin/dashboard — the four summary cards. */
export interface DashboardStats {
  /** COUNT(role='coder') */
  totalCoderAccounts: number;
  /** accounts whose last_login_at is today */
  activeToday: number;
  /** COUNT(*) FROM cases */
  totalCases: number;
  systemStatus: "operational";
}
