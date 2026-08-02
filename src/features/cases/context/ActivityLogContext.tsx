// ============================================================
// Activity Log context — shared audit trail of coder actions.
// Entries live in memory for the session (nothing persisted in the
// browser); the real backend will serve these from coding_history.
// The provider component lives in ActivityLogProvider.tsx.
// ============================================================
import { createContext, useContext } from "react";
import type { ActivityLog } from "../types/activityLog.types";

export type NewActivityLog = Omit<ActivityLog, "id" | "timestamp" | "isUndone">;

type ActivityLogCtxValue = {
  logs: ActivityLog[];
  /** Appends a log entry; returns the new log's id. */
  addLog: (log: NewActivityLog) => string;
  /** Undoes a log entry — only within UNDO_WINDOW_MS and if not already undone. */
  undoLog: (id: string) => boolean;
  /** Clears the whole activity log (drawer footer action). */
  clearLogs: () => void;
};

export const ActivityLogCtx = createContext<ActivityLogCtxValue>({
  logs: [],
  addLog: () => "",
  undoLog: () => false,
  clearLogs: () => {},
});

export const useActivityLog = () => useContext(ActivityLogCtx);
