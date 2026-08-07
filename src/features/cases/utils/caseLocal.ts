// ============================================================
// caseLocal — per-case code edits, in-memory + server.
// Every save updates a session-scoped cache (instant UI while
// navigating between pages) AND fires PUT /cases/{id}/codes at
// medcode-api. The server copy is the durable one: it comes back
// embedded in the case detail (codeEdits) and wins on load.
// Nothing is persisted in the browser — a reload starts clean
// from the API, so a DB wipe can never leave stale edits behind
// (demo-safety). Report drafts are gone: the report is the
// hospital's record, read-only.
// ============================================================
import { saveCodesRemote } from "../api/casesService";
import type { CodeEntry } from "../types/case.types";

export type StoredCode = CodeEntry & {
  missing?: boolean;
  missingMsg?: string;
  /** true for codes the coder added by hand (shows the "Manually Added" badge) */
  manual?: boolean;
  /**
   * The coder ticked this code for approval (selection-first review, 2026-08-07).
   * Nothing is pre-ticked: a suggestion is only approved once a human picks it.
   * Unticked codes STAY here — they remain visible, editable and re-tickable —
   * and the backend skips them when it materializes the edits at approve
   * (`selected: false` → not written; the key absent means a payload saved
   * before this flow, which the backend still approves wholesale).
   */
  selected?: boolean;
};

const codeEdits = new Map<string, StoredCode[]>();

export function loadCodeEdits(id: string): StoredCode[] | null {
  return codeEdits.get(id) ?? null;
}

export function saveCodeEdits(id: string, codes: StoredCode[]) {
  codeEdits.set(id, codes);
  void saveCodesRemote(id, codes); // no-op (false) without a live server
}
