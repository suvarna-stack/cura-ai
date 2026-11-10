// ============================================================
// codeRole — which ICD role each saved code carries.
//
// A StoredCode has no explicit role: the Add/Edit dialogs store a
// role-BEARING `type` label ("ICD-10 Primary Diagnosis",
// "ICD-9 Comorbidity", the legacy bare "Comorbidities"), and the
// backend derives the real `code_role` from that label at approve
// time (ApprovalService.materializeEdits). The printed Coding
// Summary has to name the SAME principal diagnosis the hospital
// received, so this is a deliberate mirror of that Java rule —
// including the positional fallback (first unlabelled ICD-10 wins)
// and the ICD9_TYPE / ICD10_TYPE regexes both sides share.
//
// If the backend rule changes, change it here in the same commit.
// ============================================================
import type { StoredCode } from "./caseLocal";

export type CodeRole =
  | "principal_diagnosis"
  | "secondary_diagnosis"
  | "other"
  | "external_cause"
  | "procedure";

/** Shared with CodesColumn.isIcd9 / ApprovalService.ICD9_TYPE. */
const ICD9_TYPE = /icd[- ]?9|pcs/i;
const ICD10_TYPE = /icd[- ]?10/i;

export interface RoledCode {
  entry: StoredCode;
  role: CodeRole;
}

/**
 * True for the rows ApprovalService actually writes to the hospital: no "???"
 * placeholder, no empty code, and not a suggestion the coder left unticked.
 * An ABSENT `selected` key means a payload saved before the checkbox flow —
 * those approve wholesale, exactly as the backend treats them.
 */
export function isApproved(c: StoredCode): boolean {
  if (c.missing) return false;
  const code = (c.code ?? "").trim();
  if (code === "" || code === "???") return false;
  if ("selected" in c && c.selected !== true) return false;
  return true;
}

/**
 * Stamp every code with the role the backend gives it at approve time.
 * Pass the codes in their saved array order — the positional
 * "first ICD-10 is the principal diagnosis" fallback depends on it.
 */
export function assignRoles(codes: StoredCode[]): RoledCode[] {
  let firstIcd10 = true;
  return codes.map((entry) => {
    const type = (entry.type ?? "ICD-10").trim();
    const lower = type.toLowerCase();
    let role: CodeRole;
    if (ICD9_TYPE.test(type)) {
      role = "procedure";
    } else if (lower.includes("external")) {
      role = "external_cause";
    } else if (lower.includes("comorbid")) {
      role = "secondary_diagnosis";
    } else if (lower.includes("other")) {
      role = "other";
    } else if (ICD10_TYPE.test(type)) {
      role = firstIcd10 ? "principal_diagnosis" : "secondary_diagnosis";
      firstIcd10 = false;
    } else {
      role = "other";
    }
    return { entry, role };
  });
}

/** Canonical print order for a diagnosis list (ICD-10-TM Vol. 5 §5). */
export const DIAGNOSIS_ROLE_ORDER: CodeRole[] = [
  "principal_diagnosis", "secondary_diagnosis", "other", "external_cause",
];

export const ROLE_LABEL: Record<CodeRole, { en: string; th: string }> = {
  principal_diagnosis: { en: "Principal Diagnosis",        th: "การวินิจฉัยหลัก" },
  secondary_diagnosis: { en: "Comorbidity",                th: "โรคร่วม" },
  other:               { en: "Other Diagnosis",            th: "การวินิจฉัยอื่น ๆ" },
  external_cause:      { en: "External Cause of Injury",   th: "สาเหตุภายนอกของการบาดเจ็บ" },
  procedure:           { en: "Procedure",                  th: "หัตถการ" },
};
