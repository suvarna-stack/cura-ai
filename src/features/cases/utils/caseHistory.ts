// ============================================================
// caseHistory — reading the server's per-case audit trail.
//
// The detail payload carries `history` (coding_history, oldest
// first). One question is asked of it often enough to live here:
// has this case already been approved once and sent back?
// ============================================================
import type { ApiCaseHistoryEntry } from "../types/api.types";

/** the actions that move a case between "open" and "approved" */
const isApprove = (action: string) => action.startsWith("approved");

/**
 * The case is a REOPENED one: it was approved, and the last thing that
 * happened to it was a reopen. Mirrors the server's own `reopened` flag on
 * the dashboard lists (CasesViewService: last approve/reopen action wins) —
 * derived from the detail's history because the detail payload carries no
 * such flag, and demo.reset rows are already filtered out server-side.
 */
export function isReopenedCase(history?: ApiCaseHistoryEntry[]): boolean {
  const last = (history ?? [])
    .filter((h) => isApprove(h.action) || h.action === "reopened")
    .at(-1);
  return last?.action === "reopened";
}
