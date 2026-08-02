// ============================================================
// Operation time window helpers (2026-07-30). An ICD-9 code is a
// procedure, and a procedure happens over a time window — the
// backend stores/serves it as "YYYY-MM-DD HH:MM:SS" strings
// (operation_start / operation_end on ICD-9 code rows) and writes
// it to the hospital as date_in/time_in/date_out/time_out on
// approve. These helpers convert between that canonical string
// and <input type="datetime-local"> values.
// ============================================================

/** The hospital's operation-type vocabulary for ICD-9 procedures, verbatim
 *  from its own coder UI / extract (the "Type" dropdown on the operation
 *  grid). Stored as-is and echoed back to iMed as fix_operation_type_id on
 *  approve. "OR" = done in an operating room. First entry = dialog default. */
export const OPERATION_TYPES = ["OR Procedure", "NON OR Procedure", "OTH"];

/** "YYYY-MM-DD HH:MM:SS" for the local clock right now — the default the
 *  Add/Edit dialogs pre-fill so a new ICD-9 code always has a window. */
export function nowOperationTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

/** Canonical → datetime-local input value ("YYYY-MM-DDTHH:MM"). */
export function toInputValue(s?: string | null): string {
  if (!s) return "";
  return s.replace(" ", "T").slice(0, 16);
}

/** datetime-local input value → canonical "YYYY-MM-DD HH:MM:SS". */
export function fromInputValue(v: string): string | undefined {
  if (!v) return undefined;
  const s = v.replace("T", " ");
  return s.length === 16 ? `${s}:00` : s;
}

/** Compact display, "02 Apr 23:55 → 03 Apr 05:05" style but locale-free:
 *  "2026-04-02 23:55 → 05:05" (same-day end drops the date). */
export function formatWindow(start?: string | null, end?: string | null): string | null {
  const s = start ? start.slice(0, 16) : null;
  const e = end ? end.slice(0, 16) : null;
  if (!s && !e) return null;
  if (s && e) {
    const sameDay = s.slice(0, 10) === e.slice(0, 10);
    return `${s} → ${sameDay ? e.slice(11) : e}`;
  }
  return s ? `${s} →` : `→ ${e}`;
}
