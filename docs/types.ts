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
  /** grouped by category, max 50 rows per category (see orderCounts for
   *  the true totals) */
  orders: DetailOrderRow[];
  /** true per-category totals for this case — `orders` is capped, these
   *  are not (empty object when the case has no orders) */
  orderCounts: Partial<Record<OrderCategory, number>>;
  /** hospital vital-sign readings, chronological (empty array when none) */
  vitals: DetailVitalRow[];
  /** this case's coder audit trail, oldest first (empty array when none) */
  history: CaseHistoryEntry[];
  /** last PUT …/codes payload, echoed verbatim; null when never saved */
  codeEdits: CodeEdit[] | null;
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
  /** Procedure time window, "YYYY-MM-DD HH:MM:SS" — ICD-9 rows only, always
   *  null on ICD-10 (and null on ICD-9 when the hospital never recorded it). */
  operation_start: string | null;
  operation_end: string | null;
  /** The hospital's operation type, extract vocabulary verbatim ("OR
   *  Procedure" / "NON OR Procedure" / "OTH" / …) — ICD-9 rows only, always
   *  null on ICD-10 (and null when the hospital left it blank). */
  operation_type: string | null;
}

/** One hospital vital-sign reading (the strip above CC/PI/PE in the coder
 *  UI). Every value is raw hospital text or null — blanks are normalized to
 *  null, nothing is parsed or unit-converted. */
export interface DetailVitalRow {
  /** "YYYY-MM-DD HH:MM:SS"; rows sort by this, nulls first */
  measured_at: string | null;
  /** °C */
  temperature: string | null;
  /** blood pressure, mmHg — the UI's "119/80" is systolic "/" diastolic */
  systolic: string | null;
  diastolic: string | null;
  /** beats per minute */
  heart_rate: string | null;
  /** % */
  oxygen_saturation: string | null;
  /** kg / cm */
  weight: string | null;
  height: string | null;
}

export interface DetailOrderRow {
  order_category: OrderCategory;
  imed_source: string | null;
  order_name: string | null;
  ordered_at: string | null;
  /** The raw hospital order row (order_detail JSONB) verbatim. Keys differ
   *  per imed_source: drugs carry dosagesignature / dosageinstruction /
   *  quantity (raw integer text, negative on return/credit rows), lab rows
   *  carry panelname / itemname / itemvalue / itemuom, procedures carry
   *  start/enddatetime… Null when sync stored no source row. */
  detail: Record<string, string | null> | null;
}

// ---------- PUT /api/cases/{caseId}/codes ----------

/** Request body: CodeEdit[] (a BARE array). Stored verbatim, echoed back as
 *  codeEdits. Only these fields are interpreted at approve time; extra fields
 *  round-trip untouched. */
export interface CodeEdit {
  /** skipped at approve when empty or "???" */
  code: string;
  /** Which catalog/role the row means. Any label matching /icd[- ]?9|pcs/i →
   *  ICD-9 procedure; everything else → ICD-10 (default). Role from the
   *  label: "…external…" → external cause of injury, "…comorbid…" →
   *  secondary diagnosis, "…other…" → other, remaining ICD-10 labels →
   *  first row principal, rest secondary. */
  type?: string;
  desc?: string;
  /** Internal coder note — NOT interpreted at approve: stored + echoed
   *  verbatim like any extra field, shown only in our UI, never sent to the
   *  hospital (its write API has no note field). */
  note?: string;
  /** truthy → row skipped at approve (unresolved placeholder) */
  missing?: boolean;
  /** Procedure time window — interpreted on ICD-9 rows only; written to iMed
   *  as date_in/time_in/date_out/time_out on approve. "YYYY-MM-DD HH:MM[:SS]"
   *  or datetime-local's "YYYY-MM-DDTHH:MM"; unparseable → null. The UI
   *  requires it (pre-filled with "now"); the backend is lenient. */
  operation_start?: string;
  operation_end?: string;
  /** Operation type — interpreted on ICD-9 rows only, stored verbatim
   *  (extract vocabulary: "OR Procedure" / "NON OR Procedure" / "OTH");
   *  blank → null. Sent to iMed as fix_operation_type_id when present. */
  operation_type?: string;
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

/**
 * POST /api/demo/snapshot and POST /api/demo/reset — no request body.
 * snapshot freezes the current state of both DBs as the demo baseline;
 * reset restores it (409 before the first snapshot). Values are per-table
 * row counts after the operation.
 */
export interface DemoBaselineResponse {
  ok: true;
  medcodeTables: Record<string, number>;
  imedTables: Record<string, number>;
}

/**
 * POST /api/sync request body — optional, and every field optional. Windows
 * the pull to cases whose VISIT datetime (admissiondatetime, else the datetime
 * encoded in the transaction number) falls in [from, to], filtered by the
 * hospital server-side. Bounds inclusive; "YYYY-MM-DD" (a bare date covers the
 * whole day) or "YYYY-MM-DD HH:MM[:SS]". Malformed → 400. Omit the body (or
 * both fields) to pull everything.
 */
export interface SyncRequest {
  from?: string;
  to?: string;
}

/**
 * POST /api/sync (all cases, optional SyncRequest window) and
 * POST /api/cases/{caseId}/sync (one case — no request body).
 * Non-destructive pull from the hospital: new cases imported, open cases
 * refreshed (coder work kept), finalized cases skipped. For the per-case
 * route the arrays hold at most that one id; 404 if the hospital has no such
 * case.
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
    vitals: number;
    coverageTypes: number;
    /** ICD catalog rows pulled from the hospital's code master (inserted +
     *  blank descriptions filled; existing descriptions never overwritten) */
    catalogCodes: number;
  };
  /** Echo of the request window (null for an omitted side). ABSENT on an
   *  unwindowed sync — and always absent on the per-case route. */
  window?: { from: string | null; to: string | null };
}

// ---------- POST /api/cases/{caseId}/suggest-codes ----------

/** One RAG candidate. `code`/`system` are always present (a candidate missing
 *  either is dropped server-side); `description` and `source` may be null. */
export interface SuggestedCode {
  code: string;
  system: "ICD-10" | "ICD-9";
  description: string | null;
  /** 0-100. Defaults to 70 when RAG returns no score. */
  confidence: number;
  /** The indexed document the suggestion came from. */
  source: string | null;
}

/**
 * No request body. Reads only — the coder saves accepted suggestions via
 * PUT /api/cases/{caseId}/codes. A case with no usable section text returns
 * 200 with codes: [], mode: "none" and zeroed counters, NOT an error.
 * 404 for an unknown case; 500 when the RAG service is unreachable.
 */
export interface SuggestCodesResponse {
  caseId: string;
  codes: SuggestedCode[];
  /** RAG retrieval mode; "none" when there was no clinical text to send. */
  mode: "graph" | "plain" | "none";
  /** Retrieved chunks the suggester saw. */
  hitsUsed: number;
  /** Length of the narrative sent to RAG (capped at 6000). */
  clinicalChars: number;
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

// ---------- AI agent chat ----------
//
// POST /api/agent/chat — the coder app's AI Agent page. Any valid token
// (either role). A thin proxy to the RAG service's /chat: retrieval-grounded
// answer from the local LLM, citing sources; the answer follows the
// question's language (English or Thai). The conversation lives in the
// browser — send prior turns back as `history` on every call; the server is
// stateless. Slow on CPU: expect tens of seconds per answer, and minutes on
// the very first call while the model loads. Response passes through from
// the RAG service verbatim (snake_case).

export interface AgentChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** POST /api/agent/chat — request. */
export interface AgentChatRequest {
  question: string;
  /** prior turns, oldest first; server keeps the most recent 40 */
  history?: AgentChatTurn[];
  /** 16–512; default 256 (kept low for interactive latency) */
  max_new_tokens?: number;
}

/** POST /api/agent/chat — response (RAG pass-through, snake_case). */
export interface AgentChatResponse {
  question: string;
  answer: string;
  /** retrieval strategy used: "graph" | "plain" */
  mode: string;
  /** the chunks the answer was grounded in */
  contexts: {
    text: string;
    /** document source id (e.g. "icd9") */
    source: string;
    score: number;
    /** why this chunk was retrieved (graph explanation or "vector match") */
    via: string;
    metadata: Record<string, unknown>;
  }[];
}
