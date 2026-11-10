// ============================================================
// orderFields — how a raw iMed order row is read for display.
//
// Lives in utils/ rather than beside ReportOrders/LabResults
// because the printable Coding Summary needs exactly the same
// vocabulary: a field the screen calls "Dosage" must not print
// as "dosage_signature", and a lab panel must group identically
// on paper and on screen.
// ============================================================
import type { ApiCaseDetail } from "../types/api.types";

type OrderRow = ApiCaseDetail["orders"][number];

/** iMed field name -> what a coder calls it. Unknown keys fall back to the raw
 *  name, so a new iMed field shows up instead of silently disappearing. */
export const FIELD_LABEL: Record<string, string> = {
  // Both vocabularies on purpose: the hospital renamed every field with the
  // R1-R6 contract (2026-08-19), but order rows synced before that still carry
  // the old extract names, and unlabelled keys fall through to the raw key.
  dosage_signature: "Dosage", dosage_instruction: "Instruction",
  received_at: "Received", panel_name: "Panel", item_name: "Item",
  unit: "Unit", collected_at: "Collected", reported_at: "Reported",
  document_type: "Document", field_name: "Field", subfield_name: "Section",
  recorded_at: "Recorded", operation_type: "Type",
  operation_start: "Start", operation_end: "End",
  icd10_code: "ICD-10", icd9_code: "ICD-9", description: "Description",
  tmt_code: "TMT", panel_tmlt: "TMT", item_tmlt: "TMT", fee_schedule: "Fee",
  dosagesignature: "Dosage", dosageinstruction: "Instruction", quantity: "Qty",
  remark: "Remark", receiveddatetime: "Received",
  panelname: "Panel", itemname: "Item", itemvalue: "Result", itemuom: "Unit",
  collectdatetime: "Collected", reportdatetime: "Reported",
  value: "Value", uom: "Unit", documenttype: "Document",
  fieldname: "Field", subfieldname: "Section", recorddatetime: "Recorded",
  icd: "ICD-9", operationtype: "Type", startdatetime: "Start", enddatetime: "End",
  tmt: "TMT", tmlt: "TMT", paneltmlt: "TMT", itemtmlt: "TMT",
  cgd: "CGD", panelcgd: "CGD", itemcgd: "CGD",
};

/** Shown as the row title instead of repeated in the field list. */
export const TITLE_KEYS = ["name", "panel_name", "panelname"];

/** Group lab rows by panel, keeping first-appearance order. */
export function byPanel(rows: OrderRow[]): Map<string, OrderRow[]> {
  const panels = new Map<string, OrderRow[]>();
  for (const r of rows) {
    const panel = r.detail?.panel_name || r.detail?.panelname || r.order_name || "—";
    const list = panels.get(panel);
    if (list) list.push(r);
    else panels.set(panel, [r]);
  }
  return panels;
}
