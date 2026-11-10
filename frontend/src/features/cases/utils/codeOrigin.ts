// ============================================================
// codeOrigin — where each code on a case came from.
//
// A column's list mixes three unrelated kinds of row and the
// coder must not have to guess which is which (2026-08-07):
//
//   manual   — the coder typed it. Their own judgement.
//   hospital — imported from iMed (`source: imported_from_imed`).
//              Already recorded by the hospital, so it is a FACT,
//              not a guess: these rows show NO confidence %.
//   ai       — a RAG suggestion. The only rows a % means anything
//              on, and the only ones the column average counts.
//
// Plus one non-origin bucket that has to live somewhere:
//   gap      — a "???" placeholder standing in for a code the
//              record never documented. Not from anyone; shown
//              last, never tickable.
//
// The marker rides in the saved codeEdits payload (the backend
// round-trips unknown keys verbatim, like `note`), so it survives
// a reload and a hand-off to another coder. Payloads written
// before this existed carry no `origin` key at all — originOf()
// infers one from the older signals rather than mislabelling them.
// ============================================================
import type { StoredCode } from "./caseLocal";

export type CodeOrigin = "manual" | "hospital" | "ai" | "gap";

/** Display order inside every column: the coder's own work first, then what
 *  the hospital already had, then what the AI proposes, then the gaps. */
export const ORIGIN_ORDER: CodeOrigin[] = ["manual", "hospital", "ai", "gap"];

/** Which group a row belongs to. An explicit `origin` always wins; the
 *  fallbacks read a legacy payload (no `origin` anywhere): a hand-added code
 *  carries `manual`, and every seeded hospital row was stamped 100 while RAG
 *  suggestions carry the model's own score. A RAG row that happened to score
 *  100 reads as "hospital" under that fallback — the price of guessing, and
 *  only until the next save rewrites the payload with a real origin. */
export function originOf(c: StoredCode): CodeOrigin {
  if (c.missing) return "gap";
  if (c.origin) return c.origin;
  if (c.manual) return "manual";
  return c.confidence === 100 ? "hospital" : "ai";
}

/** True for rows whose confidence % is a real model score worth showing. */
export const isAiSuggested = (c: StoredCode) => originOf(c) === "ai";

/**
 * Average confidence over the AI rows ONLY — null when the AI suggested
 * nothing. Hospital codes are deliberately excluded: stamping them 100 and
 * folding that into the mean turned "avg 100% confidence" into a statement
 * about the hospital's paperwork rather than about the model.
 */
export function avgAiConfidence(codes: StoredCode[]): number | null {
  const ai = codes.filter(isAiSuggested);
  if (!ai.length) return null;
  return Math.round(ai.reduce((s, c) => s + c.confidence, 0) / ai.length);
}
