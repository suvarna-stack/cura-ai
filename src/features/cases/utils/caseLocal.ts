// ============================================================
// caseLocal — POC persistence for per-case edits.
// Dual-write: every save lands in localStorage (offline/static
// fallback, always) AND fires PUT /cases/{id}/codes / .../draft
// at the live server when one is configured (VITE_API_BASE).
// Reads stay localStorage-only; the server's copy comes back
// embedded in the case detail (codeEdits / reportDraft).
// ============================================================
import { saveCodesRemote, saveDraftRemote } from "../api/casesService";
import type { CodeEntry } from "../types/case.types";

export type StoredCode = CodeEntry & {
  missing?: boolean;
  missingMsg?: string;
  /** true for codes the coder added by hand (shows the "Manually Added" badge) */
  manual?: boolean;
};

const codesKey = (id: string) => `codeEdits:${id}`;
const draftKey = (id: string) => `reportDraft:${id}`;

export function loadCodeEdits(id: string): StoredCode[] | null {
  try {
    const raw = localStorage.getItem(codesKey(id));
    return raw ? (JSON.parse(raw) as StoredCode[]) : null;
  } catch {
    return null;
  }
}

export function saveCodeEdits(id: string, codes: StoredCode[]) {
  try { localStorage.setItem(codesKey(id), JSON.stringify(codes)); } catch { /* private mode / quota: demo still works, just unsaved */ }
  void saveCodesRemote(id, codes); // no-op (false) without a live server
}

export function loadReportDraft(id: string): string | null {
  try { return localStorage.getItem(draftKey(id)); } catch { return null; }
}

export function saveReportDraft(id: string, text: string) {
  try { localStorage.setItem(draftKey(id), text); } catch { /* see above */ }
  void saveDraftRemote(id, text); // no-op (false) without a live server
}
