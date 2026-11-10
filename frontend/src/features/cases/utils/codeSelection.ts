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
//
// One concession to the common case (2026-08-25): pressing Approve
// with NOTHING ticked used to be a dead button. It now ticks the top
// card of each column (autoPickIndices) and opens the usual confirm
// dialog, so the ordinary "the AI got it right" case is one click —
// still confirmed, still visible, never an unattended write.
// ============================================================
import type { StoredCode } from "./caseLocal";
import { isIcd9Type } from "./aiSuggestions";
import { ORIGIN_ORDER, originOf } from "./codeOrigin";

/** A row that can be ticked at all — an unresolved "???" placeholder can't. */
export const isPickable = (c: StoredCode) => !c.missing && !!c.code && c.code !== "???";

/** Ticked for approval. Absent flag = not ticked (nothing is pre-selected). */
export const isPicked = (c: StoredCode) => c.selected === true && isPickable(c);

export const pickedCount = (codes: StoredCode[]) => codes.filter(isPicked).length;

/**
 * Ticked codes per system. A case is coded when BOTH sides of it are answered
 * — the diagnosis and the procedure — so approve reads this, not the total:
 * eight ticked diagnoses and no procedure is an unfinished case, and the old
 * "at least one code" gate let it through.
 */
export const pickedBySystem = (codes: StoredCode[]) => {
  const picked = codes.filter(isPicked);
  return {
    icd10: picked.filter((c) => !isIcd9Type(c.type)).length,
    icd9: picked.filter((c) => isIcd9Type(c.type)).length,
  };
};

/** The coder stated outright that this visit had no procedure. */
export const hasNoProcedure = (codes: StoredCode[]) =>
  codes.some((c) => c.noProcedure === true);

/**
 * Which system still has nothing ticked — null once both do.
 *
 * The ICD-9 side is answered EITHER by a ticked procedure code or by the
 * coder saying there was no procedure. Both are positive statements; what is
 * not allowed is approving a case where nobody said anything about the
 * procedures at all.
 */
export function missingSystem(codes: StoredCode[]): "icd10" | "icd9" | "both" | null {
  const { icd10, icd9 } = pickedBySystem(codes);
  const nine = icd9 > 0 || hasNoProcedure(codes);
  if (icd10 === 0 && !nine) return "both";
  if (icd10 === 0) return "icd10";
  if (!nine) return "icd9";
  return null;
}

/** Set / clear the "no procedure performed" statement. Setting it unticks the
 *  procedure codes: a ticked code and "no procedure" contradict each other,
 *  and the statement the coder just made is the one that stands. */
export function setNoProcedure(codes: StoredCode[], next: boolean): StoredCode[] {
  const without = codes.filter((c) => !c.noProcedure);
  if (!next) return without;
  return [
    ...without.map((c) =>
      isIcd9Type(c.type) && isPicked(c) ? { ...c, selected: false } : c),
    { code: "", type: "ICD-9", desc: "", confidence: 0, noProcedure: true },
  ];
}

/** The mirror of the above: ticking a procedure code withdraws the
 *  "no procedure" statement, so the two can never both be true. */
export const clearNoProcedureIfPicked = (codes: StoredCode[]) =>
  codes.some((c) => isIcd9Type(c.type) && isPicked(c))
    ? codes.filter((c) => !c.noProcedure)
    : codes;

/** Suggestions the coder has left out — the count the approve dialog warns about. */
export const unpickedCount = (codes: StoredCode[]) =>
  codes.filter((c) => isPickable(c) && !isPicked(c)).length;

/**
 * Nothing ticked and the coder pressed Approve: the rows to tick on their
 * behalf — the TOP card of each column, one ICD-10 and one ICD-9.
 *
 * "Top" means top ON SCREEN, so this walks the same order CodesColumn draws:
 * origin groups first (manual -> hospital -> AI -> gaps), array order inside a
 * group. With only AI rows present that is the highest-confidence suggestion,
 * because fillEmptySystems stores them ranked.
 *
 * A column that is already answered is left alone — and a standing
 * "no procedure" statement answers the ICD-9 side, so this never silently
 * withdraws it by ticking a procedure code the coder ruled out.
 */
export function autoPickIndices(codes: StoredCode[]): number[] {
  const { icd10, icd9 } = pickedBySystem(codes);
  const rank = (c: StoredCode) => ORIGIN_ORDER.indexOf(originOf(c));
  const topOf = (nine: boolean) =>
    codes
      .map((entry, index) => ({ entry, index }))
      .filter((r) => isPickable(r.entry) && isIcd9Type(r.entry.type) === nine)
      .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)[0]?.index;

  const wanted: (number | undefined)[] = [
    icd10 > 0 ? undefined : topOf(false),
    icd9 > 0 || hasNoProcedure(codes) ? undefined : topOf(true),
  ];
  return wanted.filter((i): i is number => i !== undefined);
}

/** Flip one row by its index in the full array. */
export function toggleAt(codes: StoredCode[], index: number): StoredCode[] {
  return codes.map((c, i) => (i === index ? { ...c, selected: !isPicked(c) } : c));
}

/** Tick / untick a set of rows at once (a column's "select all"). */
export function setPicked(codes: StoredCode[], indices: number[], next: boolean): StoredCode[] {
  const wanted = new Set(indices);
  return codes.map((c, i) => (wanted.has(i) && isPickable(c) ? { ...c, selected: next } : c));
}

/** Tick every row that can be ticked — the approved set of a reopened case. */
export const pickAll = (codes: StoredCode[]): StoredCode[] =>
  codes.map((c) => (isPickable(c) ? { ...c, selected: true } : c));

/**
 * Give a payload saved BEFORE this flow its selection state. Such a payload
 * carries no `selected` key anywhere; treating it as "nothing ticked" would
 * quietly drop work a coder had already done, so their hand-added codes stay
 * ticked and the AI/hospital rows fall back to the new default (untick, coder
 * picks). A payload that already carries the flag is returned untouched.
 *
 * `approvedBefore` is the reopened case (2026-08-25): a flag-less payload was
 * approved WHOLESALE — that is exactly how the backend materialized it — so
 * every row in it comes back ticked, not just the coder's own.
 */
export function withSelectionDefaults(codes: StoredCode[],
                                      approvedBefore = false): StoredCode[] {
  if (codes.some((c) => "selected" in c)) return codes;
  if (approvedBefore) return pickAll(codes);
  return codes.map((c) => (c.manual ? { ...c, selected: true } : c));
}
