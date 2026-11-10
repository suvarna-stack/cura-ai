// ============================================================
// Activity Log types — every coder action (approve / add / delete /
// edit / reopen / undo) becomes one ActivityLog entry. Entries live
// in memory for the session; the real backend will persist them as
// a coding_history table (SRS F12).
// ============================================================

export type ActionType =
  | "APPROVE_CASE"
  | "APPROVE_ALL"
  | "DELETE_CODE"
  | "ADD_CODE"
  | "EDIT_CODE"
  | "REOPEN_CASE"
  | "UNDO";

export interface ActivityLog {
  id: string;           // uuid or timestamp-based
  userId: string;
  userName: string;
  actionType: ActionType;
  targetId: string;     // case id or code id
  targetType: "case" | "code";
  description: string;  // human-readable, e.g. "Approved 3 codes for Somchai Jaidee"
  previousState: unknown; // full JSON snapshot for undo restoration
  timestamp: string;    // ISO string — display via formatDateTime
  isUndone: boolean;
}

/** Action types the coder can undo (within UNDO_WINDOW_MS). */
export const UNDOABLE_ACTIONS: ActionType[] = [
  "APPROVE_CASE", "DELETE_CODE", "ADD_CODE", "EDIT_CODE",
];

/** Undo window in milliseconds (24 hours) — a coder reviewing yesterday's queue can
 *  still revert a mistake, while older entries stay frozen as an audit trail. */
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
