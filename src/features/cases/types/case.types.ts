import type { ComponentType, CSSProperties } from 'react'

export type Page = "dashboard" | "case-detail" | "incomplete-detail" | "finished-detail" | "settings" | "analytics" | "agent" | "history";

export interface CompleteCase {
  id: string;
  patient: string;
  /** visit number (= id) and hospital number — what the cards show */
  vn?: string;
  hn?: string | null;
  dept: string;
  group?: string;
  confidence: number;
}

export interface IncompleteCase {
  id: string;
  patient: string;
  vn?: string;
  hn?: string | null;
  dept: string;
  confidence: number;
  missing: string;
  group?: string;
}

export interface FinishedCase {
  id: string;
  patient: string;
  vn?: string;
  hn?: string | null;
  codedDate: string;
  /** responsible coder = the latest person to touch the case */
  coder: string;
  /** everyone who worked it, most recent last (a case can have many coders) */
  coders?: string[];
  drg: string;
  /** ISO string — display via formatDate/formatDateTime */
  created_at?: string;
  /** The date to SHOW: created_at, else decoded from the transaction number. */
  visitDate?: string | null;
  /** "y,m,d" as the extract froze it. */
  age?: string | null;
  // facet fields so the sidebar filters apply to the Finished tab too
  dept?: string;
  group?: string;
  severity?: string | null;
  coverage?: string | null;
  coverageFamily?: string | null;
  encountertype?: string | null;
  orders?: Record<string, number>;
  codes?: { code: string; system: string; role: string; desc?: string | null }[];
  revenue_impact?: "high" | "medium" | "low";
  /** shared "important" flag — see RichCase / the API contract */
  starred?: boolean;
  starredBy?: string | null;
  starredAt?: string | null;
}

export interface CodeEntry {
  code: string;
  type: string;
  desc: string;
  confidence: number;
  /** Procedure time window ("YYYY-MM-DD HH:MM:SS") — ICD-9 codes only; the
   *  backend interprets these at approve and writes them to the hospital. */
  operation_start?: string;
  operation_end?: string;
  /** Operation type ("OR Procedure" / "NON OR Procedure" / "OTH") — ICD-9
   *  codes only; sent to the hospital as fix_operation_type_id on approve. */
  operation_type?: string;
  /** Internal coder note — saved with the working code list (verbatim
   *  round-trip), shown only in our UI, never sent to the hospital. */
  note?: string;
}

export type CaseTab = "complete" | "incomplete" | "reopen" | "finished";

export interface IncompleteGroup {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; style?: CSSProperties }>;
  cases: (IncompleteCase & { group?: string })[];
}
