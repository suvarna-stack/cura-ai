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
};

const codeEdits = new Map<string, StoredCode[]>();

export function loadCodeEdits(id: string): StoredCode[] | null {
  return codeEdits.get(id) ?? null;
}

export function saveCodeEdits(id: string, codes: StoredCode[]) {
  codeEdits.set(id, codes);
  void saveCodesRemote(id, codes); // no-op (false) without a live server
}
