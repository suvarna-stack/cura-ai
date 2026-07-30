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
  // facet fields so the sidebar filters apply to the Finished tab too
  dept?: string;
  group?: string;
  severity?: string | null;
  coverage?: string | null;
  coverageFamily?: string | null;
  encountertype?: string | null;
  orders?: Record<string, number>;
  codes?: { code: string; system: string; role: string }[];
  revenue_impact?: "high" | "medium" | "low";
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
}

export type CaseTab = "complete" | "incomplete" | "reopen" | "finished";

export interface IncompleteGroup {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; style?: CSSProperties }>;
  cases: (IncompleteCase & { group?: string })[];
}
