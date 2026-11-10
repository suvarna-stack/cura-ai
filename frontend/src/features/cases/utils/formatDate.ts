// ============================================================
// Date display helpers — every date shown in the UI goes through
// these (DD/MM/YYYY, the format Thai hospitals use day-to-day).
// Data keeps ISO strings internally; never render a raw ISO string.
// ============================================================

const pad = (n: number) => String(n).padStart(2, "0");

/** "DD/MM/YYYY" (e.g. "14/07/2026"). Accepts a Date or an ISO string. */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "DD/MM/YYYY HH:mm" (e.g. "14/07/2026 09:30"). Accepts a Date or an ISO string. */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a "DD/MM/YYYY" display string back to a Date (local midnight). */
export function parseDisplayDate(str: string): Date {
  const [dd, mm, yyyy] = str.split("/").map(Number);
  return new Date(yyyy, (mm ?? 1) - 1, dd ?? 1);
}
