// ============================================================
// codeSelection — which codes the coder has ticked for approval.
//
// The review flow is selection-first (2026-08-07): the AI/hospital
// suggestions arrive UNTICKED and the coder ticks the ones that
// belong on the case, instead of deleting the ones that don't.
// Only ticked codes are written at approve (the backend reads the
// same `selected` flag out of the saved codeEdits payload), so the
// rejected suggestions stay on screen — a coder can change their
// mind without re-typing a code.
// ============================================================
import type { StoredCode } from "./caseLocal";

/** A row that can be ticked at all — an unresolved "???" placeholder can't. */
export const isPickable = (c: StoredCode) => !c.missing && !!c.code && c.code !== "???";

/** Ticked for approval. Absent flag = not ticked (nothing is pre-selected). */
export const isPicked = (c: StoredCode) => c.selected === true && isPickable(c);

export const pickedCount = (codes: StoredCode[]) => codes.filter(isPicked).length;

/** Suggestions the coder has left out — the count the approve dialog warns about. */
export const unpickedCount = (codes: StoredCode[]) =>
  codes.filter((c) => isPickable(c) && !isPicked(c)).length;

/** Flip one row by its index in the full array. */
export function toggleAt(codes: StoredCode[], index: number): StoredCode[] {
  return codes.map((c, i) => (i === index ? { ...c, selected: !isPicked(c) } : c));
}

/** Tick / untick a set of rows at once (a column's "select all"). */
export function setPicked(codes: StoredCode[], indices: number[], next: boolean): StoredCode[] {
  const wanted = new Set(indices);
  return codes.map((c, i) => (wanted.has(i) && isPickable(c) ? { ...c, selected: next } : c));
}

/**
 * Give a payload saved BEFORE this flow its selection state. Such a payload
 * carries no `selected` key anywhere; treating it as "nothing ticked" would
 * quietly drop work a coder had already done, so their hand-added codes stay
 * ticked and the AI/hospital rows fall back to the new default (untick, coder
 * picks). A payload that already carries the flag is returned untouched.
 */
export function withSelectionDefaults(codes: StoredCode[]): StoredCode[] {
  if (codes.some((c) => "selected" in c)) return codes;
  return codes.map((c) => (c.manual ? { ...c, selected: true } : c));
}
